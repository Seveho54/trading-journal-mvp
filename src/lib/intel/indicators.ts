// lib/intel/indicators.ts
// Professional indicator core (pure functions, no IO).
// Goal: compute indicators from OHLC candles and read a snapshot at a timestamp index.

export type Candle = {
  t: number; // unix ms
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
};

function isFiniteNum(x: any): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export function sma(values: number[], period: number): Array<number | null> {
  if (period <= 0) return values.map(() => null);
  const out: Array<number | null> = new Array(values.length).fill(null);
  let sum = 0;

  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: number[], period: number): Array<number | null> {
  if (period <= 0) return values.map(() => null);
  const out: Array<number | null> = new Array(values.length).fill(null);
  const k = 2 / (period + 1);

  // seed with SMA(period)
  let seedSum = 0;
  for (let i = 0; i < values.length; i++) {
    seedSum += values[i];

    if (i === period - 1) {
      let prev = seedSum / period;
      out[i] = prev;

      for (let j = i + 1; j < values.length; j++) {
        prev = values[j] * k + prev * (1 - k);
        out[j] = prev;
      }
      break;
    }
  }

  return out;
}

/**
 * RSI (Wilder) 0..100
 * - Uses Wilder smoothing (RMA) for average gains/losses.
 */
export function rsi(values: number[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period + 1) return out;

  let gainSum = 0;
  let lossSum = 0;

  // initial avg gain/loss from first period diffs
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += -diff;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const rs = avgLoss === 0 ? Infinity : avgGain / avgLoss;
  out[period] = 100 - 100 / (1 + rs);

  // Wilder smoothing thereafter
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    const rs2 = avgLoss === 0 ? Infinity : avgGain / avgLoss;
    out[i] = 100 - 100 / (1 + rs2);
  }

  return out;
}

/**
 * ATR (Wilder)
 * True Range: max(H-L, abs(H-prevC), abs(L-prevC))
 */
export function atr(candles: Candle[], period = 14): Array<number | null> {
  const out: Array<number | null> = new Array(candles.length).fill(null);
  if (period <= 0 || candles.length < period + 1) return out;

  const tr: number[] = new Array(candles.length).fill(0);

  for (let i = 0; i < candles.length; i++) {
    const cur = candles[i];
    const prevC = i > 0 ? candles[i - 1].c : cur.c;
    const a = cur.h - cur.l;
    const b = Math.abs(cur.h - prevC);
    const c = Math.abs(cur.l - prevC);
    tr[i] = Math.max(a, b, c);
  }

  // initial ATR = SMA(TR, period) at index=period
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  let prev = sum / period;
  out[period] = prev;

  // Wilder smoothing
  for (let i = period + 1; i < candles.length; i++) {
    prev = (prev * (period - 1) + tr[i]) / period;
    out[i] = prev;
  }

  return out;
}

/**
 * MACD = EMA(fast) - EMA(slow)
 * Signal = EMA(macd, signalPeriod)
 * Hist = macd - signal
 */
export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): {
  macd: Array<number | null>;
  signal: Array<number | null>;
  hist: Array<number | null>;
} {
  const eFast = ema(values, fast);
  const eSlow = ema(values, slow);

  const macdLine: Array<number | null> = new Array(values.length).fill(null);
  for (let i = 0; i < values.length; i++) {
    const a = eFast[i];
    const b = eSlow[i];
    macdLine[i] = a != null && b != null ? a - b : null;
  }

  // signal EMA needs numeric array; we keep nulls but feed 0 for nulls then null-out before warmup
  const macdNums = macdLine.map((x) => (x == null ? 0 : x));
  const sig = ema(macdNums, signalPeriod);

  // remove signal values before macd becomes valid in a stable way
  // conservative: only allow signal where macdLine is non-null AND sig non-null
  const signal: Array<number | null> = new Array(values.length).fill(null);
  const hist: Array<number | null> = new Array(values.length).fill(null);

  for (let i = 0; i < values.length; i++) {
    if (macdLine[i] != null && sig[i] != null) {
      signal[i] = sig[i];
      hist[i] = (macdLine[i] as number) - (sig[i] as number);
    }
  }

  return { macd: macdLine, signal, hist };
}

// -----------------------------
// Snapshot helpers
// -----------------------------
export function closes(candles: Candle[]) {
  return candles.map((c) => c.c);
}

/**
 * Find candle index for a given timestamp (ms).
 * Strategy: last candle with t <= ts (floor).
 */
export function indexAtOrBefore(candles: Candle[], ts: number): number | null {
  if (!candles.length || !isFiniteNum(ts)) return null;

  // binary search
  let lo = 0;
  let hi = candles.length - 1;

  if (candles[0].t > ts) return null;
  if (candles[hi].t <= ts) return hi;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = candles[mid].t;

    if (t === ts) return mid;
    if (t < ts) lo = mid + 1;
    else hi = mid - 1;
  }

  // hi ends as last index with t <= ts
  return hi >= 0 ? hi : null;
}

/**
 * Build a compact indicator snapshot at a candle index.
 * You can extend later (support/resistance etc.)
 */
export function buildIndicatorSnapshotAtIndex(
  candles: Candle[],
  idx: number,
): {
  rsi14: number | null;
  macd: number | null;
  macdSignal: number | null;
  ema20: number | null;
  ema50: number | null;
  atr14: number | null;
} {
  const c = closes(candles);

  const r14 = rsi(c, 14);
  const m = macd(c, 12, 26, 9);
  const e20 = ema(c, 20);
  const e50 = ema(c, 50);
  const a14 = atr(candles, 14);

  return {
    rsi14: r14[idx] ?? null,
    macd: m.macd[idx] ?? null,
    macdSignal: m.signal[idx] ?? null,
    ema20: e20[idx] ?? null,
    ema50: e50[idx] ?? null,
    atr14: a14[idx] ?? null,
  };
}

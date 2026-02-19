// lib/intel/marketData.ts
// Fetch + cache OHLC candles (Binance public) + indicator snapshot at a timestamp.
//
// This is intentionally minimal + robust:
// - in-memory cache
// - normalized symbols
// - binance klines endpoint
// - helpers: getCandles(), getSnapshotAt()

import {
  type Candle,
  indexAtOrBefore,
  buildIndicatorSnapshotAtIndex,
} from "./indicators";

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

type CacheKey = string;

type CandleSeries = {
  key: CacheKey;
  symbol: string;
  tf: Timeframe;
  candles: Candle[];
  fetchedAt: number; // unix ms
};

const MEM = new Map<CacheKey, CandleSeries>();

// tune later
const TTL_MS = 5 * 60 * 1000; // 5 min cache
const MAX_LIMIT = 1000; // Binance max default for klines is 1000
const TARGET_CANDLES = 2500; // enough for EMA/MACD stability

function nowMs() {
  return Date.now();
}

function normalizeSymbolForBinance(sym: string) {
  // Positions might be "BTCUSDT", "BTC/USDT", "BTC-USDT", "BTCUSDT:USDT"
  const s = String(sym ?? "")
    .toUpperCase()
    .trim();

  // common cases:
  // "BTC/USDT" => "BTCUSDT"
  // "BTC-USDT" => "BTCUSDT"
  // "BTCUSDT" stays
  // If user provides "BTC" only, we assume USDT (simple MVP)
  const cleaned = s
    .replaceAll("/", "")
    .replaceAll("-", "")
    .replaceAll(":", "")
    .replaceAll("PERP", "")
    .replaceAll("FUTURES", "")
    .trim();

  // if no quote, assume USDT
  const hasQuote =
    cleaned.endsWith("USDT") ||
    cleaned.endsWith("BUSD") ||
    cleaned.endsWith("USDC") ||
    cleaned.endsWith("BTC") ||
    cleaned.endsWith("ETH");

  return hasQuote ? cleaned : `${cleaned}USDT`;
}

function cacheKey(
  symbol: string,
  tf: Timeframe,
  startTime?: number,
  endTime?: number,
) {
  return `${symbol}__${tf}__${startTime ?? 0}__${endTime ?? 0}`;
}

function parseBinanceKlines(raw: any[]): Candle[] {
  // Binance kline array:
  // [
  // 0 open time
  // 1 open
  // 2 high
  // 3 low
  // 4 close
  // 5 volume
  // 6 close time
  // ...
  // ]
  const out: Candle[] = [];
  for (const k of raw) {
    if (!k || k.length < 6) continue;
    const t = Number(k[0]);
    const o = Number(k[1]);
    const h = Number(k[2]);
    const l = Number(k[3]);
    const c = Number(k[4]);
    const v = Number(k[5]);
    const tc = Number(k[6]);

    if (
      Number.isFinite(t) &&
      Number.isFinite(o) &&
      Number.isFinite(h) &&
      Number.isFinite(l) &&
      Number.isFinite(c)
    ) {
      out.push({
        t,
        tc: Number.isFinite(tc) ? tc : undefined,
        o,
        h,
        l,
        c,
        v: Number.isFinite(v) ? v : undefined,
      });
    }
  }
  // ensure sorted
  out.sort((a, b) => a.t - b.t);
  return out;
}

async function fetchBinanceCandles(args: {
  symbol: string;
  tf: Timeframe;
  startTime?: number;
  endTime?: number;
  limit?: number;
}): Promise<Candle[]> {
  const { symbol, tf, startTime, endTime, limit } = args;

  const sp = new URLSearchParams();
  sp.set("symbol", symbol);
  sp.set("interval", tf);
  sp.set("limit", String(Math.min(Math.max(limit ?? 500, 50), MAX_LIMIT)));

  if (startTime && Number.isFinite(startTime))
    sp.set("startTime", String(startTime));
  if (endTime && Number.isFinite(endTime)) sp.set("endTime", String(endTime));

  const url = `https://api.binance.com/api/v3/klines?${sp.toString()}`;

  const res = await fetch(url, {
    method: "GET",
    // public endpoint; keep it cache-friendly but not too sticky
    headers: { accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Binance klines failed (${res.status}): ${text.slice(0, 160)}`,
    );
  }

  const json = (await res.json()) as any[];
  return parseBinanceKlines(json);
}

// Public API ------------------------------------

export async function getCandles(args: {
  symbol: string;
  tf: Timeframe;
  // window: either you pass {startTime,endTime} OR just "lookbackDays"
  startTime?: number;
  endTime?: number;
  lookbackDays?: number;
  limit?: number;
  force?: boolean;
}): Promise<Candle[]> {
  const sym = normalizeSymbolForBinance(args.symbol);
  const tf = args.tf;

  const endTime = args.endTime ?? nowMs();
  const lookbackDays = args.lookbackDays ?? 60;
  const startTime =
    args.startTime ?? Math.max(0, endTime - lookbackDays * 24 * 60 * 60 * 1000);

  const key = cacheKey(sym, tf, startTime, endTime);

  const cached = MEM.get(key);

  const fresh = cached && nowMs() - cached.fetchedAt < TTL_MS && !args.force;

  if (fresh) return cached!.candles;

  // --- paged fetch so indicators are stable (Binance limit is 1000 per call) ---
  const want = Math.min(Math.max(args.limit ?? TARGET_CANDLES, 200), 5000);

  let all: Candle[] = [];
  let cursorEnd = endTime;

  // safety loop (max 6 requests)
  for (let i = 0; i < 6 && all.length < want; i++) {
    const chunk = await fetchBinanceCandles({
      symbol: sym,
      tf,
      startTime,
      endTime: cursorEnd,
      limit: MAX_LIMIT,
    });

    if (!chunk.length) break;

    // prepend chunk (older -> newer)
    all = [...chunk, ...all];

    // move cursor backward: next call ends before oldest candle in this chunk
    const oldest = chunk[0]!.t;
    cursorEnd = oldest - 1;

    // stop if we've reached startTime
    if (cursorEnd <= startTime) break;
  }

  // de-dup + sort
  const dedup = new Map<number, Candle>();
  for (const c of all) dedup.set(c.t, c);
  const candles = Array.from(dedup.values()).sort((a, b) => a.t - b.t);

  MEM.set(key, {
    key,
    symbol: sym,
    tf,
    candles,
    fetchedAt: nowMs(),
  });

  return candles;
}

function tfToMs(tf: Timeframe): number {
  switch (tf) {
    case "1m":
      return 60_000;
    case "5m":
      return 5 * 60_000;
    case "15m":
      return 15 * 60_000;
    case "1h":
      return 60 * 60_000;
    case "4h":
      return 4 * 60 * 60_000;
    case "1d":
      return 24 * 60 * 60_000;
    default:
      return 15 * 60_000;
  }
}

function indexLastClosedBefore(
  candles: Candle[],
  ts: number,
  tf: Timeframe,
): number | null {
  if (!candles?.length) return null;

  const tfMs = tfToMs(tf);

  let best: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const open = candles[i].t;
    const close = open + tfMs;

    // we only allow fully closed candles
    if (close <= ts) {
      best = i;
    } else {
      break;
    }
  }

  return best;
}

/**
 * Snapshot at an ISO timestamp (entry/exit) for a symbol + timeframe.
 * Returns indicators computed from candles around that time.
 */
export async function getSnapshotAt(args: {
  symbol: string;
  tf: Timeframe;
  isoTime: string; // entry/exit time
  lookbackDays?: number;
}): Promise<{
  idx: number | null;
  candle: Candle | null;
  indicators: ReturnType<typeof buildIndicatorSnapshotAtIndex> | null;
}> {
  const ts = new Date(args.isoTime).getTime();
  if (!Number.isFinite(ts)) {
    return { idx: null, candle: null, indicators: null };
  }

  // We need enough candles BEFORE idx so RSI/MACD/EMA are stable.
  // Rough warmup: MACD(12/26/9) needs >= ~35-50 candles, EMA50 needs 50+.
  const MIN_WARMUP = 80;

  async function tryFetch(lookbackDays: number) {
    const candles = await getCandles({
      symbol: args.symbol,
      tf: args.tf,
      endTime: ts,
      lookbackDays,
      limit: 1000,
      force: true, // important during debugging
    });

    const idx = indexAtOrBefore(candles, ts);
    if (idx == null) return { idx: null, candle: null, indicators: null };

    const candle = candles[idx] ?? null;
    const indicators = candle
      ? buildIndicatorSnapshotAtIndex(candles, idx)
      : null;

    return { idx, candle, indicators };
  }

  // 1) first attempt (default ~120d)
  const first = await tryFetch(args.lookbackDays ?? 120);

  // If we have enough history, accept it
  if (first.idx != null && first.idx >= MIN_WARMUP && first.indicators) {
    return first;
  }

  // 2) fallback with larger lookback (more history)
  const second = await tryFetch(360);

  // Return the best we have (second usually fixes accuracy)
  if (second.idx != null && second.indicators) return second;

  return first;
}

// Optional: clear cache (useful in dev)
export function clearMarketCache() {
  MEM.clear();
}

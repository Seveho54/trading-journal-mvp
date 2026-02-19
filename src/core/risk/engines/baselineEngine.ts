// src/core/risk/engines/baselineEngine.ts

import type { RiskEvent } from "../schema";

/**
 * Behavior Baselines Engine (v1)
 *
 * Input: normalized trade/position close events (realized results)
 * Output: rolling baselines with robust stats (median + IQR + MAD)
 *
 * IMPORTANT:
 * - Deterministic
 * - Explainable: we return samples used + window definition
 *
 * This engine does NOT "judge" - it computes "your normal".
 */

export type BaselineWindow = "LAST_20_TRADES" | "LAST_7D" | "LAST_30D";

export type BehaviorMetricKey =
  | "tradeFrequencyPerDay"
  | "netPerTrade"
  | "lossSizeAbs"
  | "winSizeAbs"
  | "winRate"
  | "holdingMinutes"
  | "notionalPerTrade"
  | "effectiveLeverage"; // optional if you emit it on events

export type RobustStats = {
  n: number;

  median: number | null;

  // dispersion
  iqr: number | null; // Q3-Q1
  mad: number | null; // median absolute deviation

  // "normal band" (robust)
  // recommended: [Q1, Q3] or [median - 2*MAD, median + 2*MAD]
  q1: number | null;
  q3: number | null;
};

export type BehaviorBaseline = {
  window: BaselineWindow;
  range: {
    startTs: number | null;
    endTs: number | null;
    // for LAST_20_TRADES: we still provide start/end from sample timestamps
  };

  metrics: Partial<Record<BehaviorMetricKey, RobustStats>>;

  evidence: {
    tradesUsed: number;
    notes: string[];
  };
};

type TradeSample = {
  ts: number; // close time
  net: number; // netProfit
  holdingMinutes?: number | null;
  notional?: number | null; // abs(notional) if known
  effectiveLeverage?: number | null; // if known
};

export function buildBehaviorBaselines(args: {
  events: RiskEvent[];

  nowTs?: number; // default: last trade ts or Date.now()
}): BehaviorBaseline[] {
  const samples = extractTradeSamples(args.events);
  const nowTs = Number.isFinite(Number(args.nowTs))
    ? Number(args.nowTs)
    : samples.length
      ? samples[samples.length - 1].ts
      : Date.now();

  // Rolling selections
  const last20 = samples.slice(-20);
  const last7d = samples.filter((s) => s.ts >= nowTs - days(7));
  const last30d = samples.filter((s) => s.ts >= nowTs - days(30));

  const baselines: BehaviorBaseline[] = [];

  baselines.push(
    computeBaseline({
      window: "LAST_20_TRADES",
      samples: last20,
      nowTs,
      startTs: last20[0]?.ts ?? null,
      endTs: last20[last20.length - 1]?.ts ?? null,
      notes: ["Rolling window by trade count (last 20 closed trades)."],
    }),
  );

  baselines.push(
    computeBaseline({
      window: "LAST_7D",
      samples: last7d,
      nowTs,
      startTs: nowTs - days(7),
      endTs: nowTs,
      notes: ["Rolling window by time (last 7 days)."],
    }),
  );

  baselines.push(
    computeBaseline({
      window: "LAST_30D",
      samples: last30d,
      nowTs,
      startTs: nowTs - days(30),
      endTs: nowTs,
      notes: ["Rolling window by time (last 30 days)."],
    }),
  );

  return baselines;
}

/**
 * Optional helper: build a single "active baseline" that you’ll use for deviations.
 * Recommendation: prefer LAST_20_TRADES for behavior (reacts quickly) and LAST_30D for stability.
 */
export function pickActiveBaseline(baselines: BehaviorBaseline[]) {
  const by = new Map(baselines.map((b) => [b.window, b]));
  return {
    fast: by.get("LAST_20_TRADES") ?? null,
    stable: by.get("LAST_30D") ?? null,
    weekly: by.get("LAST_7D") ?? null,
  };
}

/* -----------------------------
   Internals
----------------------------- */

function extractTradeSamples(events: RiskEvent[]): TradeSample[] {
  // We accept various event shapes.
  // Ideally you emit: type="POSITION_CLOSED" or "TRADE_CLOSED" with netProfit, closeTs, holdingMin, notional, leverage
  const TYPES = new Set([
    "POSITION_CLOSED",
    "TRADE_CLOSED",
    "POSITION",
    "TRADE", // fallback
  ]);

  const out: TradeSample[] = [];

  for (const e of events) {
    if (!e || typeof e !== "object") continue;

    // @ts-ignore
    const type = String((e as any).type ?? "");
    if (!TYPES.has(type)) continue;

    // @ts-ignore
    const ts = Number((e as any).ts ?? (e as any).timestamp ?? NaN);
    if (!Number.isFinite(ts)) continue;

    // @ts-ignore
    const data = (e as any).data ?? e;

    const net =
      safeNum(data.netProfit) ??
      safeNum(data.net) ??
      safeNum(data.realizedPnl) ??
      safeNum(data.pnl) ??
      null;

    if (net == null) continue;

    const holdingMinutes =
      safeNum(data.holdingMinutes) ??
      safeNum(data.holdMin) ??
      safeNum(data.durationMin) ??
      null;

    // notional can be provided by position close event (abs qty*price)
    const notional =
      safeNum(data.notional) ??
      safeNum(data.entryNotional) ??
      safeNum(data.exitNotional) ??
      null;

    const effectiveLeverage =
      safeNum(data.effectiveLeverage) ??
      safeNum(data.effLev) ??
      safeNum(data.leverage) ??
      null;

    out.push({
      ts,
      net,
      holdingMinutes,
      notional: notional != null ? Math.abs(notional) : null,
      effectiveLeverage:
        effectiveLeverage != null ? Math.abs(effectiveLeverage) : null,
    });
  }

  out.sort((a, b) => a.ts - b.ts);
  return out;
}

function computeBaseline(args: {
  window: BaselineWindow;
  samples: TradeSample[];
  nowTs: number;
  startTs: number | null;
  endTs: number | null;
  notes: string[];
}): BehaviorBaseline {
  const s = args.samples;

  const notes = [...args.notes];
  if (s.length < 8) {
    notes.push("Low sample size: metrics may be unstable (n<8).");
  }

  const nets = s.map((x) => x.net).filter(isFiniteNum);
  const holding = s.map((x) => x.holdingMinutes ?? null).filter(isFiniteNum);
  const notionals = s.map((x) => x.notional ?? null).filter(isFiniteNum);
  const levs = s.map((x) => x.effectiveLeverage ?? null).filter(isFiniteNum);

  const wins = nets.filter((n) => n > 0).length;
  const losses = nets.filter((n) => n < 0).length;
  const denom = wins + losses;
  const winRate = denom > 0 ? wins / denom : null;

  // Frequency/day is derived from time window (7d,30d) OR from sample span (last20)
  const freqPerDay = computeTradeFrequencyPerDay(
    s,
    args.window,
    args.startTs,
    args.endTs,
  );

  // Loss size / win size (absolute)
  const lossSizes = nets.filter((n) => n < 0).map((n) => Math.abs(n));
  const winSizes = nets.filter((n) => n > 0).map((n) => Math.abs(n));

  const metrics: BehaviorBaseline["metrics"] = {
    tradeFrequencyPerDay: robustStats(freqPerDay != null ? [freqPerDay] : []),
    netPerTrade: robustStats(nets),
    winRate: robustStats(winRate != null ? [winRate] : []),
    lossSizeAbs: robustStats(lossSizes),
    winSizeAbs: robustStats(winSizes),
    holdingMinutes: robustStats(holding),
    notionalPerTrade: robustStats(notionals),
    effectiveLeverage: robustStats(levs),
  };

  // Clean: if empty -> null stats to keep UI clean later
  for (const k of Object.keys(metrics) as BehaviorMetricKey[]) {
    const m = metrics[k];
    if (!m || m.n === 0) delete metrics[k];
  }

  return {
    window: args.window,
    range: { startTs: args.startTs, endTs: args.endTs },
    metrics,
    evidence: {
      tradesUsed: s.length,
      notes,
    },
  };
}

function computeTradeFrequencyPerDay(
  samples: TradeSample[],
  window: BaselineWindow,
  startTs: number | null,
  endTs: number | null,
): number | null {
  if (!samples.length) return null;

  // For time windows we know exact duration
  if (
    (window === "LAST_7D" || window === "LAST_30D") &&
    startTs &&
    endTs &&
    endTs > startTs
  ) {
    const daysSpan = (endTs - startTs) / days(1);
    return daysSpan > 0 ? samples.length / daysSpan : null;
  }

  // For last-20 window: use span between first and last sample (fallback min 1 day)
  const a = samples[0].ts;
  const b = samples[samples.length - 1].ts;
  const spanDays = Math.max(1, (b - a) / days(1));
  return samples.length / spanDays;
}

/* -----------------------------
   Robust statistics
----------------------------- */

function robustStats(values: number[]): RobustStats {
  const v = values
    .filter(isFiniteNum)
    .slice()
    .sort((a, b) => a - b);
  const n = v.length;
  if (!n) {
    return { n: 0, median: null, iqr: null, mad: null, q1: null, q3: null };
  }

  const med = quantile(v, 0.5);
  const q1 = quantile(v, 0.25);
  const q3 = quantile(v, 0.75);
  const iqr = q3 != null && q1 != null ? q3 - q1 : null;

  const absDev = v.map((x) => Math.abs(x - (med ?? 0))).sort((a, b) => a - b);
  const mad = quantile(absDev, 0.5);

  return { n, median: med, q1, q3, iqr, mad };
}

function quantile(sorted: number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base];
  const b = sorted[base + 1];
  if (b == null) return a;
  return a + rest * (b - a);
}

/* -----------------------------
   utils
----------------------------- */

function days(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

function safeNum(x: any): number | null {
  const n =
    typeof x === "number"
      ? x
      : typeof x === "string"
        ? Number(x.replace(",", "."))
        : Number(x);
  return Number.isFinite(n) ? n : null;
}

function isFiniteNum(x: any): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

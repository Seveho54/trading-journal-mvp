// src/core/risk/engines/dailyLossEngine.ts

import { RiskEvent } from "../schema";

/**
 * Daily loss engine:
 * - deterministisch
 * - erklärt "heute" anhand Equity-Zeitreihe
 *
 * Wichtig:
 * - Wir nutzen Equity Events aus dem Event Store (z.B. EQUITY_SNAPSHOT).
 * - Wenn du später Bitget live hast, pushst du Equity regelmäßig rein (z.B. alle 10–30s).
 */

export type DailyLossAnalysis = {
  dayKeyUTC: string; // YYYY-MM-DD (UTC)

  dayStartTs: number | null; // start of day (UTC) in ms
  dayStartEquity: number | null;

  currentTs: number | null;
  currentEquity: number | null;

  dailyPnl: number | null; // currentEquity - dayStartEquity
  dailyPnlPct: number | null; // dailyPnl / dayStartEquity

  intradayPeakEquity: number | null; // max equity since day start
  intradayDrawdown: number | null; // peak - current
  intradayDrawdownPct: number | null; // (peak-current)/peak

  limit: {
    dailyLossLimitPct: number; // e.g. 0.03 for 3%
    dailyLossLimitAbs: number | null; // dayStartEquity * limitPct
  };

  distanceToLimit: {
    remainingAbs: number | null; // how much more you can lose today
    remainingPctOfStart: number | null; // remainingAbs/dayStartEquity
    breached: boolean;
  };

  evidence: {
    // for explainability:
    equitySamplesUsed: number;
    source: "EVENTS" | "EMPTY";
  };
};

export function analyzeDailyLoss(args: {
  events: RiskEvent[];
  // if caller already has currentEquity from equityEngine, pass it in to avoid mismatch
  currentEquity?: number | null;
  currentTs?: number | null;
  dailyLossLimitPct?: number; // default 0.03 (=3%)
  // future: user timezone; currently strictly UTC for determinism
}): DailyLossAnalysis {
  const {
    events,
    currentEquity: currentEquityOverride,
    currentTs: currentTsOverride,
  } = args;

  const dailyLossLimitPct = clamp01(args.dailyLossLimitPct ?? 0.03);

  // 1) Build equity time series from events
  const series = extractEquitySeries(events);

  // 2) Determine "now"
  const nowTs = Number.isFinite(Number(currentTsOverride))
    ? Number(currentTsOverride)
    : series.length
      ? series[series.length - 1].ts
      : Date.now();

  const dayStartTs = startOfDayUTC(nowTs);
  const dayKeyUTC = dayKeyFromTsUTC(nowTs);

  // 3) Determine dayStartEquity (first sample at/after day start, or last before)
  const dayStartEquity = pickEquityAtOrNear(series, dayStartTs);

  // 4) Determine current equity
  const currentEquity =
    currentEquityOverride != null && Number.isFinite(currentEquityOverride)
      ? currentEquityOverride
      : series.length
        ? series[series.length - 1].equity
        : null;

  // If we have no start equity or current equity, return safe "unknown"
  if (!(dayStartEquity != null && currentEquity != null)) {
    return {
      dayKeyUTC,
      dayStartTs,
      dayStartEquity: dayStartEquity ?? null,

      currentTs: nowTs ?? null,
      currentEquity,

      dailyPnl: null,
      dailyPnlPct: null,

      intradayPeakEquity: null,
      intradayDrawdown: null,
      intradayDrawdownPct: null,

      limit: {
        dailyLossLimitPct,
        dailyLossLimitAbs:
          dayStartEquity != null ? dayStartEquity * dailyLossLimitPct : null,
      },

      distanceToLimit: {
        remainingAbs: null,
        remainingPctOfStart: null,
        breached: false,
      },

      evidence: {
        equitySamplesUsed: series.length,
        source: series.length ? "EVENTS" : "EMPTY",
      },
    };
  }

  // 5) Daily PnL
  const dailyPnl = currentEquity - dayStartEquity;
  const dailyPnlPct = dayStartEquity > 0 ? dailyPnl / dayStartEquity : null;

  // 6) Intraday peak + drawdown
  const intraday = series.filter((x) => x.ts >= dayStartTs);
  const intradayPeakEquity = intraday.length
    ? intraday.reduce((m, x) => Math.max(m, x.equity), -Infinity)
    : currentEquity;

  const peak = Number.isFinite(intradayPeakEquity)
    ? intradayPeakEquity
    : currentEquity;

  const intradayDrawdown = peak - currentEquity;
  const intradayDrawdownPct = peak > 0 ? intradayDrawdown / peak : null;

  // 7) Daily loss limit
  const dailyLossLimitAbs = dayStartEquity * dailyLossLimitPct;

  // how much loss used today (only losses count)
  const lossUsedAbs = Math.max(0, -dailyPnl); // if pnl is -200 => lossUsedAbs=200
  const remainingAbs = Math.max(0, dailyLossLimitAbs - lossUsedAbs);
  const remainingPctOfStart =
    dayStartEquity > 0 ? remainingAbs / dayStartEquity : null;

  const breached = lossUsedAbs >= dailyLossLimitAbs && dailyLossLimitAbs > 0;

  return {
    dayKeyUTC,
    dayStartTs,
    dayStartEquity,

    currentTs: nowTs,
    currentEquity,

    dailyPnl,
    dailyPnlPct,

    intradayPeakEquity: peak,
    intradayDrawdown,
    intradayDrawdownPct,

    limit: { dailyLossLimitPct, dailyLossLimitAbs },

    distanceToLimit: {
      remainingAbs,
      remainingPctOfStart,
      breached,
    },

    evidence: {
      equitySamplesUsed: series.length,
      source: series.length ? "EVENTS" : "EMPTY",
    },
  };
}

/* -----------------------------
   Helpers
----------------------------- */

type EquityPoint = { ts: number; equity: number };

function extractEquitySeries(events: RiskEvent[]): EquityPoint[] {
  // Support multiple event shapes.
  // Expected: event.type === "EQUITY_SNAPSHOT" with data.equity
  // but we accept "ACCOUNT_STATE" etc.

  const TYPES = new Set([
    "EQUITY_SNAPSHOT",
    "ACCOUNT_EQUITY",
    "ACCOUNT_STATE",
    "RISK_STATE",
  ]);

  const out: EquityPoint[] = [];

  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    // @ts-ignore
    const type = String((e as any).type ?? "");
    // @ts-ignore
    const ts = Number((e as any).ts);
    if (!TYPES.has(type) || !Number.isFinite(ts)) continue;

    // @ts-ignore
    const data = (e as any).data ?? {};

    const equity =
      safeNum(data.equity) ??
      safeNum(data.walletEquity) ??
      safeNum(data.totalEquity) ??
      safeNum(data?.account?.equity) ??
      safeNum(data?.account?.walletEquity) ??
      null;

    if (equity == null) continue;

    out.push({ ts, equity });
  }

  out.sort((a, b) => a.ts - b.ts);
  // de-dup same ts keep last
  const dedup: EquityPoint[] = [];
  for (const p of out) {
    const last = dedup[dedup.length - 1];
    if (last && last.ts === p.ts) {
      last.equity = p.equity;
    } else {
      dedup.push(p);
    }
  }
  return dedup;
}

function pickEquityAtOrNear(
  series: EquityPoint[],
  targetTs: number,
): number | null {
  if (!series.length) return null;

  // Find first point >= targetTs
  for (const p of series) {
    if (p.ts >= targetTs) return p.equity;
  }

  // If none >=, use last available (shouldn’t happen in normal "today" flow)
  return series[series.length - 1]?.equity ?? null;
}

function startOfDayUTC(ts: number) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  return Date.UTC(y, m, day, 0, 0, 0, 0);
}

function dayKeyFromTsUTC(ts: number) {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

function clamp01(x: number) {
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(1, x));
}

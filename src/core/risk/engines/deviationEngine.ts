// src/core/risk/engines/deviationEngine.ts

import type { BehaviorBaseline } from "./baselineEngine";

import { pickActiveBaseline } from "./baselineEngine";
import type { RiskEvent } from "../types";

/**
 * Deviation Detection Engine (v1)
 *
 * Input:
 * - normalized RiskEvents (closed positions/trades)
 * - behavior baselines (rolling, robust)
 *
 * Output:
 * - top deviations (max 3), each: rule + why + evidence + action hint
 *
 * Design goals:
 * - deterministic
 * - explainable
 * - robust: uses median + MAD/IQR from baselines
 */

export type DeviationId =
  | "TRADE_FREQ_SPIKE"
  | "SIZE_DRIFT"
  | "LEVERAGE_SPIKE"
  | "LOSS_STREAK"
  | "RAPID_FIRE_TRADING";

export type DeviationSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type Deviation = {
  id: DeviationId;
  severity: DeviationSeverity;

  title: string;

  // explainability
  rule: string; // short rule statement
  why: string; // human explanation

  evidence: {
    now: Record<string, number | null>;
    baseline: Record<string, number | null>;
    deltas: Record<string, number | null>;
    windowUsed: string; // e.g. "LAST_20_TRADES"
  };

  // action hint (later mapped to actions engine)
  actionHint: {
    label: string;
    params?: Record<string, any>;
  };
};

export type DeviationPack = {
  deviations: Deviation[]; // sorted, max 3
  meta: {
    computedAt: number;
    tradeSamplesUsed: number;
    notes: string[];
  };
};

// -----------------------------
// Public API
// -----------------------------

export function detectDeviations(args: {
  events: RiskEvent[];
  baselines: BehaviorBaseline[];
  nowTs?: number;

  // user guardrails can plug in later (optional)
  dailyLossLimitPct?: number; // not used here yet
}): DeviationPack {
  const samples = extractTradeSamples(args.events);
  const nowTs = Number.isFinite(Number(args.nowTs))
    ? Number(args.nowTs)
    : samples.length
      ? samples[samples.length - 1].ts
      : Date.now();

  console.log("sample used", samples.length);

  const active = pickActiveBaseline(args.baselines);
  // "fast baseline" = last 20 trades, reacts quickly
  const base = active.fast ?? active.stable ?? active.weekly;

  if (!base) {
    return {
      deviations: [],
      meta: {
        computedAt: nowTs,
        tradeSamplesUsed: samples.length,
        notes: ["No baseline available yet."],
      },
    };
  }

  const notes: string[] = [];

  // Compute "NOW" metrics (very recent behavior)
  // We intentionally use a short window: last 10 closed trades + last 24h trades.
  const last10 = samples.slice(-10);
  const last24h = samples.filter((s) => s.ts >= nowTs - hours(24));

  const nowFreqPerDay = computeTradeFreqPerDay(last24h, 1); // 24h => 1 day
  const nowMedianNotional = median(last10.map((x) => x.notional).filter(isNum));
  const nowMedianLev = median(
    last10.map((x) => x.effectiveLeverage).filter(isNum),
  );

  const lossStreak = computeLossStreak(samples);

  const rapidFire = computeRapidFire(samples); // time between trades shrinking

  // Baseline values (robust medians)
  const baseFreq = base.metrics.tradeFrequencyPerDay?.median ?? null;
  const baseNotional = base.metrics.notionalPerTrade?.median ?? null;
  const baseLev = base.metrics.effectiveLeverage?.median ?? null;

  // For robust deviation scoring we prefer MAD if available
  const baseNotionalMad = base.metrics.notionalPerTrade?.mad ?? null;
  const baseLevMad = base.metrics.effectiveLeverage?.mad ?? null;
  const baseFreqMad = base.metrics.tradeFrequencyPerDay?.mad ?? null; // usually n=1, will be null

  const deviations: Deviation[] = [];

  // -----------------------------
  // 1) Trade frequency spike
  // -----------------------------
  if (baseFreq != null && nowFreqPerDay != null && baseFreq > 0) {
    const ratio = nowFreqPerDay / baseFreq;
    if (ratio >= 1.8) {
      deviations.push({
        id: "TRADE_FREQ_SPIKE",
        severity: ratio >= 2.5 ? "CRITICAL" : ratio >= 2.1 ? "HIGH" : "MEDIUM",
        title: "Trade frequency spike",
        rule: `Trades/day (last 24h) > 1.8× your baseline`,
        why: `You traded much more than your normal pace. This often correlates with overtrading and lower decision quality.`,
        evidence: {
          now: { tradesPerDay: round2(nowFreqPerDay) },
          baseline: { tradesPerDay: round2(baseFreq) },
          deltas: { ratio: round2(ratio) },
          windowUsed: base.window,
        },
        actionHint: {
          label: "Reduce trading frequency (cooldown)",
          params: { cooldownMin: 30 },
        },
      });
    }
  } else {
    notes.push(
      "Frequency spike check skipped (not enough baseline or recent trades).",
    );
  }

  // -----------------------------
  // 2) Size drift (notional)
  // -----------------------------
  // We use median(notional last10) vs baseline median, with MAD for robustness.
  if (baseNotional != null && nowMedianNotional != null && baseNotional > 0) {
    const ratio = nowMedianNotional / baseNotional;

    // robust "z" using MAD (approx). If MAD missing, fallback to ratio only.
    const z = robustZ(nowMedianNotional, baseNotional, baseNotionalMad);

    const drift = ratio >= 1.5 || (z != null && z >= 3);
    if (drift) {
      const sev =
        ratio >= 2.0 || (z != null && z >= 4)
          ? "CRITICAL"
          : ratio >= 1.7 || (z != null && z >= 3.5)
            ? "HIGH"
            : "MEDIUM";

      deviations.push({
        id: "SIZE_DRIFT",
        severity: sev,
        title: "Position size drift",
        rule: `Median notional (last 10 trades) is significantly above your baseline`,
        why: `Your recent position sizing is larger than your normal behavior. Size drift often happens after wins/losses and increases drawdown risk.`,
        evidence: {
          now: { medianNotional: round2(nowMedianNotional) },
          baseline: {
            medianNotional: round2(baseNotional),
            mad: baseNotionalMad != null ? round2(baseNotionalMad) : null,
          },
          deltas: { ratio: round2(ratio), z: z != null ? round2(z) : null },
          windowUsed: base.window,
        },
        actionHint: {
          label: "Reduce size to baseline",
          params: { targetNotional: round2(baseNotional) },
        },
      });
    }
  } else {
    notes.push("Size drift check skipped (missing notional or baseline).");
  }

  // -----------------------------
  // 3) Leverage spike (if you have it)
  // -----------------------------
  if (baseLev != null && nowMedianLev != null && baseLev > 0) {
    const ratio = nowMedianLev / baseLev;
    const z = robustZ(nowMedianLev, baseLev, baseLevMad);

    if (ratio >= 1.4 || (z != null && z >= 3)) {
      const sev =
        ratio >= 1.8 || (z != null && z >= 4)
          ? "CRITICAL"
          : ratio >= 1.6 || (z != null && z >= 3.5)
            ? "HIGH"
            : "MEDIUM";

      deviations.push({
        id: "LEVERAGE_SPIKE",
        severity: sev,
        title: "Effective leverage spike",
        rule: `Median effective leverage (last 10 trades) > 1.4× baseline`,
        why: `Your leverage is higher than usual. This increases liquidation risk and makes small mistakes expensive.`,
        evidence: {
          now: { medianEffLev: round2(nowMedianLev) },
          baseline: {
            medianEffLev: round2(baseLev),
            mad: baseLevMad != null ? round2(baseLevMad) : null,
          },
          deltas: { ratio: round2(ratio), z: z != null ? round2(z) : null },
          windowUsed: base.window,
        },
        actionHint: {
          label: "Reduce leverage",
          params: { targetEffLev: round2(baseLev) },
        },
      });
    }
  } else {
    notes.push("Leverage spike check skipped (no leverage metric present).");
  }

  // -----------------------------
  // 4) Loss streak
  // -----------------------------
  if (lossStreak >= 2) {
    const sev: DeviationSeverity =
      lossStreak >= 4 ? "CRITICAL" : lossStreak >= 3 ? "HIGH" : "MEDIUM";
    deviations.push({
      id: "LOSS_STREAK",
      severity: sev,
      title: "Loss streak detected",
      rule: `Consecutive losses ≥ 2`,
      why: `After a loss streak, many traders escalate risk or revenge-trade. This is a high-risk phase.`,
      evidence: {
        now: { lossStreak },
        baseline: {},
        deltas: {},
        windowUsed: base.window,
      },
      actionHint: {
        label: "Pause trading (cooldown)",
        params: { cooldownMin: lossStreak >= 3 ? 60 : 30 },
      },
    });
  }

  // -----------------------------
  // 5) Rapid-fire trading (shrinking time between trades)
  // -----------------------------
  if (rapidFire != null && rapidFire.isRapid) {
    deviations.push({
      id: "RAPID_FIRE_TRADING",
      severity: rapidFire.severity,
      title: "Rapid-fire trading",
      rule: `Time between trades is shrinking sharply`,
      why: `Your pace is accelerating (shorter gaps between trades). This often indicates emotional trading or chasing.`,
      evidence: {
        now: { recentMedianGapMin: round2(rapidFire.recentMedianGapMin) },
        baseline: { prevMedianGapMin: round2(rapidFire.prevMedianGapMin) },
        deltas: { ratio: round2(rapidFire.ratio) },
        windowUsed: base.window,
      },
      actionHint: { label: "Force a cooldown", params: { cooldownMin: 20 } },
    });
  }

  // -----------------------------
  // Rank & limit to max 3 (OS philosophy)
  // -----------------------------
  const ranked = deviations
    .sort((a, b) => severityScore(b.severity) - severityScore(a.severity))
    .slice(0, 3);

  return {
    deviations: ranked,
    meta: {
      computedAt: nowTs,
      tradeSamplesUsed: samples.length,
      notes,
    },
  };
}

// -----------------------------
// Internals
// -----------------------------

type TradeSample = {
  ts: number; // close time
  net: number;
  notional: number | null;
  effectiveLeverage: number | null;
};

function extractTradeSamples(events: RiskEvent[]): TradeSample[] {
  const TYPES = new Set([
    "TRADE_CLOSE",
    "POSITION_CLOSE",
    "POSITION_CLOSED",
    "TRADE_CLOSED",
  ]);
  const out: TradeSample[] = [];

  for (const e of events) {
    if (!e || typeof e !== "object") continue;

    const type = String((e as any).type ?? "");
    if (!TYPES.has(type)) continue;

    const ts = Number((e as any).ts ?? (e as any).timestamp ?? NaN);
    if (!Number.isFinite(ts)) continue;

    const data = (e as any).data ?? e;

    const realized = safeNum((data as any).realizedPnl) ?? 0;
    const fee = safeNum((data as any).fee) ?? 0;
    const net = realized - fee;

    const notional =
      safeNum((e as any)?.meta?.notional) ??
      safeNum((data as any)?.meta?.notional) ??
      (safeNum((data as any).qty) != null &&
      safeNum((data as any).price) != null
        ? Math.abs(Number((data as any).qty) * Number((data as any).price))
        : null);

    const effLev =
      safeNum((data as any)?.meta?.effectiveLeverage) ??
      safeNum((data as any)?.meta?.leverage) ??
      null;

    out.push({
      ts,
      net,
      notional: notional != null ? Math.abs(notional) : null,
      effectiveLeverage: effLev != null ? Math.abs(effLev) : null,
    });
  }

  out.sort((a, b) => a.ts - b.ts);
  return out;
}

function computeLossStreak(samples: TradeSample[]) {
  let streak = 0;
  for (let i = samples.length - 1; i >= 0; i--) {
    const n = samples[i].net;
    if (n < 0) streak += 1;
    else if (n > 0) break;
    else {
      // net==0 doesn't break streak, but doesn't increase it
      continue;
    }
  }
  return streak;
}

/**
 * Detect shrinking time between trades:
 * Compare median gap of last 5 vs previous 10 gaps.
 */
function computeRapidFire(samples: TradeSample[]): null | {
  isRapid: boolean;
  severity: DeviationSeverity;
  recentMedianGapMin: number;
  prevMedianGapMin: number;
  ratio: number;
} {
  if (samples.length < 20) return null;

  const gapsMin: number[] = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].ts - samples[i - 1].ts;
    if (dt > 0) gapsMin.push(dt / 60000);
  }
  if (gapsMin.length < 15) return null;

  const recent = gapsMin.slice(-5);
  const prev = gapsMin.slice(-15, -5);

  const rMed = median(recent.filter(isNum));
  const pMed = median(prev.filter(isNum));
  if (rMed == null || pMed == null || pMed <= 0) return null;

  const ratio = rMed / pMed; // <1 means faster
  const isRapid = ratio <= 0.6;

  if (!isRapid)
    return {
      isRapid: false,
      severity: "LOW",
      recentMedianGapMin: rMed,
      prevMedianGapMin: pMed,
      ratio,
    };

  const severity: DeviationSeverity =
    ratio <= 0.35 ? "CRITICAL" : ratio <= 0.45 ? "HIGH" : "MEDIUM";

  return {
    isRapid,
    severity,
    recentMedianGapMin: rMed,
    prevMedianGapMin: pMed,
    ratio,
  };
}

function computeTradeFreqPerDay(
  samples: TradeSample[],
  daysSpan: number,
): number | null {
  if (!samples.length) return null;
  if (!daysSpan || daysSpan <= 0) return null;
  return samples.length / daysSpan;
}

function robustZ(now: number, med: number, mad: number | null): number | null {
  if (mad == null || !Number.isFinite(mad) || mad <= 1e-12) return null;
  // 1.4826 scales MAD to be comparable to std dev under normality
  const denom = 1.4826 * mad;
  return Math.abs(now - med) / denom;
}

function severityScore(s: DeviationSeverity) {
  switch (s) {
    case "CRITICAL":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
  }
}

function hours(n: number) {
  return n * 60 * 60 * 1000;
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

function isNum(x: any): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function median(v: number[]): number | null {
  const a = v
    .filter(isNum)
    .slice()
    .sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

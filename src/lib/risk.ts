// src/lib/risk.ts
// ✅ Goal: make Risk metrics match Dashboard (buildPositionStats + byDayPositions.totalNetProfit)
// ✅ Minimal change surface: keep your public API + return shape, only fix inputs + normalization

import { buildPositionStats } from "@/core/analytics/positionStats";

type AnyObj = Record<string, any>;

function num(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : parseFloat(String(x ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function safeDateKey(x: any) {
  // Accept already-normalized day keys like "2026-01-07"
  if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
  // Try parse date
  const d = new Date(x);
  if (!Number.isFinite(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[]) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(v);
}

/**
 * Drawdown on an equity array.
 * IMPORTANT: pct only makes sense if peak > 0. If peak <= 0, we return null to avoid nonsense like 360%,
 * which happens when peak equity is small/negative.
 */
function computeMaxDrawdown(equity: number[]) {
  if (!equity.length) return { maxDD: 0, maxDDPct: null as number | null };

  let peak = equity[0];
  let maxDD = 0; // negative number (or 0)
  let maxDDPct: number | null = null;

  for (let i = 0; i < equity.length; i++) {
    const e = equity[i];
    if (e > peak) peak = e;

    const dd = e - peak; // <= 0
    if (dd < maxDD) {
      maxDD = dd;

      // pct relative to peak only if peak > 0
      if (peak > 0) maxDDPct = Math.abs(dd) / peak;
      else maxDDPct = null;
    }
  }

  return { maxDD, maxDDPct };
}

type EquityPoint = { t: string; equity: number };

export type DrawdownPeriod = {
  start: string;
  trough: string;
  recovery: string | null;
  depth: number;
  depthPct: number | null;
  durationDays: number;
  timeToTroughDays: number;
  recoveryDays: number | null;
};

function dayToMs(day: string) {
  const d = new Date(day + "T00:00:00");
  return d.getTime();
}

function diffDays(a: string, b: string) {
  const ms = dayToMs(b) - dayToMs(a);
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Detect drawdown periods from an equity curve.
 * Assumes points are sorted by date ascending.
 */
export function detectDrawdownPeriods(points: EquityPoint[]): DrawdownPeriod[] {
  if (!points || points.length < 2) return [];

  let peak = points[0].equity;
  let peakDate = points[0].t;

  let inDD = false;

  let ddStart = "";
  let ddPeak = 0;

  let troughEquity = Infinity;
  let troughDate = "";

  const periods: DrawdownPeriod[] = [];

  for (let i = 1; i < points.length; i++) {
    const p = points[i];

    if (!inDD && p.equity >= peak) {
      peak = p.equity;
      peakDate = p.t;
      continue;
    }

    if (!inDD && p.equity < peak) {
      inDD = true;
      ddStart = p.t;
      ddPeak = peak;

      troughEquity = p.equity;
      troughDate = p.t;
    }

    if (inDD) {
      if (p.equity < troughEquity) {
        troughEquity = p.equity;
        troughDate = p.t;
      }

      if (p.equity >= ddPeak) {
        const depth = troughEquity - ddPeak; // negative
        const depthPct = ddPeak > 0 ? Math.abs(depth) / ddPeak : null;

        const durationDays = diffDays(ddStart, p.t);
        const timeToTroughDays = diffDays(ddStart, troughDate);
        const recoveryDays = diffDays(troughDate, p.t);

        periods.push({
          start: ddStart,
          trough: troughDate,
          recovery: p.t,
          depth,
          depthPct,
          durationDays,
          timeToTroughDays,
          recoveryDays,
        });

        inDD = false;
        peak = p.equity;
        peakDate = p.t;

        ddStart = "";
        ddPeak = 0;
        troughEquity = Infinity;
        troughDate = "";
      }
    }
  }

  if (inDD) {
    const last = points[points.length - 1];
    const depth = troughEquity - ddPeak; // negative
    const depthPct = ddPeak > 0 ? Math.abs(depth) / ddPeak : null;

    const durationDays = diffDays(ddStart, last.t);
    const timeToTroughDays = diffDays(ddStart, troughDate);

    periods.push({
      start: ddStart,
      trough: troughDate,
      recovery: null,
      depth,
      depthPct,
      durationDays,
      timeToTroughDays,
      recoveryDays: null,
    });
  }

  return periods;
}

// -------------------------
// Normalizers to match Dashboard
// -------------------------
function getPosNet(p: AnyObj) {
  // Dashboard uses p.netProfit in multiple places (biggest win/loss)
  return num(
    p?.netProfit ??
      p?.totalNetProfit ??
      p?.netPnl ??
      p?.pnl ??
      p?.profit ??
      p?.realizedPnl ??
      p?.totalRealizedPnl ??
      0,
    0,
  );
}

function getPosCloseTime(p: AnyObj) {
  return (
    p?.closeTime ??
    p?.closeTimestamp ??
    p?.closedAt ??
    p?.exitTime ??
    p?.time ??
    p?.ts ??
    null
  );
}

function getByDayPnl(d: AnyObj) {
  // Dashboard equityRawPoints uses d.totalNetProfit
  return num(d?.totalNetProfit ?? 0, 0);
}

export function computeRiskSummary(
  input: { positions: AnyObj[]; trades: AnyObj[]; byDayPositions?: AnyObj[] },
  opts?: { startEquity?: number },
) {
  const startEquity = opts?.startEquity ?? 0;

  const positions = Array.isArray(input.positions) ? input.positions : [];
  const trades = Array.isArray(input.trades) ? input.trades : [];
  const byDay = Array.isArray(input.byDayPositions) ? input.byDayPositions : [];

  // ✅ 0) Core KPIs EXACTLY like Dashboard
  // (This is the most important step to eliminate mismatches.)
  const core = buildPositionStats(positions as any);

  // -------------------------
  // 1) Build daily equity points (MATCH Dashboard)
  // -------------------------
  let equityPoints: EquityPoint[] = [];

  if (byDay.length > 0) {
    const mapped = [...byDay]
      .filter((d) => d?.day)
      .sort((a, b) => String(a.day).localeCompare(String(b.day)))
      .map((d) => ({
        t: String(d.day),
        pnl: getByDayPnl(d),
      }));

    let eq = startEquity;
    equityPoints = mapped.map((m) => {
      eq += m.pnl;
      return { t: m.t, equity: eq };
    });
  } else {
    // Fallback: aggregate positions net by day (close date)
    const mapped = [...positions]
      .map((p) => {
        const key = safeDateKey(getPosCloseTime(p));
        return { t: key, pnl: getPosNet(p) };
      })
      .filter((x) => !!x.t)
      .sort((a, b) => String(a.t).localeCompare(String(b.t)));

    const byDayAgg = new Map<string, number>();
    for (const m of mapped) {
      const k = String(m.t);
      byDayAgg.set(k, (byDayAgg.get(k) ?? 0) + m.pnl);
    }

    const keys = Array.from(byDayAgg.keys()).sort();
    let eq = startEquity;
    equityPoints = keys.map((k) => {
      eq += byDayAgg.get(k) ?? 0;
      return { t: k, equity: eq };
    });
  }

  const equityArr = equityPoints.map((p) => p.equity);
  const { maxDD: equityMaxDD, maxDDPct: equityMaxDDPct } =
    computeMaxDrawdown(equityArr);

  const drawdownPeriods = detectDrawdownPeriods(equityPoints);
  const currentDrawdownPeriod =
    drawdownPeriods.length &&
    drawdownPeriods[drawdownPeriods.length - 1].recovery === null
      ? drawdownPeriods[drawdownPeriods.length - 1]
      : null;

  const lastEquity = equityArr.length
    ? equityArr[equityArr.length - 1]
    : startEquity;
  const peakEquity = equityArr.length ? Math.max(...equityArr) : startEquity;
  const currentDrawdown = lastEquity - peakEquity; // <= 0

  const currentDrawdownPct =
    peakEquity !== 0 ? Math.abs(currentDrawdown) / Math.abs(peakEquity) : null;

  // “Wie viel muss ich verdienen bis Break-even?”
  const distanceToBreakeven = Math.max(0, -currentDrawdown);

  // “Wie viel % Return brauche ich von HEUTE aus, um Break-even zu erreichen?”
  const requiredReturnPct =
    lastEquity !== 0 ? distanceToBreakeven / Math.abs(lastEquity) : null;

  // -------------------------
  // 2) Win/Loss stats (MATCH Dashboard by using core)
  // -------------------------
  const winRate = num(core.winRate ?? 0, 0);
  const avgWin = num(core.avgWin ?? 0, 0);
  const avgLoss = num(core.avgLoss ?? 0, 0); // usually negative
  const winLossRatio =
    avgLoss !== 0 ? Math.abs(avgWin) / Math.abs(avgLoss) : null;

  // ✅ Total PnL must match Dashboard totalNetProfit
  const totalPnl = num(core.totalNetProfit ?? 0, 0);

  // -------------------------
  // 3) Loss streak (chronological positions by close time)
  // -------------------------
  const posSorted = [...positions].sort((a: AnyObj, b: AnyObj) => {
    const ta = new Date(getPosCloseTime(a) ?? 0).getTime();
    const tb = new Date(getPosCloseTime(b) ?? 0).getTime();
    return ta - tb;
  });

  const pnlSeries = posSorted.length
    ? posSorted.map(getPosNet)
    : // fallback to trades if there are no positions
      (trades ?? []).map((t: AnyObj) =>
        num(
          t?.netProfit ??
            t?.totalNetProfit ??
            t?.netPnl ??
            t?.pnl ??
            t?.profit ??
            t?.realizedPnl ??
            0,
          0,
        ),
      );

  let currentLossStreak = 0;
  let maxLossStreak = 0;
  let cur = 0;

  for (const x of pnlSeries) {
    if (x < 0) {
      cur += 1;
      if (cur > maxLossStreak) maxLossStreak = cur;
    } else {
      cur = 0;
    }
  }

  let endStreak = 0;
  for (let i = pnlSeries.length - 1; i >= 0; i--) {
    if (pnlSeries[i] < 0) endStreak++;
    else break;
  }
  currentLossStreak = endStreak;

  // -------------------------
  // 4) Drawdown numbers (MATCH Dashboard)
  // -------------------------
  // Dashboard KPI shows stats.maxDrawdown from buildPositionStats (positions-based).
  // So: use core.maxDrawdown for the headline "Max Drawdown" to match 1:1.
  const maxDD = num(core.maxDrawdown ?? 0, 0);

  // Pct is only meaningful on equity curve; keep from equity curve but safe:
  const maxDDPct =
    equityMaxDDPct != null && equityMaxDDPct > 0 ? equityMaxDDPct : null;

  // -------------------------
  // 5) Simple stability score v1 (rule-based)
  // -------------------------
  let stabilityScore = 100;

  stabilityScore -= Math.min(60, (Math.abs(maxDD) / 50) * 10);
  stabilityScore -= Math.min(25, maxLossStreak * 2);

  if (winLossRatio != null && winLossRatio < 1) {
    stabilityScore -= Math.min(20, (1 - winLossRatio) * 20);
  }

  stabilityScore = Math.max(0, Math.round(stabilityScore));

  // -------------------------
  // 6) Trades per day (Overtrading proxy)
  // -------------------------
  let daysWithTrades = 0;
  let totalTrades = 0;

  if (byDay.length > 0) {
    daysWithTrades = byDay.length;
    totalTrades = byDay.reduce(
      (a, d) => a + num(d?.trades ?? d?.positions ?? 0, 0),
      0,
    );
  } else {
    const dayMap = new Map<string, number>();
    for (const p of positions) {
      const k = safeDateKey(getPosCloseTime(p));
      if (!k) continue;
      dayMap.set(k, (dayMap.get(k) ?? 0) + 1);
    }
    daysWithTrades = dayMap.size;
    totalTrades = Array.from(dayMap.values()).reduce((a, b) => a + b, 0);
  }

  const tradesPerDayAvg = daysWithTrades > 0 ? totalTrades / daysWithTrades : 0;

  // -------------------------
  // 7) Risk inconsistency proxy (CV of abs pnl)
  // -------------------------
  const absPnL = pnlSeries
    .map((x) => Math.abs(x))
    .filter((x) => Number.isFinite(x) && x > 0);
  const absMean = mean(absPnL);
  const absStd = std(absPnL);
  const riskInconsistencyCV = absMean > 0 ? absStd / absMean : 0;

  type RiskMode = "NORMAL" | "CAUTION" | "RECOVERY" | "CRITICAL";

  const ddPctForMode = currentDrawdownPct ?? 0;

  let riskMode: RiskMode = "NORMAL";

  // Hard triggers zuerst (CRITICAL)
  if (ddPctForMode >= 0.2 || maxLossStreak >= 9) {
    riskMode = "CRITICAL";
  } else if (
    ddPctForMode >= 0.1 ||
    maxLossStreak >= 6 ||
    (winLossRatio != null && winLossRatio < 0.9)
  ) {
    riskMode = "RECOVERY";
  } else if (
    ddPctForMode >= 0.05 ||
    maxLossStreak >= 4 ||
    riskInconsistencyCV > 1.0
  ) {
    riskMode = "CAUTION";
  }

  // Trading Allowed (Decision)
  const tradingAllowed =
    riskMode === "CRITICAL"
      ? "NO"
      : riskMode === "RECOVERY"
        ? "LIMITED"
        : "YES";

  // -------------------------
  // 8) Tradevion Risk Score v1 (rule-based)
  // -------------------------
  const breakdown: {
    key: string;
    label: string;
    penalty: number;
    value: string;
  }[] = [];
  let riskScore = 100;

  const ddPct = maxDDPct ?? null;
  let ddPenalty = 0;
  if (ddPct != null) {
    if (ddPct > 0.3) ddPenalty = 30;
    else if (ddPct > 0.2) ddPenalty = 20;
    else if (ddPct > 0.1) ddPenalty = 10;
  }
  if (ddPenalty > 0) {
    riskScore -= ddPenalty;
    breakdown.push({
      key: "drawdown",
      label: "Drawdown",
      penalty: ddPenalty,
      value: `${(ddPct! * 100).toFixed(1)}%`,
    });
  }

  let streakPenalty = 0;
  if (maxLossStreak >= 9) streakPenalty = 25;
  else if (maxLossStreak >= 6) streakPenalty = 15;
  else if (maxLossStreak >= 4) streakPenalty = 10;

  if (streakPenalty > 0) {
    riskScore -= streakPenalty;
    breakdown.push({
      key: "lossStreak",
      label: "Loss streak",
      penalty: streakPenalty,
      value: String(maxLossStreak),
    });
  }

  let incPenalty = 0;
  if (riskInconsistencyCV > 1.2) incPenalty = 20;
  else if (riskInconsistencyCV > 0.8) incPenalty = 10;

  if (incPenalty > 0) {
    riskScore -= incPenalty;
    breakdown.push({
      key: "riskInconsistency",
      label: "Risk inconsistency",
      penalty: incPenalty,
      value: `CV ${riskInconsistencyCV.toFixed(2)}`,
    });
  }

  let overPenalty = 0;
  if (tradesPerDayAvg > 10) overPenalty = 20;
  else if (tradesPerDayAvg > 5) overPenalty = 10;

  if (overPenalty > 0) {
    riskScore -= overPenalty;
    breakdown.push({
      key: "overtrading",
      label: "Overtrading",
      penalty: overPenalty,
      value: `${tradesPerDayAvg.toFixed(1)}/day`,
    });
  }

  riskScore = Math.max(0, Math.min(100, Math.round(riskScore)));

  const riskBand =
    riskScore >= 75 ? "stable" : riskScore >= 50 ? "risky" : "dangerous";

  // -------------------------
  // 9) Reasons + Actions (v1)
  // -------------------------
  const reasons: string[] = [];
  const actions: string[] = [];

  if (maxDD < -100) reasons.push("Large max drawdown");
  else if (maxDD < -50) reasons.push("Max drawdown is noticeable");
  else reasons.push("Drawdown is under control");

  if (maxLossStreak >= 6) reasons.push("Long loss streaks");
  else if (maxLossStreak >= 3)
    reasons.push("Loss streaks are hurting consistency");
  else reasons.push("Loss streaks are controlled");

  if (winLossRatio != null && winLossRatio < 1)
    reasons.push("Average loss is bigger than average win");
  else if (winLossRatio != null && winLossRatio < 1.5)
    reasons.push("Win/Loss ratio can improve");
  else reasons.push("Win/Loss ratio looks healthy");

  if (maxDD < -100)
    actions.push("Cut risk per trade by 25% until drawdown recovers.");
  else
    actions.push(
      "Set a max daily loss limit (e.g. 2R) and stop trading when hit.",
    );

  if (maxLossStreak >= 3)
    actions.push(
      "Add a hard stop: after 3 losing trades, take a break for the day.",
    );
  else
    actions.push(
      "Track your first 3 trades/day—avoid increasing size after losses.",
    );

  if (winLossRatio != null && winLossRatio < 1)
    actions.push(
      "Reduce average loss: tighten invalidation / respect stop-loss.",
    );
  else
    actions.push("Keep risk constant—avoid scaling up on ‘feels good’ days.");

  const topReasons = reasons.slice(0, 3);
  const topActions = actions.slice(0, 3);

  function buildDrivers(params: {
    maxDrawdown: number;
    maxDrawdownPct: number | null;
    currentDrawdown: number;
    winLossRatio: number | null;
    maxLossStreak: number;
    winRate: number;
  }) {
    const drivers: {
      label: string;
      severity: "LOW" | "MED" | "HIGH";
      detail: string;
    }[] = [];

    const ddAbs = Math.abs(params.maxDrawdown ?? 0);
    const ddPctLocal = params.maxDrawdownPct ?? null;

    let ddSev: "LOW" | "MED" | "HIGH" = "LOW";
    if (ddAbs >= 200 || (ddPctLocal != null && ddPctLocal >= 0.25))
      ddSev = "HIGH";
    else if (ddAbs >= 80 || (ddPctLocal != null && ddPctLocal >= 0.12))
      ddSev = "MED";

    drivers.push({
      label: "Drawdown size",
      severity: ddSev,
      detail:
        ddPctLocal == null
          ? `Max DD: ${params.maxDrawdown.toFixed(2)}`
          : `Max DD: ${params.maxDrawdown.toFixed(
              2,
            )} (~${(ddPctLocal * 100).toFixed(1)}% of peak)`,
    });

    let lsSev: "LOW" | "MED" | "HIGH" = "LOW";
    if ((params.maxLossStreak ?? 0) >= 6) lsSev = "HIGH";
    else if ((params.maxLossStreak ?? 0) >= 3) lsSev = "MED";

    drivers.push({
      label: "Loss streak risk",
      severity: lsSev,
      detail: `Max loss streak: ${params.maxLossStreak} trades`,
    });

    const wlr = params.winLossRatio;
    let wlrSev: "LOW" | "MED" | "HIGH" = "LOW";
    if (wlr != null) {
      if (wlr < 0.8) wlrSev = "HIGH";
      else if (wlr < 1.1) wlrSev = "MED";
    }

    drivers.push({
      label: "Edge (avg win vs avg loss)",
      severity: wlrSev,
      detail:
        wlr == null ? "Not enough data" : `Win/Loss ratio: ${wlr.toFixed(2)}`,
    });

    const sevRank = { HIGH: 3, MED: 2, LOW: 1 } as const;
    return drivers
      .sort((a, b) => sevRank[b.severity] - sevRank[a.severity])
      .slice(0, 3);
  }

  const drivers = buildDrivers({
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    currentDrawdown,
    winLossRatio,
    maxLossStreak,
    winRate,
  });

  return {
    equity: equityPoints,

    // ✅ headline metrics now match Dashboard
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    currentDrawdown,

    winRate,
    avgWin,
    avgLoss,
    winLossRatio,

    maxLossStreak,
    currentLossStreak,

    totalPnl,
    stabilityScore,

    tradesPerDayAvg,
    riskInconsistencyCV,
    riskScore,
    riskBand,
    breakdown,

    reasons: topReasons,
    actions: topActions,

    drivers,

    drawdownPeriods,
    currentDrawdownPeriod,

    currentDrawdownPct,
    distanceToBreakeven,
    requiredReturnPct,
    riskMode,
    tradingAllowed,
  };
}

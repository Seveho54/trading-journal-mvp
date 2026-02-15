// src/lib/risk.ts

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

function computeMaxDrawdown(equity: number[]) {
  let peak = -Infinity;
  let maxDD = 0; // negative number
  let maxDDPct: number | null = null;

  for (let i = 0; i < equity.length; i++) {
    const e = equity[i];
    if (e > peak) peak = e;

    const dd = e - peak; // <= 0
    if (dd < maxDD) {
      maxDD = dd;

      // pct relative to peak (only if peak != 0)
      if (peak !== 0) maxDDPct = Math.abs(dd) / Math.abs(peak);
      else maxDDPct = null;
    }
  }

  return { maxDD, maxDDPct };
}

type EquityPoint = { t: string; equity: number };

export type DrawdownPeriod = {
  start: string; // date when equity drops below peak
  trough: string; // date of lowest equity within the DD
  recovery: string | null; // date when equity reaches previous peak again (null if ongoing)
  depth: number; // negative value (equity - peak)
  depthPct: number | null; // abs(depth)/abs(peak) (null if peak=0)
  durationDays: number; // start -> recovery (or start -> last point if ongoing)
  timeToTroughDays: number; // start -> trough
  recoveryDays: number | null; // trough -> recovery (null if ongoing)
};

function dayToMs(day: string) {
  // safe parse for YYYY-MM-DD
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
  let ddPeakDate = "";

  let troughEquity = Infinity;
  let troughDate = "";

  const periods: DrawdownPeriod[] = [];

  for (let i = 1; i < points.length; i++) {
    const p = points[i];

    // new peak resets state if not in drawdown
    if (!inDD && p.equity >= peak) {
      peak = p.equity;
      peakDate = p.t;
      continue;
    }

    // start DD when equity goes below peak
    if (!inDD && p.equity < peak) {
      inDD = true;
      ddStart = p.t;
      ddPeak = peak;
      ddPeakDate = peakDate;

      troughEquity = p.equity;
      troughDate = p.t;
    }

    if (inDD) {
      // update trough
      if (p.equity < troughEquity) {
        troughEquity = p.equity;
        troughDate = p.t;
      }

      // recovery: equity back to previous peak or higher
      if (p.equity >= ddPeak) {
        const depth = troughEquity - ddPeak; // negative
        const depthPct =
          ddPeak !== 0 ? Math.abs(depth) / Math.abs(ddPeak) : null;

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

        // exit DD and update peak to current point
        inDD = false;
        peak = p.equity;
        peakDate = p.t;

        // reset
        ddStart = "";
        ddPeak = 0;
        ddPeakDate = "";
        troughEquity = Infinity;
        troughDate = "";
      }
    }
  }

  // if still in drawdown at end → ongoing period
  if (inDD) {
    const last = points[points.length - 1];
    const depth = troughEquity - ddPeak; // negative
    const depthPct = ddPeak !== 0 ? Math.abs(depth) / Math.abs(ddPeak) : null;

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

export function computeRiskSummary(
  input: { positions: AnyObj[]; trades: AnyObj[]; byDayPositions?: AnyObj[] },
  opts?: { startEquity?: number },
) {
  const startEquity = opts?.startEquity ?? 0;

  const positions = Array.isArray(input.positions) ? input.positions : [];
  const trades = Array.isArray(input.trades) ? input.trades : [];
  const byDay = Array.isArray(input.byDayPositions) ? input.byDayPositions : [];

  // -------------------------
  // 1) Build daily equity points (BEST source = byDayPositions)
  // -------------------------
  let equityPoints: { t: string; equity: number }[] = [];

  if (byDay.length > 0) {
    // We expect each entry to have a "day" (or date) and a pnl field
    const mapped = byDay
      .map((d) => {
        const t = safeDateKey(d.day ?? d.date ?? d.t ?? d.ts ?? d.time);
        // try common fields
        // try common fields (Bitget byDayPositions uses totalNetProfit / totalRealizedPnl)
        const candidates = [
          d.totalNetProfit,
          d.totalRealizedPnl,
          d.netPnl,
          d.pnl,
          d.totalPnl,
          d.sumPnl,
        ];

        let pnl = 0;
        for (const c of candidates) {
          const v = num(c, NaN);
          if (Number.isFinite(v)) {
            pnl = v;
            break;
          }
        }

        return { t, pnl };
      })
      .filter((x) => !!x.t)
      .sort((a, b) => String(a.t).localeCompare(String(b.t)));

    let eq = startEquity;
    equityPoints = mapped.map((m) => {
      eq += m.pnl;
      return { t: String(m.t), equity: eq };
    });
  } else {
    // Fallback: build equity from positions sorted by close time (less ideal)
    const mapped = positions
      .map((p) => {
        const t =
          p.closeTime ??
          p.closeTimestamp ??
          p.closedAt ??
          p.exitTime ??
          p.time ??
          p.ts ??
          null;
        const key = safeDateKey(t);
        const pnlCandidates = [
          p.netPnl,
          p.pnl,
          p.totalPnl,
          p.sumPnl,
          p.totalNetProfit,
          p.totalRealizedPnl,
          p.profit,
          p.realizedPnl,
        ];

        let pnl = 0;
        for (const c of pnlCandidates) {
          const n = num(c, NaN);
          if (Number.isFinite(n)) {
            pnl = n;
            break;
          }
        }
        return { t, pnl };
      })
      .filter((x) => !!x.t)
      .sort((a, b) => String(a.t).localeCompare(String(b.t)));

    // aggregate by day
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
  const { maxDD, maxDDPct } = computeMaxDrawdown(equityArr);
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

  // -------------------------
  // 2) Win/Loss stats (from positions if possible, else trades)
  // -------------------------
  const pnlSeries =
    positions.length > 0
      ? positions.map((p) =>
          num(p.netPnl ?? p.pnl ?? p.profit ?? p.realizedPnl ?? 0, 0),
        )
      : trades.map((t) =>
          num(t.netPnl ?? t.pnl ?? t.profit ?? t.realizedPnl ?? 0, 0),
        );

  const wins = pnlSeries.filter((x) => x > 0);
  const losses = pnlSeries.filter((x) => x < 0);
  const winRate = pnlSeries.length ? wins.length / pnlSeries.length : 0;

  const avgWin = wins.length
    ? wins.reduce((a, b) => a + b, 0) / wins.length
    : 0;
  const avgLoss = losses.length
    ? losses.reduce((a, b) => a + b, 0) / losses.length
    : 0; // negative

  const winLossRatio =
    avgLoss !== 0 ? Math.abs(avgWin) / Math.abs(avgLoss) : null;

  // -------------------------
  // 3) Loss streak
  // -------------------------
  let currentLossStreak = 0;
  let maxLossStreak = 0;
  for (const x of pnlSeries) {
    if (x < 0) {
      currentLossStreak += 1;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
    } else {
      currentLossStreak = 0;
    }
  }
  // recompute current streak from end
  let endStreak = 0;
  for (let i = pnlSeries.length - 1; i >= 0; i--) {
    if (pnlSeries[i] < 0) endStreak++;
    else break;
  }
  currentLossStreak = endStreak;

  const totalPnl = pnlSeries.reduce((a, b) => a + b, 0);

  // -------------------------
  // 4) Simple stability score v1 (rule-based)
  // -------------------------
  // Score starts at 100 and deducts penalties
  let stabilityScore = 100;

  // drawdown penalty (bigger DD => lower score)
  // scale: every -50 units knocks ~10 points (adjust later)
  stabilityScore -= Math.min(60, (Math.abs(maxDD) / 50) * 10);

  // loss-streak penalty
  stabilityScore -= Math.min(25, maxLossStreak * 2);

  // win/loss ratio penalty
  if (winLossRatio != null && winLossRatio < 1) {
    stabilityScore -= Math.min(20, (1 - winLossRatio) * 20);
  }

  stabilityScore = Math.max(0, Math.round(stabilityScore));

  // -------------------------
  // 5) Trades per day (Overtrading proxy)
  // -------------------------
  // Prefer byDay if available (most accurate)
  let daysWithTrades = 0;
  let totalTrades = 0;

  if (byDay.length > 0) {
    daysWithTrades = byDay.length;
    totalTrades = byDay.reduce(
      (a, d) => a + num(d.trades ?? d.positions ?? 0, 0),
      0,
    );
  } else {
    // fallback: infer by day from positions close time
    const dayMap = new Map<string, number>();
    for (const p of positions) {
      const t =
        p.closeTime ??
        p.closeTimestamp ??
        p.closedAt ??
        p.exitTime ??
        p.time ??
        p.ts ??
        null;
      const k = safeDateKey(t);
      if (!k) continue;
      dayMap.set(k, (dayMap.get(k) ?? 0) + 1);
    }
    daysWithTrades = dayMap.size;
    totalTrades = Array.from(dayMap.values()).reduce((a, b) => a + b, 0);
  }

  const tradesPerDayAvg = daysWithTrades > 0 ? totalTrades / daysWithTrades : 0;

  // -------------------------
  // 6) Risk inconsistency proxy (CV of abs pnl)
  // -------------------------
  const absPnL = pnlSeries
    .map((x) => Math.abs(x))
    .filter((x) => Number.isFinite(x) && x > 0);
  const absMean = mean(absPnL);
  const absStd = std(absPnL);
  const riskInconsistencyCV = absMean > 0 ? absStd / absMean : 0;

  // -------------------------
  // 7) Tradevion Risk Score v1 (rule-based)
  // -------------------------
  const breakdown: {
    key: string;
    label: string;
    penalty: number;
    value: string;
  }[] = [];
  let riskScore = 100;

  // A) Drawdown penalty
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

  // B) Loss streak penalty
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

  // C) Risk inconsistency penalty (CV)
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

  // D) Overtrading penalty (trades/day)
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
  // 5) Reasons + Actions (v1)
  // -------------------------
  const reasons: string[] = [];
  const actions: string[] = [];

  // Reason 1: Drawdown
  if (maxDD < -100) reasons.push("Large max drawdown");
  else if (maxDD < -50) reasons.push("Max drawdown is noticeable");
  else reasons.push("Drawdown is under control");

  // Reason 2: Loss streak
  if (maxLossStreak >= 6) reasons.push("Long loss streaks");
  else if (maxLossStreak >= 3)
    reasons.push("Loss streaks are hurting consistency");
  else reasons.push("Loss streaks are controlled");

  // Reason 3: Win/Loss ratio
  if (winLossRatio != null && winLossRatio < 1)
    reasons.push("Average loss is bigger than average win");
  else if (winLossRatio != null && winLossRatio < 1.5)
    reasons.push("Win/Loss ratio can improve");
  else reasons.push("Win/Loss ratio looks healthy");

  // Actions (simple + concrete)
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

  // Keep top 3 reasons/actions
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

    // 1) Drawdown
    const ddAbs = Math.abs(params.maxDrawdown ?? 0);
    const ddPct = params.maxDrawdownPct ?? null;

    let ddSev: "LOW" | "MED" | "HIGH" = "LOW";
    if (ddAbs >= 200 || (ddPct != null && ddPct >= 0.25)) ddSev = "HIGH";
    else if (ddAbs >= 80 || (ddPct != null && ddPct >= 0.12)) ddSev = "MED";

    drivers.push({
      label: "Drawdown size",
      severity: ddSev,
      detail:
        ddPct == null
          ? `Max DD: ${params.maxDrawdown.toFixed(2)}`
          : `Max DD: ${params.maxDrawdown.toFixed(2)} (~${(ddPct * 100).toFixed(1)}% of peak)`,
    });

    // 2) Loss streak
    let lsSev: "LOW" | "MED" | "HIGH" = "LOW";
    if ((params.maxLossStreak ?? 0) >= 6) lsSev = "HIGH";
    else if ((params.maxLossStreak ?? 0) >= 3) lsSev = "MED";

    drivers.push({
      label: "Loss streak risk",
      severity: lsSev,
      detail: `Max loss streak: ${params.maxLossStreak} trades`,
    });

    // 3) Win/Loss ratio (avg win vs avg loss)
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

    // Sort by severity, return top 3
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
  };
}

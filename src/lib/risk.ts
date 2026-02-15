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

type DailyPoint = {
  day: string; // YYYY-MM-DD
  pnl: number; // totalNetProfit of the day
  tradesCount?: number; // optional if available
};

function buildDailyPoints(byDay: AnyObj[]): DailyPoint[] {
  return [...(byDay ?? [])]
    .filter((d) => d?.day)
    .sort((a, b) => String(a.day).localeCompare(String(b.day)))
    .map((d) => ({
      day: String(d.day),
      pnl: num(d?.totalNetProfit ?? 0, 0),
      tradesCount: Number.isFinite(num(d?.trades ?? d?.positions ?? NaN, NaN))
        ? num(d?.trades ?? d?.positions, 0)
        : undefined,
    }));
}

export type RiskAlert = {
  key: string;
  severity: "INFO" | "WARN" | "CRITICAL";
  title: string;
  detail: string;
};

export type RiskRuleNow = {
  key: string;
  label: string;
  value: string;
  why: string;
};

export type NextSessionStep = {
  key: string;
  title: string;
  detail: string;
};

export type RootCause = {
  key: string;
  severity: "LOW" | "MED" | "HIGH";
  title: string;
  evidence: string;
  impactHint: string;
};

export type Countermeasure = {
  key: string;
  title: string;
  steps: string[];
  metricToWatch: string;
};

export type TradingPolicy = {
  mode: "NORMAL" | "CAUTION" | "RECOVERY" | "CRITICAL";
  allowed: "YES" | "LIMITED" | "NO";

  maxTradesToday: number;
  maxDailyLoss: number; // negative number
  sizeMultiplier: number; // 1 = normal, 0.5 = half size, etc.
  cooldownAfterLosses: number; // number of consecutive losses that triggers cooldown
  cooldownMinutes: number;

  focus: string[]; // short bullet list
};

export type NextSessionChecklist = {
  headline: string; // e.g. "Recovery session"
  do: string[]; // concrete actions
  dont: string[]; // concrete avoidances
  ifThen: { if: string; then: string }[]; // rules
};

export type ModeExplanation = {
  title: string;
  bullets: string[];
};

export function computeRiskSummary(
  input: { positions: AnyObj[]; trades: AnyObj[]; byDayPositions?: AnyObj[] },
  opts?: { startEquity?: number },
) {
  const startEquity = opts?.startEquity ?? 0;

  const positions = Array.isArray(input.positions) ? input.positions : [];
  const trades = Array.isArray(input.trades) ? input.trades : [];
  const byDay = Array.isArray(input.byDayPositions) ? input.byDayPositions : [];
  const daily = buildDailyPoints(byDay);

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

  const dailyPnls = daily.map((d) => d.pnl);
  const worstDayPnl = dailyPnls.length ? Math.min(...dailyPnls) : 0;
  const bestDayPnl = dailyPnls.length ? Math.max(...dailyPnls) : 0;

  const maxDailyLoss = worstDayPnl; // negative number (or 0)

  let lossDaysStreak = 0;
  let maxLossDaysStreak = 0;
  let curDays = 0;

  for (const d of daily) {
    if (d.pnl < 0) {
      curDays += 1;
      if (curDays > maxLossDaysStreak) maxLossDaysStreak = curDays;
    } else {
      curDays = 0;
    }
  }

  // current losing-days streak from the end:
  let endDays = 0;
  for (let i = daily.length - 1; i >= 0; i--) {
    if (daily[i].pnl < 0) endDays++;
    else break;
  }
  lossDaysStreak = endDays;

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
    const taRaw = getPosCloseTime(a);
    const tbRaw = getPosCloseTime(b);

    const ta = new Date(taRaw ?? 0).getTime();
    const tb = new Date(tbRaw ?? 0).getTime();

    const A = Number.isFinite(ta) ? ta : 0;
    const B = Number.isFinite(tb) ? tb : 0;

    return A - B;
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

  const ddPctForMode = equityMaxDDPct ?? currentDrawdownPct ?? 0;

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

  // -------------------------
  // 10) Alerts + Mode explanation (Ebene 2)
  // -------------------------
  const alerts: RiskAlert[] = [];

  const ddPctNow = currentDrawdownPct ?? 0;

  // Drawdown alert (current)
  if (ddPctNow >= 0.2) {
    alerts.push({
      key: "dd_critical",
      severity: "CRITICAL",
      title: "Drawdown is critical",
      detail: `Current drawdown is ~${(ddPctNow * 100).toFixed(1)}% from peak.`,
    });
  } else if (ddPctNow >= 0.1) {
    alerts.push({
      key: "dd_warn",
      severity: "WARN",
      title: "You are in drawdown",
      detail: `Current drawdown is ~${(ddPctNow * 100).toFixed(1)}% from peak.`,
    });
  }

  // Trade loss streak
  if (maxLossStreak >= 9) {
    alerts.push({
      key: "lossstreak_critical",
      severity: "CRITICAL",
      title: "Extreme loss streak",
      detail: `Max losing trades in a row: ${maxLossStreak}.`,
    });
  } else if (maxLossStreak >= 6) {
    alerts.push({
      key: "lossstreak_warn",
      severity: "WARN",
      title: "Loss streak risk",
      detail: `Max losing trades in a row: ${maxLossStreak}.`,
    });
  }

  // Losing days streak
  if (lossDaysStreak >= 4) {
    alerts.push({
      key: "lossdays_warn",
      severity: "WARN",
      title: "Multiple losing days in a row",
      detail: `Current losing-days streak: ${lossDaysStreak}.`,
    });
  }

  // Overtrading
  if (tradesPerDayAvg > 10) {
    alerts.push({
      key: "overtrade_warn",
      severity: "WARN",
      title: "High trading frequency",
      detail: `Avg trades/day: ${tradesPerDayAvg.toFixed(1)}.`,
    });
  }

  // Risk inconsistency
  if (riskInconsistencyCV > 1.2) {
    alerts.push({
      key: "inconsistency_warn",
      severity: "WARN",
      title: "Risk inconsistency is high",
      detail: `PnL variability (CV): ${riskInconsistencyCV.toFixed(2)}.`,
    });
  }

  // Worst day (useful for daily loss rules)
  if (maxDailyLoss < -100) {
    alerts.push({
      key: "daily_loss_info",
      severity: "INFO",
      title: "Daily loss spikes exist",
      detail: `Worst day: ${maxDailyLoss.toFixed(2)}.`,
    });
  }

  // Sort by severity
  const sevRankAlerts = { CRITICAL: 3, WARN: 2, INFO: 1 } as const;
  alerts.sort((a, b) => sevRankAlerts[b.severity] - sevRankAlerts[a.severity]);

  const modeExplanation: ModeExplanation = {
    title:
      riskMode === "CRITICAL"
        ? "CRITICAL: trading should stop"
        : riskMode === "RECOVERY"
          ? "RECOVERY: trade only with limits"
          : riskMode === "CAUTION"
            ? "CAUTION: tighten rules"
            : "NORMAL: keep standard rules",
    bullets: [],
  };

  if (ddPctNow >= 0.2)
    modeExplanation.bullets.push(
      `Drawdown ≥ 20% (${(ddPctNow * 100).toFixed(1)}%).`,
    );
  else if (ddPctNow >= 0.1)
    modeExplanation.bullets.push(
      `Drawdown ≥ 10% (${(ddPctNow * 100).toFixed(1)}%).`,
    );

  if (maxLossStreak >= 6)
    modeExplanation.bullets.push(`Loss streak risk (max ${maxLossStreak}).`);

  if (lossDaysStreak >= 3)
    modeExplanation.bullets.push(`Losing days streak (${lossDaysStreak}).`);

  if (riskInconsistencyCV > 1.0)
    modeExplanation.bullets.push(
      `PnL inconsistency (CV ${riskInconsistencyCV.toFixed(2)}).`,
    );

  if (tradesPerDayAvg > 8)
    modeExplanation.bullets.push(
      `High trade frequency (${tradesPerDayAvg.toFixed(1)}/day).`,
    );

  if (!modeExplanation.bullets.length)
    modeExplanation.bullets.push("No major risk triggers detected.");

  // -------------------------
  // Ebene 2.2 — Rules Now + Next Session Plan (personalized)
  // -------------------------
  const rulesNow: RiskRuleNow[] = [];

  // Rule 1: daily stop (based on worst day)
  // If worst day is -120, recommend stop at ~70-80% of that (safer)
  const stopDaily =
    maxDailyLoss < 0
      ? Math.round(Math.abs(maxDailyLoss) * 0.75 * 100) / 100
      : null;
  if (stopDaily != null) {
    rulesNow.push({
      key: "dailyStop",
      label: "Max Daily Loss (stop trading)",
      value: `-${stopDaily.toFixed(2)}`,
      why: `Based on your worst day (${maxDailyLoss.toFixed(2)}). Stopping earlier prevents spiral losses.`,
    });
  }

  // Rule 2: losing streak stop (based on your real streak behavior)
  const streakStop = Math.max(
    2,
    Math.min(4, Math.ceil((maxLossStreak || 0) / 2)),
  );
  rulesNow.push({
    key: "streakStop",
    label: "Loss-streak stop (cooldown)",
    value: `${streakStop} losses`,
    why: `Your max streak is ${maxLossStreak}. A stop at ${streakStop} breaks escalation.`,
  });

  // Rule 3: mode-based sizing cap (simple but powerful)
  const sizeCap =
    riskMode === "CRITICAL"
      ? "0% (no trading)"
      : riskMode === "RECOVERY"
        ? "50% size"
        : riskMode === "CAUTION"
          ? "75% size"
          : "100% size";

  rulesNow.push({
    key: "sizeCap",
    label: "Position size cap",
    value: sizeCap,
    why: `Mode = ${riskMode}. Size control is the fastest stabilizer.`,
  });

  // Best Move: choose 1 highest impact next action
  let bestMove = {
    title: "Stabilize with a daily stop rule",
    detail:
      stopDaily != null
        ? `Hard stop at -${stopDaily.toFixed(2)} per day. Prevents deep drawdowns.`
        : `Add a hard daily stop to prevent drawdown spirals.`,
  };

  if ((maxLossStreak ?? 0) >= 6) {
    bestMove = {
      title: "Stop the streak spiral",
      detail: `After ${streakStop} consecutive losses: stop for the day. Your max streak is ${maxLossStreak}.`,
    };
  } else if ((winLossRatio ?? 999) < 1) {
    bestMove = {
      title: "Fix your loss size first",
      detail: `Your avg loss is larger than avg win. Tighten invalidation / respect stop-loss. No size increase until ratio > 1.`,
    };
  }

  // Next Session Plan: 3-step operational plan
  const planNextSession: NextSessionStep[] = [
    {
      key: "plan-1",
      title: "Pre-trade: define stop conditions",
      detail:
        stopDaily != null
          ? `If PnL hits -${stopDaily.toFixed(2)} (daily), stop trading immediately.`
          : "Set a hard max daily loss and stop when hit.",
    },
    {
      key: "plan-2",
      title: "During trading: keep size capped",
      detail: `Trade at ${sizeCap}. No “revenge size-ups” after losses.`,
    },
    {
      key: "plan-3",
      title: "Recovery goal: break-even target",
      detail:
        distanceToBreakeven > 0
          ? `You need +${distanceToBreakeven.toFixed(2)} to break even. Focus on A+ setups only until recovered.`
          : "You are at/above peak. Keep rules stable to protect gains.",
    },
  ];

  // -------------------------
  // Ebene 2.3 — Root Cause Finder (ranked) + Countermeasures
  // -------------------------
  const rootCauses: RootCause[] = [];

  // Helpers
  const sevRank = { HIGH: 3, MED: 2, LOW: 1 } as const;

  // Cause A: Drawdown pressure (current)
  const ddNowAbs = Math.abs(currentDrawdown ?? 0);
  const ddNowPct = currentDrawdownPct ?? null;

  let ddSev: "LOW" | "MED" | "HIGH" = "LOW";
  if (ddNowAbs >= 200 || (ddNowPct != null && ddNowPct >= 0.15)) ddSev = "HIGH";
  else if (ddNowAbs >= 80 || (ddNowPct != null && ddNowPct >= 0.07))
    ddSev = "MED";

  if (ddNowAbs > 0) {
    rootCauses.push({
      key: "ddPressure",
      severity: ddSev,
      title: "Drawdown pressure is high",
      evidence:
        ddNowPct != null
          ? `Current drawdown: -${ddNowAbs.toFixed(2)} (~${(ddNowPct * 100).toFixed(1)}%).`
          : `Current drawdown: -${ddNowAbs.toFixed(2)}.`,
      impactHint:
        distanceToBreakeven > 0
          ? `You need +${distanceToBreakeven.toFixed(2)} to reach break-even — protect capital first.`
          : "Capital is near peak — maintain rules to protect gains.",
    });
  }

  // Cause B: Loss-streak escalation
  let streakSev: "LOW" | "MED" | "HIGH" = "LOW";
  if ((maxLossStreak ?? 0) >= 6) streakSev = "HIGH";
  else if ((maxLossStreak ?? 0) >= 3) streakSev = "MED";

  if ((maxLossStreak ?? 0) >= 3) {
    rootCauses.push({
      key: "streak",
      severity: streakSev,
      title: "Loss streak escalation risk",
      evidence: `Max loss streak: ${maxLossStreak} • Current: ${currentLossStreak}.`,
      impactHint:
        "Streaks are where traders break rules and oversize — stop the spiral early.",
    });
  }

  // Cause C: Inconsistency / size variance proxy
  let incSev: "LOW" | "MED" | "HIGH" = "LOW";
  if (riskInconsistencyCV >= 1.2) incSev = "HIGH";
  else if (riskInconsistencyCV >= 0.8) incSev = "MED";

  if (riskInconsistencyCV >= 0.8) {
    rootCauses.push({
      key: "inconsistency",
      severity: incSev,
      title: "PnL size variance is too high",
      evidence: `Risk inconsistency CV: ${riskInconsistencyCV.toFixed(2)} (higher = unstable sizing/outliers).`,
      impactHint:
        "Outlier losses usually cause the big DD. Your priority is reducing tail risk.",
    });
  }

  // Cause D: Overtrading
  let overSev: "LOW" | "MED" | "HIGH" = "LOW";
  if (tradesPerDayAvg > 10) overSev = "HIGH";
  else if (tradesPerDayAvg > 5) overSev = "MED";

  if (tradesPerDayAvg > 5) {
    rootCauses.push({
      key: "overtrading",
      severity: overSev,
      title: "Overtrading increases error rate",
      evidence: `Avg trades/day: ${tradesPerDayAvg.toFixed(1)}.`,
      impactHint:
        "Most traders lose money in the extra trades after the first 2–4 setups.",
    });
  }

  // Rank causes (top 3)
  const rankedRootCauses = rootCauses
    .sort((a, b) => sevRank[b.severity] - sevRank[a.severity])
    .slice(0, 3);

  // Countermeasures (mapped to causes)
  const countermeasures: Countermeasure[] = [];

  for (const c of rankedRootCauses) {
    if (c.key === "ddPressure") {
      const stopDailyStr =
        stopDaily != null ? `-${stopDaily.toFixed(2)}` : "a hard daily stop";
      countermeasures.push({
        key: "cm-dd",
        title: "DD Recovery Protocol (7 days)",
        steps: [
          `Set max daily loss to ${stopDailyStr} and STOP immediately when hit.`,
          `Trade only A+ setups: max 2–3 trades/day until break-even is recovered.`,
          `No size increases until equity is back above last peak.`,
        ],
        metricToWatch: "Current drawdown + distance to break-even",
      });
    }

    if (c.key === "streak") {
      countermeasures.push({
        key: "cm-streak",
        title: "Streak Breaker Rule",
        steps: [
          `After ${streakStop} consecutive losses: stop trading for the day.`,
          "After the stop: review last 3 trades → identify 1 repeated mistake (setup, entry, SL).",
          "Next day: first trade must be half-size (warm start).",
        ],
        metricToWatch: "Max loss streak + current streak",
      });
    }

    if (c.key === "inconsistency") {
      countermeasures.push({
        key: "cm-inc",
        title: "Tail-risk reduction (stop the outliers)",
        steps: [
          "Fix 1 thing: never move stop-loss further away after entry.",
          "Cap single-trade loss: if a trade hits -1R, you are done with that setup (no re-entry).",
          "Keep size constant for 20 trades (no exceptions).",
        ],
        metricToWatch: "Risk inconsistency CV (aim < 0.8)",
      });
    }

    if (c.key === "overtrading") {
      const cap = tradesPerDayAvg > 10 ? 5 : 3;
      countermeasures.push({
        key: "cm-over",
        title: "Overtrading cap (quality filter)",
        steps: [
          `Hard cap: max ${cap} trades/day.`,
          "After 2 trades, require a 5-min reset checklist before entering again.",
          "If you are down on the day: reduce remaining trades to 1 only.",
        ],
        metricToWatch: "Trades/day average + daily PnL streak",
      });
    }
  }

  // -------------------------
  // Ebene 2.4 — Trading Policy (OS)
  // -------------------------
  const policyBaseMaxLoss =
    stopDaily ?? (maxDailyLoss != null ? maxDailyLoss : -50);

  let maxTradesToday = 6;
  let sizeMultiplier = 1;
  let cooldownAfterLosses = 3;
  let cooldownMinutes = 15;
  const focus: string[] = [];

  if (riskMode === "CRITICAL") {
    maxTradesToday = 0;
    sizeMultiplier = 0;
    cooldownAfterLosses = 1;
    cooldownMinutes = 999; // basically: stop
    focus.push("Stop trading. Switch to review mode only.");
    focus.push("Audit the last 10 trades: rule breaks + outlier losses.");
    focus.push("No size increases until break-even recovered.");
  } else if (riskMode === "RECOVERY") {
    maxTradesToday = 3;
    sizeMultiplier = 0.5;
    cooldownAfterLosses = 2;
    cooldownMinutes = 30;
    focus.push("Only A+ setups. No experiments.");
    focus.push("Hard daily stop. Stop immediately when hit.");
    focus.push("No revenge trades after a loss.");
  } else if (riskMode === "CAUTION") {
    maxTradesToday = 5;
    sizeMultiplier = 0.75;
    cooldownAfterLosses = 3;
    cooldownMinutes = 20;
    focus.push("Keep size stable. Avoid scaling up.");
    focus.push("Take a short reset after 2 trades.");
    focus.push("Stop trading if day turns negative.");
  } else {
    // NORMAL
    maxTradesToday = 8;
    sizeMultiplier = 1;
    cooldownAfterLosses = 3;
    cooldownMinutes = 10;
    focus.push("Keep risk constant.");
    focus.push("Avoid extra trades outside plan.");
    focus.push("Protect gains: don’t give back green days.");
  }

  // If you already have a computed stopDaily -> make sure policy uses it
  const policy: TradingPolicy = {
    mode: riskMode,
    allowed: tradingAllowed as any,
    maxTradesToday,
    maxDailyLoss: policyBaseMaxLoss, // negative
    sizeMultiplier,
    cooldownAfterLosses,
    cooldownMinutes,
    focus,
  };

  // -------------------------
  // Ebene 2.5 — Next Session Checklist (Guided)
  // -------------------------
  const ddAbsNow = Math.abs(currentDrawdown ?? 0);
  const worstDay = daily?.worstDayPnl ?? 0;

  const checklistDo: string[] = [];
  const checklistDont: string[] = [];
  const ifThen: { if: string; then: string }[] = [];

  // Headline based on mode
  const headline =
    riskMode === "CRITICAL"
      ? "Critical mode: protect capital"
      : riskMode === "RECOVERY"
        ? "Recovery session: regain stability"
        : riskMode === "CAUTION"
          ? "Caution session: tighten execution"
          : "Normal session: keep discipline";

  // Core "Do" derived from policy
  checklistDo.push(`Follow policy: max ${policy.maxTradesToday} trades today.`);
  checklistDo.push(
    `Trade size: ${Math.round(policy.sizeMultiplier * 100)}% of normal.`,
  );
  checklistDo.push(`Hard stop: stop the day at ${policy.maxDailyLoss}.`);

  // Situation-specific
  if (ddPctNow >= 0.1)
    checklistDo.push("Only A+ setups. Skip anything marginal.");
  if (maxLossStreak >= 3)
    checklistDo.push(
      "Cooldown after a loss-streak trigger (walk away + reset).",
    );

  // "Don't"
  checklistDont.push("No revenge trades.");
  checklistDont.push("No size increase after wins.");
  if (riskMode !== "NORMAL")
    checklistDont.push("No experiments / new strategy while not in NORMAL.");

  // IF/THEN rules (these are the real OS feeling)
  ifThen.push({
    if: `You hit daily loss ≤ ${policy.maxDailyLoss}`,
    then: "Stop trading immediately. Review only.",
  });

  ifThen.push({
    if: `You take ${policy.cooldownAfterLosses} losses in a row`,
    then: `Take a ${policy.cooldownMinutes}m cooldown. No chart watching.`,
  });

  ifThen.push({
    if: "You feel the urge to “make it back quickly”",
    then: "Stop. Reduce size or end session.",
  });

  // Add a drawdown-recovery rule
  if (distanceToBreakeven != null && distanceToBreakeven > 0) {
    ifThen.push({
      if: `You are still ${distanceToBreakeven.toFixed(2)} away from break-even`,
      then: "Your goal is consistency, not recovery speed. Keep risk capped.",
    });
  }

  // Worst day guardrail
  if (worstDay < 0) {
    const softStop = worstDay * 0.6; // 60% of worst day loss
    ifThen.push({
      if: `Today’s loss reaches ${softStop.toFixed(2)} (soft stop)`,
      then: "Pause and reassess. Continue only if you can state your exact A+ criteria.",
    });
  }

  const checklist: NextSessionChecklist = {
    headline,
    do: checklistDo.slice(0, 6),
    dont: checklistDont.slice(0, 6),
    ifThen: ifThen.slice(0, 6),
  };

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

    alerts,
    modeExplanation,

    rulesNow,
    planNextSession,
    bestMove,

    rootCauses: rankedRootCauses,
    countermeasures,

    policy,

    checklist,

    daily: {
      worstDayPnl,
      bestDayPnl,
      maxDailyLoss,
      lossDaysStreak,
      maxLossDaysStreak,
    },
  };
}

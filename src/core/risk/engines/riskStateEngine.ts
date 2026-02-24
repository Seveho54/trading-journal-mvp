// src/core/risk/engines/riskStateEngine.ts

import type { EquityAnalysis } from "./equityEngine";
import type { ExposureAnalysis } from "./exposureEngine";
import type { DailyLossAnalysis } from "./dailyLossEngine";
import type { Deviation } from "./deviationEngine";
import type { SurvivalScore } from "./survivalScoreEngine";

export type RiskState = "SAFE" | "WARNING" | "DANGER" | "CRITICAL";

export type RiskStateOutput = {
  state: RiskState;
  reasons: string[]; // max 3
  recommendedAction: string; // single clear action
  flags: {
    dailyLimitBreached: boolean;
    dailyLossUsedRatio: number | null; // 0..1
    currentDrawdownPct: number | null; // 0..1
    survivalScore: number | null; // 0..100
    topDeviationSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
  };
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function severityRank(s: any): number {
  switch (String(s ?? "")) {
    case "CRITICAL":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
    default:
      return 0;
  }
}

function pickTopSeverity(
  deviations: Deviation[],
): RiskStateOutput["flags"]["topDeviationSeverity"] {
  if (!deviations?.length) return null;
  let best = deviations[0]?.severity ?? null;
  for (const d of deviations) {
    if (severityRank(d.severity) > severityRank(best)) best = d.severity;
  }
  return (best as any) ?? null;
}

export function computeRiskState(args: {
  equity: EquityAnalysis;
  exposure: ExposureAnalysis;
  daily: DailyLossAnalysis;
  deviations: Deviation[];
  survival: SurvivalScore;
}): RiskStateOutput {
  const dd = Number.isFinite(Number(args.equity?.currentDrawdownPct))
    ? Number(args.equity.currentDrawdownPct)
    : null;

  const survivalScore = Number.isFinite(Number(args.survival?.score))
    ? Number(args.survival.score)
    : null;

  const dailyBreached = !!args.daily?.distanceToLimit?.breached;

  const dailyLossUsedRatio = (() => {
    const lim = args.daily?.limit?.dailyLossLimitAbs;
    const pnl = args.daily?.dailyPnl;
    if (!Number.isFinite(Number(lim)) || !(Number(lim) > 0)) return null;
    if (!Number.isFinite(Number(pnl))) return null;
    const lossUsed = Math.max(0, -Number(pnl));
    return clamp(lossUsed / Number(lim), 0, 2);
  })();

  const topDev = pickTopSeverity(args.deviations);

  const reasons: string[] = [];

  // ---------- CRITICAL ----------
  const isCritical =
    dailyBreached ||
    (dd != null && dd >= 0.25) ||
    (survivalScore != null && survivalScore < 40) ||
    topDev === "CRITICAL";

  if (isCritical) {
    if (dailyBreached) reasons.push("Daily loss limit breached.");
    if (dd != null && dd >= 0.25)
      reasons.push(`Drawdown high (${Math.round(dd * 1000) / 10}%).`);
    if (survivalScore != null && survivalScore < 40)
      reasons.push(`Survival score very low (${survivalScore}/100).`);
    if (topDev === "CRITICAL")
      reasons.push("Critical behavior deviation detected.");
    return {
      state: "CRITICAL",
      reasons: reasons.slice(0, 3),
      recommendedAction: "Stop trading for today. Protect capital.",
      flags: {
        dailyLimitBreached: dailyBreached,
        dailyLossUsedRatio,
        currentDrawdownPct: dd,
        survivalScore,
        topDeviationSeverity: topDev,
      },
    };
  }

  // ---------- DANGER ----------
  const isDanger =
    (dailyLossUsedRatio != null && dailyLossUsedRatio >= 0.7) ||
    (dd != null && dd >= 0.18) ||
    (survivalScore != null && survivalScore < 55) ||
    topDev === "HIGH";

  if (isDanger) {
    if (dailyLossUsedRatio != null && dailyLossUsedRatio >= 0.7)
      reasons.push(
        `Daily loss near limit (${Math.round(dailyLossUsedRatio * 100)}%).`,
      );
    if (dd != null && dd >= 0.18)
      reasons.push(`Drawdown elevated (${Math.round(dd * 1000) / 10}%).`);
    if (survivalScore != null && survivalScore < 55)
      reasons.push(`Survival score low (${survivalScore}/100).`);
    if (topDev === "HIGH") reasons.push("High behavior deviation detected.");
    return {
      state: "DANGER",
      reasons: reasons.slice(0, 3),
      recommendedAction: "Cooldown 30 minutes. Reduce size on next trade.",
      flags: {
        dailyLimitBreached: dailyBreached,
        dailyLossUsedRatio,
        currentDrawdownPct: dd,
        survivalScore,
        topDeviationSeverity: topDev,
      },
    };
  }

  // ---------- WARNING ----------
  const isWarning =
    (dailyLossUsedRatio != null && dailyLossUsedRatio >= 0.4) ||
    (dd != null && dd >= 0.1) ||
    (survivalScore != null && survivalScore < 70) ||
    topDev === "MEDIUM";

  if (isWarning) {
    if (dailyLossUsedRatio != null && dailyLossUsedRatio >= 0.4)
      reasons.push(
        `Daily loss building (${Math.round(dailyLossUsedRatio * 100)}%).`,
      );
    if (dd != null && dd >= 0.1)
      reasons.push(`Drawdown > 10% (${Math.round(dd * 1000) / 10}%).`);
    if (survivalScore != null && survivalScore < 70)
      reasons.push(`Survival score below 70 (${survivalScore}/100).`);
    if (topDev === "MEDIUM")
      reasons.push("Medium behavior deviation detected.");
    return {
      state: "WARNING",
      reasons: reasons.slice(0, 3),
      recommendedAction: "Trade only A+ setups. Keep size small.",
      flags: {
        dailyLimitBreached: dailyBreached,
        dailyLossUsedRatio,
        currentDrawdownPct: dd,
        survivalScore,
        topDeviationSeverity: topDev,
      },
    };
  }

  // ---------- SAFE ----------
  return {
    state: "SAFE",
    reasons: ["Risk is within normal bounds."],
    recommendedAction: "Keep plan. Maintain discipline.",
    flags: {
      dailyLimitBreached: dailyBreached,
      dailyLossUsedRatio,
      currentDrawdownPct: dd,
      survivalScore,
      topDeviationSeverity: topDev,
    },
  };
}

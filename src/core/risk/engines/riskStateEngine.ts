// src/core/risk/engines/riskStateEngine.ts

import type { EquityAnalysis } from "./equityEngine";
import type { ExposureAnalysis } from "./exposureEngine";
import type { DailyLossAnalysis } from "./dailyLossEngine";
import type { Deviation } from "./deviationEngine";
import type { SurvivalScore } from "./survivalScoreEngine";
import type { Guardrails } from "./guardrails";
import { DEFAULT_GUARDRAILS } from "./guardrails";

export type RiskState = "SAFE" | "WARNING" | "DANGER" | "CRITICAL";

export type RiskStateOutput = {
  state: RiskState;

  // UI
  headline: string; // 1 Satz
  recommendedAction: string; // 1 klare Aktion
  reasons: string[]; // max 3 (bullet points)

  // Explain-Details (für Premium “Why?”)
  explain: {
    triggeredBy: Array<"DAILY_LIMIT" | "DRAWDOWN" | "SURVIVAL" | "BEHAVIOR">; // was hat ausgelöst
    metrics: {
      dailyLossUsedPct: number | null; // 0..100
      drawdownPct: number | null; // 0..100
      survivalScore: number | null; // 0..100
      topDeviationSeverity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
    };
  };

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
  guardrails?: Partial<Guardrails>;
}): RiskStateOutput {
  const g = { ...DEFAULT_GUARDRAILS, ...(args.guardrails ?? {}) };
  const dd = Number.isFinite(Number(args.equity?.currentDrawdownPct))
    ? Number(args.equity.currentDrawdownPct)
    : null;

  const maxDD = Number.isFinite(Number(args.equity?.maxDrawdownPct))
    ? Number(args.equity.maxDrawdownPct)
    : null;

  const dailyLimitPct = Number.isFinite(
    Number(args.daily?.limit?.dailyLossLimitPct),
  )
    ? Number(args.daily.limit.dailyLossLimitPct)
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

  const triggeredBy: RiskStateOutput["explain"]["triggeredBy"] = [];

  const ddPct = dd != null ? Math.round(dd * 1000) / 10 : null; // 17.5
  const dailyUsedPct =
    dailyLossUsedRatio != null ? Math.round(dailyLossUsedRatio * 100) : null;

  const lossStreak = (() => {
    const ls = args.deviations.find((d) => d.id === "LOSS_STREAK");
    if (!ls) return 0;
    const raw = (ls as any)?.evidence?.now?.lossStreak;
    return Number.isFinite(Number(raw)) ? Number(raw) : 0;
  })();

  const HARD = {
    ddStop: g.ddHardStopPct, // 25% DD => stop
    lossStreakStop: g.lossStreakHardStop, // 4 losses in a row => stop
    dailyLossStopRatio: 1.0, // 100% daily limit used => stop
    survivalStop: g.survivalHardStop, // survival score too low
  };

  const hardStop = (() => {
    if (dailyBreached) return true;
    if (
      dailyLossUsedRatio != null &&
      dailyLossUsedRatio >= HARD.dailyLossStopRatio
    )
      return true;
    if (dd != null && dd >= HARD.ddStop) return true;
    if (lossStreak != null && lossStreak >= HARD.lossStreakStop) return true;
    if (survivalScore != null && survivalScore < HARD.survivalStop) return true;
    if (topDev === "CRITICAL") return true;
    return false;
  })();

  const blockReason = (() => {
    if (!hardStop) return null;
    if (dailyBreached) return "Daily loss limit breached";
    if (
      dailyLossUsedRatio != null &&
      dailyLossUsedRatio >= HARD.dailyLossStopRatio
    )
      return "Daily loss limit reached";
    if (dd != null && dd >= HARD.ddStop) return "Drawdown hard-stop reached";
    if (lossStreak != null && lossStreak >= HARD.lossStreakStop)
      return "Loss streak hard-stop reached";
    if (survivalScore != null && survivalScore < HARD.survivalStop)
      return "Survival score hard-stop reached";
    if (topDev === "CRITICAL") return "Critical behavior deviation";
    return "Risk hard-stop";
  })();

  const reasons: string[] = [];

  // ---------- CRITICAL ----------
  const isCritical =
    hardStop ||
    (dd != null && dd >= 0.25) ||
    (survivalScore != null && survivalScore < 40) ||
    topDev === "CRITICAL";

  if (isCritical) {
    if (dailyBreached) triggeredBy.push("DAILY_LIMIT");
    if (dd != null && dd >= 0.25) triggeredBy.push("DRAWDOWN");
    if (survivalScore != null && survivalScore < 40)
      triggeredBy.push("SURVIVAL");
    if (topDev === "CRITICAL") triggeredBy.push("BEHAVIOR");

    return {
      state: "CRITICAL",
      headline: "Capital protection triggered.",
      reasons: reasons.slice(0, 3),
      recommendedAction: "Stop trading for today. Protect capital.",
      explain: {
        triggeredBy,
        metrics: {
          dailyLossUsedPct: dailyUsedPct,
          drawdownPct: ddPct,
          survivalScore,
          topDeviationSeverity: topDev,
        },
      },
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
    (dd != null && dd >= Math.max(0.18, g.ddWarningPct * 1.8)) ||
    (survivalScore != null && survivalScore < 55) ||
    topDev === "HIGH";

  if (isDanger) {
    if (dailyLossUsedRatio != null && dailyLossUsedRatio >= 0.7)
      triggeredBy.push("DAILY_LIMIT");
    if (dd != null && dd >= 0.18) triggeredBy.push("DRAWDOWN");
    if (survivalScore != null && survivalScore < 55)
      triggeredBy.push("SURVIVAL");
    if (topDev === "HIGH") triggeredBy.push("BEHAVIOR");
    return {
      state: "DANGER",
      headline: "Risk elevated — reduce activity.",
      reasons: reasons.slice(0, 3),
      recommendedAction: "Cooldown 30 minutes. Reduce size on next trade.",
      explain: {
        triggeredBy,
        metrics: {
          dailyLossUsedPct: dailyUsedPct,
          drawdownPct: ddPct,
          survivalScore,
          topDeviationSeverity: topDev,
        },
      },
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
    (dd != null && dd >= g.ddWarningPct) ||
    (survivalScore != null && survivalScore < 70) ||
    topDev === "MEDIUM";

  if (isWarning) {
    if (dailyLossUsedRatio != null && dailyLossUsedRatio >= 0.4)
      reasons.push(
        `Daily loss building (${Math.round(dailyLossUsedRatio * 100)}%).`,
      );
    if (dailyLossUsedRatio != null && dailyLossUsedRatio >= 0.4)
      triggeredBy.push("DAILY_LIMIT");
    if (dd != null && dd >= 0.1) triggeredBy.push("DRAWDOWN");
    if (survivalScore != null && survivalScore < 70)
      triggeredBy.push("SURVIVAL");
    if (topDev === "MEDIUM") triggeredBy.push("BEHAVIOR");
    return {
      state: "WARNING",
      headline: "Risk building — tighten discipline.",
      reasons: reasons.slice(0, 3),
      recommendedAction: "Trade only A+ setups. Keep size small.",
      explain: {
        triggeredBy,
        metrics: {
          dailyLossUsedPct: dailyUsedPct,
          drawdownPct: ddPct,
          survivalScore,
          topDeviationSeverity: topDev,
        },
      },
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
    headline: "Risk is within normal bounds.",
    reasons: ["Risk is within normal bounds."],
    recommendedAction: "Keep plan. Maintain discipline.",
    explain: {
      triggeredBy: [],
      metrics: {
        dailyLossUsedPct: dailyUsedPct,
        drawdownPct: ddPct,
        survivalScore,
        topDeviationSeverity: topDev,
      },
    },
    flags: {
      dailyLimitBreached: dailyBreached,
      dailyLossUsedRatio,
      currentDrawdownPct: dd,
      survivalScore,
      topDeviationSeverity: topDev,
    },
  };
}

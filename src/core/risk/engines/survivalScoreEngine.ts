// src/core/risk/engines/survivalScoreEngine.ts

import type { EquityAnalysis } from "./equityEngine";
import type { ExposureAnalysis } from "./exposureEngine";
import type { DailyLossAnalysis } from "./dailyLossEngine";
import type { Deviation } from "./deviationEngine";

/**
 * Capital Survival Score Engine (v1)
 *
 * Deterministic weighted model.
 * No AI. No guessing.
 */

export type SurvivalScoreBreakdown = {
  drawdownScore: number; // 0-100
  exposureScore: number; // 0-100
  dailyLossScore: number; // 0-100
  behaviorScore: number; // 0-100
};

export type SurvivalScore = {
  score: number; // 0-100
  breakdown: SurvivalScoreBreakdown;
  grade: "A" | "B" | "C" | "D" | "F";
};

export function computeSurvivalScore(args: {
  equity: EquityAnalysis;
  exposure: ExposureAnalysis;
  daily: DailyLossAnalysis;
  deviations: Deviation[];
}): SurvivalScore {
  const drawdownScore = computeDrawdownScore(args.equity);
  const exposureScore = computeExposureScore(args.exposure);
  const dailyLossScore = computeDailyLossScore(args.daily);
  const behaviorScore = computeBehaviorScore(args.deviations);

  const weighted =
    drawdownScore * 0.3 +
    exposureScore * 0.25 +
    dailyLossScore * 0.2 +
    behaviorScore * 0.25;

  const score = clamp(Math.round(weighted), 0, 100);

  return {
    score,
    breakdown: {
      drawdownScore,
      exposureScore,
      dailyLossScore,
      behaviorScore,
    },
    grade: scoreToGrade(score),
  };
}

/* -----------------------------
   Component Scores
----------------------------- */

function computeDrawdownScore(equity: EquityAnalysis): number {
  const dd = Math.max(0, Number(equity.currentDrawdownPct ?? 0)); // 0..1
  const maxDD = Math.max(0, Number(equity.maxDrawdownPct ?? 0)); // 0..1

  // ✅ Pro-Logik:
  // - current DD = "jetzt gefährlich" (70% Gewicht)
  // - maxDD = "historische Fragilität" (30% Gewicht)
  // - maxDD wirkt nur teilweise, damit ein alter DD dich nicht für immer zerstört
  const ddWeighted = dd * 0.7 + maxDD * 0.3;

  // Score mapping (smooth-ish, aber deterministisch):
  // 0% => 100
  // 10% => 80
  // 20% => 60
  // 30% => 40
  // 40% => 20
  // 50% => 0
  const score = 100 - ddWeighted * 200;

  return clamp(Math.round(score), 0, 100);
}

function computeExposureScore(exposure: ExposureAnalysis): number {
  if (exposure.totalExposure === 0) return 100;

  const lev = exposure.effectiveLeverage ?? 0;
  const concentration = exposure.concentration.topShare ?? 0;

  // leverage penalty
  const levPenalty =
    lev <= 2 ? 0 : lev <= 5 ? (lev - 2) * 5 : 15 + (lev - 5) * 10;

  // concentration penalty
  const concPenalty = concentration > 0.5 ? (concentration - 0.5) * 100 : 0;

  const score = 100 - levPenalty - concPenalty;

  return clamp(Math.round(score), 0, 100);
}

function computeDailyLossScore(daily: DailyLossAnalysis): number {
  const start = daily.dayStartEquity;
  const pnlPct = daily.dailyPnlPct;

  // Wenn wir keinen Start oder keine PnL% haben: neutral (nicht bestrafen)
  if (
    start == null ||
    !Number.isFinite(start) ||
    pnlPct == null ||
    !Number.isFinite(pnlPct)
  ) {
    return 100;
  }

  // Gewinne => 100
  if (pnlPct >= 0) return 100;

  const lossPct = Math.abs(pnlPct); // z.B. 0.001 = 0.1%
  const limit = daily.limit?.dailyLossLimitPct ?? 0.03; // default 3%

  // Guard: wenn limit komisch ist
  if (!Number.isFinite(limit) || limit <= 0) return 100;

  // Ratio: 0.0 .. 1.0 .. >1.0
  const ratio = lossPct / limit;

  // ✅ Noise band: bis 10% vom Daily-Limit kein Penalty
  // Beispiel bei 3% Limit: 0.3% Verlust => noch 0 Penalty
  if (ratio <= 0.1) return 100;

  // ✅ Piecewise: je näher am Limit, desto härter
  // 0.10..0.50 => mild
  // 0.50..0.80 => medium
  // 0.80..1.00 => heavy
  // >1.00      => almost dead
  let penalty = 0;

  if (ratio <= 0.5) {
    // 0..20 penalty
    // linear zwischen 0.10 -> 0, 0.50 -> 20
    const t = (ratio - 0.1) / (0.5 - 0.1);
    penalty = 20 * t;
  } else if (ratio <= 0.8) {
    // 20..50 penalty
    const t = (ratio - 0.5) / (0.8 - 0.5);
    penalty = 20 + 30 * t;
  } else if (ratio <= 1.0) {
    // 50..80 penalty
    const t = (ratio - 0.8) / (1.0 - 0.8);
    penalty = 50 + 30 * t;
  } else {
    // über Limit: 80..100 penalty (cap)
    const t = Math.min(1, (ratio - 1.0) / 0.5); // bei 1.5x Limit => 100
    penalty = 80 + 20 * t;
  }

  const score = 100 - penalty;
  return clamp(Math.round(score), 0, 100);
}

function computeBehaviorScore(deviations: Deviation[]): number {
  if (!deviations.length) return 100;

  let penalty = 0;

  for (const d of deviations) {
    switch (d.severity) {
      case "CRITICAL":
        penalty += 30;
        break;
      case "HIGH":
        penalty += 20;
        break;
      case "MEDIUM":
        penalty += 10;
        break;
      case "LOW":
        penalty += 5;
        break;
    }
  }

  return clamp(100 - penalty, 0, 100);
}

/* -----------------------------
   Utilities
----------------------------- */

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

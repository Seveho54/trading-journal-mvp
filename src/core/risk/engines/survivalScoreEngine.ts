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
  const dd = Math.max(0, Number(equity.currentDrawdownPct ?? 0));
  const maxDD = Math.max(0, Number(equity.maxDrawdownPct ?? 0));

  // ✅ falls current leer ist, nimm maxDD (und umgekehrt)
  const effective = Math.max(dd, maxDD);

  // Score: 0% DD => 100, 50% DD => ~0 (linear, easy & predictable)
  const score = 100 - effective * 200;

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
  if (!daily.dayStartEquity || !daily.dailyPnlPct) return 100;

  if (daily.dailyPnlPct >= 0) return 100;

  const lossPct = Math.abs(daily.dailyPnlPct);
  const limit = daily.limit.dailyLossLimitPct;

  const ratio = limit > 0 ? lossPct / limit : 0;

  const penalty =
    ratio >= 1
      ? 80
      : ratio >= 0.7
        ? 50
        : ratio >= 0.5
          ? 30
          : ratio >= 0.3
            ? 15
            : 5;

  return clamp(100 - penalty, 0, 100);
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

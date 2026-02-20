// src/core/risk/riskOS.ts

import type { RiskEvent } from "./types";
import { buildBehaviorBaselines } from "./engines/baselineEngine";
import { detectDeviations } from "./engines/deviationEngine";
import { buildActions } from "./engines/actionsEngine";
import { computeSurvivalScore } from "./engines/survivalScoreEngine";
import { analyzeEquity } from "./engines/equityEngine";
import { analyzeExposure } from "./engines/exposureEngine";
import { analyzeDailyLoss } from "./engines/dailyLossEngine";

export function computeRiskOS(args: { events: RiskEvent[]; nowTs?: number }) {
  const equity = analyzeEquity(args.events);
  const exposure = analyzeExposure({
    events: args.events,
    equity: equity.currentEquity,
  });
  const daily = analyzeDailyLoss({
    events: args.events,
    currentEquity: equity.currentEquity,
    currentTs: args.nowTs,
  });

  const baselines = buildBehaviorBaselines({
    events: args.events,
    nowTs: args.nowTs,
  });

  const deviationPack = detectDeviations({
    events: args.events,
    baselines,
    nowTs: args.nowTs,
  });

  const actionPack = buildActions({
    deviations: deviationPack.deviations,
    nowTs: args.nowTs,
  });

  const survival = computeSurvivalScore({
    equity,
    exposure,
    daily,
    deviations: deviationPack.deviations,
  });

  return {
    equity,
    exposure,
    daily,
    baselines,
    deviations: deviationPack,
    actions: actionPack,
    survival,
  };
}

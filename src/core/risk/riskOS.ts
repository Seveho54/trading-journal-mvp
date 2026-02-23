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
  const nowTs = args.nowTs ?? Date.now();
  const events = [...args.events].sort((a, b) => a.ts - b.ts);

  const equity = analyzeEquity(events);

  const exposure = analyzeExposure({
    events,
    equity: equity.currentEquity,
  });

  const daily = analyzeDailyLoss({
    events,
    currentEquity: equity.currentEquity,
    currentTs: nowTs,
  });

  const baselines = buildBehaviorBaselines({
    events,
    nowTs,
  });

  const deviationPack = detectDeviations({
    events,
    baselines,
    nowTs,
  });

  const actionPack = buildActions({
    deviations: deviationPack.deviations,
    nowTs,
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

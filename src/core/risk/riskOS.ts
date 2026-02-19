// src/core/risk/riskOS.ts

import type { RiskEvent } from "./schema";
import { buildBehaviorBaselines } from "./engines/baselineEngine";
import { detectDeviations } from "./engines/deviationEngine";

export function computeRiskOS(args: { events: RiskEvent[]; nowTs?: number }) {
  const baselines = buildBehaviorBaselines({
    events: args.events,
    nowTs: args.nowTs,
  });
  const deviations = detectDeviations({
    events: args.events,
    baselines,
    nowTs: args.nowTs,
  });

  return { baselines, deviations };
}

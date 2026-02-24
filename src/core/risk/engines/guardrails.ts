export type Guardrails = {
  dailyLossLimitPct: number; // z.B. 0.03
  ddWarningPct: number; // z.B. 0.10
  ddHardStopPct: number; // z.B. 0.25
  lossStreakHardStop: number; // z.B. 4
  survivalHardStop: number; // z.B. 40
};

export const DEFAULT_GUARDRAILS: Guardrails = {
  dailyLossLimitPct: 0.03,
  ddWarningPct: 0.1,
  ddHardStopPct: 0.25,
  lossStreakHardStop: 4,
  survivalHardStop: 40,
};

// src/core/risk/engines/actionsEngine.ts

import type { Deviation, DeviationSeverity } from "./deviationEngine";

/**
 * Actions Engine (v1)
 *
 * Deterministic mapping:
 * Deviation -> concrete action with parameters.
 *
 * Design:
 * - max 3 actions
 * - 1 action per deviation (most of the time)
 * - severity influences strength of intervention (cooldown duration etc.)
 * - explainable: every action includes "because"
 */

export type ActionId =
  | "COOLDOWN"
  | "REDUCE_SIZE_TO_BASELINE"
  | "REDUCE_LEVERAGE_TO_BASELINE"
  | "STOP_FOR_TODAY"
  | "LIMIT_TRADES_TODAY";

export type RiskAction = {
  id: ActionId;
  severity: DeviationSeverity;

  title: string;
  text: string; // what to do
  because: string; // why (explainable)

  // future: can be executed by Guardrails/SoftLock
  params?: Record<string, any>;
};

export type ActionPack = {
  actions: RiskAction[]; // sorted, max 3
  meta: { computedAt: number; notes: string[] };
};

export function buildActions(args: {
  deviations: Deviation[];
  nowTs?: number;
}): ActionPack {
  const nowTs = Number.isFinite(Number(args.nowTs))
    ? Number(args.nowTs)
    : Date.now();
  const notes: string[] = [];

  if (!args.deviations?.length) {
    return {
      actions: [],
      meta: { computedAt: nowTs, notes: ["No deviations => no actions."] },
    };
  }

  // best practice: sort by severity already (but we re-sort safely)
  const sorted = [...args.deviations].sort(
    (a, b) => severityScore(b.severity) - severityScore(a.severity),
  );

  const actions: RiskAction[] = [];

  for (const d of sorted) {
    const a = mapDeviationToAction(d);
    if (!a) continue;

    // de-dupe by action id (avoid spamming same action)
    if (actions.some((x) => x.id === a.id)) continue;

    actions.push(a);

    if (actions.length >= 3) break;
  }

  // fallback: if we still have 0 actions but deviations exist (shouldn't happen)
  if (!actions.length) {
    notes.push(
      "No action mapping matched. Consider updating mapDeviationToAction().",
    );
  }

  return { actions, meta: { computedAt: nowTs, notes } };
}

function mapDeviationToAction(d: Deviation): RiskAction | null {
  switch (d.id) {
    case "LOSS_STREAK": {
      const cooldownMin =
        d.actionHint?.params?.cooldownMin ?? severityCooldown(d.severity);
      const isCritical = d.severity === "CRITICAL";

      return {
        id: isCritical ? "STOP_FOR_TODAY" : "COOLDOWN",
        severity: d.severity,
        title: isCritical ? "Stop trading for today" : "Cooldown after losses",
        text: isCritical
          ? "Stop trading for the rest of the day. Protect capital."
          : `Take a ${cooldownMin} min cooldown before the next trade.`,
        because: `Because a loss streak was detected (${d.evidence?.now?.lossStreak ?? "?"} consecutive losses).`,
        params: isCritical ? { until: "END_OF_DAY" } : { cooldownMin },
      };
    }

    case "TRADE_FREQ_SPIKE": {
      const cooldownMin =
        d.actionHint?.params?.cooldownMin ?? severityCooldown(d.severity);
      return {
        id: "LIMIT_TRADES_TODAY",
        severity: d.severity,
        title: "Reduce trading frequency",
        text: `Pause trading for ${cooldownMin} min. Then trade only A+ setups.`,
        because: `Because your trades/day is ${fmt(d.evidence?.now?.tradesPerDay)} vs baseline ${fmt(
          d.evidence?.baseline?.tradesPerDay,
        )} (ratio ${fmt(d.evidence?.deltas?.ratio)}).`,
        params: { cooldownMin, mode: "A_SETUP_ONLY" },
      };
    }

    case "RAPID_FIRE_TRADING": {
      const cooldownMin = Math.max(10, severityCooldown(d.severity));
      return {
        id: "COOLDOWN",
        severity: d.severity,
        title: "Stop rapid-fire trading",
        text: `Force a ${cooldownMin} min cooldown. Slow down decision cycle.`,
        because: `Because trade gaps shrank: recent median ${fmt(
          d.evidence?.now?.recentMedianGapMin,
        )}m vs previous ${fmt(d.evidence?.baseline?.prevMedianGapMin)}m (ratio ${fmt(d.evidence?.deltas?.ratio)}).`,
        params: { cooldownMin },
      };
    }

    case "SIZE_DRIFT": {
      const target = d.actionHint?.params?.targetNotional ?? null;
      return {
        id: "REDUCE_SIZE_TO_BASELINE",
        severity: d.severity,
        title: "Reduce position size",
        text: target
          ? `Reduce notional per trade toward your baseline (~${fmt(target)}).`
          : "Reduce notional per trade toward your baseline.",
        because: `Because your median notional is ${fmt(d.evidence?.now?.medianNotional)} vs baseline ${fmt(
          d.evidence?.baseline?.medianNotional,
        )} (ratio ${fmt(d.evidence?.deltas?.ratio)}).`,
        params: target ? { targetNotional: target } : undefined,
      };
    }

    case "LEVERAGE_SPIKE": {
      const target = d.actionHint?.params?.targetEffLev ?? null;
      return {
        id: "REDUCE_LEVERAGE_TO_BASELINE",
        severity: d.severity,
        title: "Reduce effective leverage",
        text: target
          ? `Reduce effective leverage toward baseline (~${fmt(target)}).`
          : "Reduce effective leverage toward baseline.",
        because: `Because your median effective leverage is ${fmt(d.evidence?.now?.medianEffLev)} vs baseline ${fmt(
          d.evidence?.baseline?.medianEffLev,
        )} (ratio ${fmt(d.evidence?.deltas?.ratio)}).`,
        params: target ? { targetEffLev: target } : undefined,
      };
    }

    default:
      return null;
  }
}

function severityCooldown(s: DeviationSeverity) {
  switch (s) {
    case "CRITICAL":
      return 60;
    case "HIGH":
      return 30;
    case "MEDIUM":
      return 20;
    case "LOW":
      return 10;
  }
}

function severityScore(s: DeviationSeverity) {
  switch (s) {
    case "CRITICAL":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
  }
}

function fmt(x: any) {
  const n = Number(x);
  return Number.isFinite(n) ? (Math.round(n * 100) / 100).toString() : "—";
}

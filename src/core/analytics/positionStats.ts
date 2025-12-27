// src/core/analytics/positionStats.ts
import type { Position } from "../positions/buildPositions";

function safeNum(n: any) {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function ts(s?: string) {
  return s ? new Date(s).getTime() : 0;
}

export type PositionStats = {
  positions: number;
  wins: number;
  losses: number;
  winRate: number;

  totalNetProfit: number;

  avgWin: number;
  avgLoss: number; // negativ
  profitFactor: number; // grossProfit / abs(grossLoss)

  avgHoldMinutes: number;
  maxDrawdown: number; // negativ (Equity-Drawdown)
};

export function buildPositionStats(positions: Position[]): PositionStats {
  const closed = (positions ?? []).filter((p) => p.closedAt);

  const profits = closed.map((p) => safeNum(p.netProfit));
  const wins = profits.filter((x) => x > 0);
  const losses = profits.filter((x) => x < 0);

  const totalNetProfit = profits.reduce((a, b) => a + b, 0);

  const grossProfit = wins.reduce((a, b) => a + b, 0);
  const grossLoss = losses.reduce((a, b) => a + b, 0); // negativ

  const winRate = closed.length ? wins.length / closed.length : 0;
  const avgWin = wins.length ? grossProfit / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;

  const profitFactor = Math.abs(grossLoss) > 0 ? grossProfit / Math.abs(grossLoss) : (grossProfit > 0 ? Infinity : 0);

  // Holding time
  const holds = closed.map((p) => {
    const open = ts(p.openedAt);
    const close = ts(p.closedAt);
    const ms = Math.max(0, close - open);
    return ms / 60000;
  });
  const avgHoldMinutes = holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : 0;

  // Max drawdown from equity curve (sorted by closedAt)
  const sorted = [...closed].sort((a, b) => ts(a.closedAt) - ts(b.closedAt));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0; // negative

  for (const p of sorted) {
    equity += safeNum(p.netProfit);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  }

  return {
    positions: closed.length,
    wins: wins.length,
    losses: losses.length,
    winRate,
    totalNetProfit,
    avgWin,
    avgLoss,
    profitFactor,
    avgHoldMinutes,
    maxDrawdown,
  };
}

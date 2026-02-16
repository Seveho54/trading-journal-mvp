// src/core/analytics/positionStats.ts
import type { Position } from "../positions/buildPositions";

function safeNum(n: any) {
  const x =
    typeof n === "number"
      ? n
      : typeof n === "string"
        ? Number(n.replace(",", "."))
        : Number(n);
  return Number.isFinite(x) ? x : 0;
}

function ts(s?: string | number | Date) {
  if (!s) return 0;
  if (typeof s === "number") return Number.isFinite(s) ? s : 0;
  if (s instanceof Date) return s.getTime();
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : 0;
}

export type PositionStats = {
  positions: number;
  wins: number;
  losses: number;
  winRate: number;

  totalNetProfit: number;
  avgPnlPerPosition: number;

  avgWin: number;
  avgLoss: number; // negativ
  profitFactor: number;

  avgHoldMinutes: number;
  maxDrawdown: number; // negativ
};

export function buildPositionStats(positions: Position[]): PositionStats {
  const closed = (positions ?? []).filter((p) => !!p.closedAt);

  const profits = closed.map((p) => safeNum(p.netProfit));
  const winsArr = profits.filter((x) => x > 0);
  const lossesArr = profits.filter((x) => x < 0);

  const totalNetProfit = profits.reduce((a, b) => a + b, 0);
  const avgPnlPerPosition = closed.length ? totalNetProfit / closed.length : 0;

  const grossProfit = winsArr.reduce((a, b) => a + b, 0);
  const grossLoss = lossesArr.reduce((a, b) => a + b, 0); // negativ

  const wins = winsArr.length;
  const losses = lossesArr.length;

  const winRate = closed.length ? wins / closed.length : 0;
  const avgWin = wins ? grossProfit / wins : 0;
  const avgLoss = losses ? grossLoss / losses : 0;

  const profitFactor =
    Math.abs(grossLoss) > 0
      ? grossProfit / Math.abs(grossLoss)
      : grossProfit > 0
        ? Infinity
        : 0;

  // Holding time: openedAt -> closedAt (muss in buildPositions korrekt gesetzt sein!)
  const holds = closed.map((p) => {
    const open = ts(p.openedAt);
    const close = ts(p.closedAt);
    const ms = Math.max(0, close - open);
    return ms / 60000;
  });
  const avgHoldMinutes = holds.length
    ? holds.reduce((a, b) => a + b, 0) / holds.length
    : 0;

  // Max drawdown from equity curve (chronologisch nach closedAt)
  const sorted = [...closed].sort((a, b) => ts(a.closedAt) - ts(b.closedAt));
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const p of sorted) {
    equity += safeNum(p.netProfit);
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  }

  return {
    positions: closed.length,
    wins,
    losses,
    winRate,
    totalNetProfit,
    avgPnlPerPosition,
    avgWin,
    avgLoss,
    profitFactor,
    avgHoldMinutes,
    maxDrawdown,
  };
}

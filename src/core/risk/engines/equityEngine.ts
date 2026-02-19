// src/core/risk/engines/equityEngine.ts

import { RiskEvent, AccountSnapshotEvent } from "../schema";

export type EquityPoint = {
  ts: number;
  equity: number;
};

export type DrawdownPoint = {
  ts: number;
  equity: number;
  peakEquity: number;
  drawdownPct: number; // 0–1
};

export type EquityAnalysis = {
  currentEquity: number | null;
  currentDrawdownPct: number | null;
  maxDrawdownPct: number;
  equityCurve: EquityPoint[];
  drawdownCurve: DrawdownPoint[];
};

function safeNumber(x: any): number | null {
  const n = Number(x);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0; // equity should not go negative
  return n;
}

export function analyzeEquity(events: RiskEvent[]): EquityAnalysis {
  const accountEvents = events
    .filter((e): e is AccountSnapshotEvent => e.type === "ACCOUNT_SNAPSHOT")
    .sort((a, b) => a.ts - b.ts);

  if (!accountEvents.length) {
    return {
      currentEquity: null,
      currentDrawdownPct: null,
      maxDrawdownPct: 0,
      equityCurve: [],
      drawdownCurve: [],
    };
  }

  let peak = -Infinity;
  let maxDD = 0;

  const equityCurve: EquityPoint[] = [];
  const drawdownCurve: DrawdownPoint[] = [];

  for (const e of accountEvents) {
    const equity = safeNumber(e.data.equity);

    // Skip invalid equity
    if (equity == null) continue;

    equityCurve.push({
      ts: e.ts,
      equity,
    });

    if (equity > peak) {
      peak = equity;
    }

    const drawdown = peak > 0 ? Math.max(0, (peak - equity) / peak) : 0;

    if (drawdown > maxDD) {
      maxDD = drawdown;
    }

    drawdownCurve.push({
      ts: e.ts,
      equity,
      peakEquity: peak,
      drawdownPct: drawdown,
    });
  }

  const last = drawdownCurve[drawdownCurve.length - 1];

  return {
    currentEquity: last?.equity ?? null,
    currentDrawdownPct: last?.drawdownPct ?? null,
    maxDrawdownPct: maxDD,
    equityCurve,
    drawdownCurve,
  };
}

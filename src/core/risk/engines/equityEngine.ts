// src/core/risk/engines/equityEngine.ts
import type { RiskEvent } from "../types";

export type EquityPoint = { ts: number; equity: number };

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
  // debug (super hilfreich fürs Vertrauen)
  anchorTs: number | null;
  anchorEquity: number | null;
  tradesUsed: number;
  netRealizedUsed: number;
  peakEquity: number | null;
};

function num(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function clampEquity(x: number): number {
  // Equity darf nicht negativ sein (für Risk OS)
  return x < 0 ? 0 : x;
}

export function analyzeEquity(events: RiskEvent[]): EquityAnalysis {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);

  // 1) Anchor = latest EQUITY_SNAPSHOT (Bitget current equity)
  const snaps = sorted.filter((e) => e.type === "EQUITY_SNAPSHOT");
  const anchor = snaps.length ? snaps[snaps.length - 1] : null;

  const anchorEquityRaw = anchor
    ? num(anchor.equity ?? anchor.meta?.equity)
    : null;
  const anchorEquity =
    anchorEquityRaw != null ? clampEquity(anchorEquityRaw) : null;
  const anchorTs = anchor?.ts ?? null;

  // 2) Trades we use for reconstruction (only those <= anchorTs if anchor exists)
  const tradeEvents = sorted.filter((e) => e.type === "TRADE_CLOSE");
  const usableTrades =
    anchorTs != null
      ? tradeEvents.filter((t) => t.ts <= anchorTs)
      : tradeEvents;

  // If we have no anchor and no trades, nothing to do.
  if (anchorEquity == null && usableTrades.length === 0) {
    return {
      currentEquity: null,
      currentDrawdownPct: null,
      maxDrawdownPct: 0,
      equityCurve: [],
      drawdownCurve: [],
      anchorTs: null,
      anchorEquity: null,
      tradesUsed: 0,
      netRealizedUsed: 0,
      peakEquity: null,
    };
  }

  // Helper: net for trade
  const netOf = (t: RiskEvent) => {
    const rp = num(t.realizedPnl) ?? 0;
    const fee = num(t.fee) ?? 0;
    return rp - fee;
  };

  // 3) Build cumulative net timeline (chronological)
  let cum = 0;
  const points: Array<{ ts: number; cumNet: number }> = [];
  for (const t of usableTrades) {
    cum += netOf(t);
    points.push({ ts: t.ts, cumNet: cum });
  }
  const totalNet = cum;

  // 4) Reconstruct equity curve
  // If anchor exists, we "back-cast" so last equity = anchorEquity exactly.
  // equityAtTrade_i = anchorEquity - (totalNet - cumNet_i)
  // If no anchor: start at 0 and cum forward (still deterministic, but less "real").
  const equityCurve: EquityPoint[] = [];

  if (usableTrades.length) {
    for (const p of points) {
      const eq =
        anchorEquity != null ? anchorEquity - (totalNet - p.cumNet) : p.cumNet; // no anchor => equity = cumNet (starting at 0)
      equityCurve.push({ ts: p.ts, equity: clampEquity(eq) });
    }
  }

  // Add anchor point at end (makes "current equity" always correct in curve)
  if (anchorEquity != null && anchorTs != null) {
    equityCurve.push({ ts: anchorTs, equity: clampEquity(anchorEquity) });
    equityCurve.sort((a, b) => a.ts - b.ts);
  }

  // 5) Drawdown calc
  let peak = -Infinity;
  let maxDD = 0;

  const drawdownCurve: DrawdownPoint[] = [];
  for (const pt of equityCurve) {
    if (pt.equity > peak) peak = pt.equity;
    const dd = peak > 0 ? Math.max(0, (peak - pt.equity) / peak) : 0;
    if (dd > maxDD) maxDD = dd;
    drawdownCurve.push({
      ts: pt.ts,
      equity: pt.equity,
      peakEquity: peak,
      drawdownPct: dd,
    });
  }

  const last = drawdownCurve.length
    ? drawdownCurve[drawdownCurve.length - 1]
    : null;

  return {
    currentEquity: anchorEquity ?? last?.equity ?? null,
    currentDrawdownPct: last?.drawdownPct ?? null,
    maxDrawdownPct: maxDD,
    equityCurve,
    drawdownCurve,
    anchorTs,
    anchorEquity,
    tradesUsed: usableTrades.length,
    netRealizedUsed: totalNet,
    peakEquity: drawdownCurve.length
      ? drawdownCurve[drawdownCurve.length - 1].peakEquity
      : null,
  };
}

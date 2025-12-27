// src/core/analytics/tradeSummaryPositions.ts
export type TradeSummaryPositions = {
    positions: number;
    wins: number;
    losses: number;
    winRate: number;
  
    totalNetProfit: number;
  
    grossProfit: number;
    grossLoss: number; // negative Zahl (Summe der Verluste)
  
    profitFactor: number; // grossProfit / abs(grossLoss)
  
    avgWin: number;
    avgLoss: number; // negative Zahl
    expectancy: number; // avg profit per position
  
    maxDrawdown: number; // negativ
    bestPosition: { id: string; symbol: string; netProfit: number } | null;
    worstPosition: { id: string; symbol: string; netProfit: number } | null;
  
    maxWinStreak: number;
    maxLossStreak: number;
  };
  
  function safeNum(n: any) {
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
  }
  
  function timeOf(p: any) {
    const t = p.closedAt ?? p.openedAt;
    const ms = new Date(String(t ?? "")).getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  
  export function buildTradeSummaryFromPositions(positions: any[]): TradeSummaryPositions {
    const list = [...(positions ?? [])].filter(Boolean);
  
    // sort chronologisch (für streaks & DD)
    list.sort((a, b) => timeOf(a) - timeOf(b));
  
    const pnls = list.map((p) => safeNum(p.netProfit));
    const positionsCount = list.length;
  
    let wins = 0;
    let losses = 0;
  
    let grossProfit = 0;
    let grossLoss = 0; // negative
  
    let best: any = null;
    let worst: any = null;
  
    // streaks
    let curWin = 0;
    let curLoss = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
  
    // drawdown
    let equity = 0;
    let peak = 0;
    let maxDrawdown = 0; // negativ
  
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      const pnl = pnls[i];
  
      // wins/losses
      if (pnl > 0) wins++;
      if (pnl < 0) losses++;
  
      if (pnl > 0) grossProfit += pnl;
      if (pnl < 0) grossLoss += pnl;
  
      // best/worst
      if (!best || pnl > safeNum(best.netProfit)) best = { id: p.id, symbol: p.symbol, netProfit: pnl };
      if (!worst || pnl < safeNum(worst.netProfit)) worst = { id: p.id, symbol: p.symbol, netProfit: pnl };
  
      // streaks
      if (pnl > 0) {
        curWin++;
        curLoss = 0;
        maxWinStreak = Math.max(maxWinStreak, curWin);
      } else if (pnl < 0) {
        curLoss++;
        curWin = 0;
        maxLossStreak = Math.max(maxLossStreak, curLoss);
      } else {
        // pnl == 0 resets both (simple)
        curWin = 0;
        curLoss = 0;
      }
  
      // DD
      equity += pnl;
      peak = Math.max(peak, equity);
      maxDrawdown = Math.min(maxDrawdown, equity - peak);
    }
  
    const totalNetProfit = pnls.reduce((a, b) => a + b, 0);
    const winRate = positionsCount > 0 ? wins / positionsCount : 0;
  
    const avgWin = wins > 0 ? grossProfit / wins : 0;
    const avgLoss = losses > 0 ? grossLoss / losses : 0; // negative
  
    const expectancy = positionsCount > 0 ? totalNetProfit / positionsCount : 0;
  
    const profitFactor = Math.abs(grossLoss) > 0 ? grossProfit / Math.abs(grossLoss) : Infinity;
  
    return {
      positions: positionsCount,
      wins,
      losses,
      winRate,
      totalNetProfit,
      grossProfit,
      grossLoss,
      profitFactor,
      avgWin,
      avgLoss,
      expectancy,
      maxDrawdown,
      bestPosition: best,
      worstPosition: worst,
      maxWinStreak,
      maxLossStreak,
    };
  }
  
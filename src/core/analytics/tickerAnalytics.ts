// src/core/analytics/tickerAnalytics.ts

export type TickerRow = {
    symbol: string;
  
    positions: number;
    wins: number;
    losses: number;
    winRate: number;
  
    totalNetProfit: number;
    totalProfit: number;
    totalLoss: number; // negative number
    profitFactor: number;
  
    avgWin: number;
    avgLoss: number; // negative number
  
    avgHoldMinutes: number;
  };
  
  function safeNum(n: any) {
    return typeof n === "number" && Number.isFinite(n) ? n : 0;
  }
  
  function diffMinutes(aIso?: string, bIso?: string) {
    if (!aIso || !bIso) return 0;
    const a = new Date(aIso).getTime();
    const b = new Date(bIso).getTime();
    if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
    return Math.max(0, (b - a) / 60000);
  }
  
  export function buildTickerAnalyticsFromPositions(positions: any[]): TickerRow[] {
    const pos = Array.isArray(positions) ? positions : [];
    const map = new Map<string, any[]>();
  
    for (const p of pos) {
      const sym = String(p.symbol ?? "").trim();
      if (!sym) continue;
      const list = map.get(sym) ?? [];
      list.push(p);
      map.set(sym, list);
    }
  
    const rows: TickerRow[] = [];
  
    for (const [symbol, list] of map.entries()) {
      const pnls = list.map((p) => safeNum(p.netProfit));
  
      const positionsCount = list.length;
      const wins = pnls.filter((x) => x > 0).length;
      const losses = pnls.filter((x) => x < 0).length;
  
      const totalNetProfit = pnls.reduce((a, b) => a + b, 0);
      const totalProfit = pnls.filter((x) => x > 0).reduce((a, b) => a + b, 0);
      const totalLoss = pnls.filter((x) => x < 0).reduce((a, b) => a + b, 0); // negative
  
      const profitFactor =
        Math.abs(totalLoss) > 0.00000001 ? totalProfit / Math.abs(totalLoss) : Number.POSITIVE_INFINITY;
  
      const avgWin = wins > 0 ? totalProfit / wins : 0;
      const avgLoss = losses > 0 ? totalLoss / losses : 0; // negative
  
      const holds = list.map((p) => diffMinutes(p.openedAt, p.closedAt)).filter((m) => m > 0);
      const avgHoldMinutes = holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : 0;
  
      rows.push({
        symbol,
        positions: positionsCount,
        wins,
        losses,
        winRate: positionsCount > 0 ? wins / positionsCount : 0,
        totalNetProfit,
        totalProfit,
        totalLoss,
        profitFactor,
        avgWin,
        avgLoss,
        avgHoldMinutes,
      });
    }
  
    // default: nach Net Profit absteigend
    rows.sort((a, b) => (b.totalNetProfit ?? 0) - (a.totalNetProfit ?? 0));
    return rows;
  }
  
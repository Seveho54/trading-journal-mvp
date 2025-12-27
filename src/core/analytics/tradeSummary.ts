// src/core/analytics/tradeSummary.ts

export type TradeSummary = {
    positions: number;
    wins: number;
    losses: number;
    winRate: number;
  
    totalNetProfit: number;
  
    totalProfit: number; // sum of positive pnl
    totalLoss: number; // sum of negative pnl (negative number)
    profitFactor: number; // totalProfit / abs(totalLoss)
  
    avgProfit: number;
    avgLoss: number;
  
    longestHoldMinutes: number;
    shortestHoldMinutes: number;
    avgHoldMinutes: number;
  
    // Histogram über PnL% (z.B. -20%..+20% usw.)
    pnlPctBuckets: { label: string; count: number }[];
  
    // Duration buckets
    durationBuckets: { label: string; count: number; totalNetProfit: number }[];
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
  
  export function buildTradeSummaryFromPositions(positions: any[]): TradeSummary {
    const pos = Array.isArray(positions) ? positions : [];
  
    const pnls = pos.map((p) => safeNum(p.netProfit));
    const positionsCount = pos.length;
  
    const wins = pnls.filter((x) => x > 0).length;
    const losses = pnls.filter((x) => x < 0).length;
  
    const totalNetProfit = pnls.reduce((a, b) => a + b, 0);
  
    const totalProfit = pnls.filter((x) => x > 0).reduce((a, b) => a + b, 0);
    const totalLoss = pnls.filter((x) => x < 0).reduce((a, b) => a + b, 0); // negative
  
    const profitFactor =
      Math.abs(totalLoss) > 0.00000001 ? totalProfit / Math.abs(totalLoss) : Number.POSITIVE_INFINITY;
  
    const avgProfit = wins > 0 ? totalProfit / wins : 0;
    const avgLoss = losses > 0 ? totalLoss / losses : 0; // negative
  
    // Hold times
    const holds = pos.map((p) => diffMinutes(p.openedAt, p.closedAt)).filter((m) => m > 0);
    const longestHoldMinutes = holds.length ? Math.max(...holds) : 0;
    const shortestHoldMinutes = holds.length ? Math.min(...holds) : 0;
    const avgHoldMinutes = holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : 0;
  
    // --- PnL% Histogram (netProfit / notionalEntry)
    // notionalEntry ≈ entryPrice * quantity (wenn vorhanden)
    const pct = pos
      .map((p) => {
        const entry = safeNum(p.entryPrice);
        const qty = safeNum(p.quantity);
        const notional = entry * qty;
        if (notional <= 0) return null;
        return (safeNum(p.netProfit) / notional) * 100;
      })
      .filter((x): x is number => x !== null && Number.isFinite(x));
  
    // Buckets wie dein Sheet-Feeling (du kannst später feinjustieren)
    const edges = [-20, -10, -5, -2, -1, 0, 1, 2, 5, 10, 20];
    const labels: string[] = [
      "Below -20%",
      "-20%..-10%",
      "-10%..-5%",
      "-5%..-2%",
      "-2%..-1%",
      "-1%..0%",
      "0%..1%",
      "1%..2%",
      "2%..5%",
      "5%..10%",
      "10%..20%",
      "Above 20%",
    ];
  
    const counts = new Array(labels.length).fill(0);
  
    for (const x of pct) {
      if (x < edges[0]) {
        counts[0]++;
        continue;
      }
      if (x > edges[edges.length - 1]) {
        counts[counts.length - 1]++;
        continue;
      }
      // finde bucket i: edges[i]..edges[i+1]
      let placed = false;
      for (let i = 0; i < edges.length - 1; i++) {
        if (x >= edges[i] && x <= edges[i + 1]) {
          counts[i + 1]++; // +1 weil counts[0] = below -20
          placed = true;
          break;
        }
      }
      if (!placed) counts[counts.length - 1]++;
    }
  
    const pnlPctBuckets = labels.map((label, i) => ({ label, count: counts[i] }));
  
    // --- Duration buckets (wie im Sheet: 0-1, 2-3, 4-7, 8-14, 15+ Tage)
    const durationDefs = [
      { label: "0–1d", min: 0, max: 1 },
      { label: "2–3d", min: 2, max: 3 },
      { label: "4–7d", min: 4, max: 7 },
      { label: "8–14d", min: 8, max: 14 },
      { label: "15+d", min: 15, max: 10_000 },
    ];
  
    const durationBuckets = durationDefs.map((d) => ({ label: d.label, count: 0, totalNetProfit: 0 }));
  
    for (const p of pos) {
      const mins = diffMinutes(p.openedAt, p.closedAt);
      const days = mins / (60 * 24);
  
      for (let i = 0; i < durationDefs.length; i++) {
        const def = durationDefs[i];
        if (days >= def.min && days <= def.max) {
          durationBuckets[i].count++;
          durationBuckets[i].totalNetProfit += safeNum(p.netProfit);
          break;
        }
      }
    }
  
    return {
      positions: positionsCount,
      wins,
      losses,
      winRate: positionsCount > 0 ? wins / positionsCount : 0,
  
      totalNetProfit,
  
      totalProfit,
      totalLoss,
      profitFactor,
  
      avgProfit,
      avgLoss,
  
      longestHoldMinutes,
      shortestHoldMinutes,
      avgHoldMinutes,
  
      pnlPctBuckets,
      durationBuckets,
    };
  }
  
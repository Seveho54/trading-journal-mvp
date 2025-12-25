import type { Position } from "../positions/buildPositions";

export function bySymbolPositions(positions: Position[]) {
  const map = new Map<
    string,
    {
      symbol: string;
      positions: number;
      wins: number;
      losses: number;
      winRate: number;
      totalNetProfit: number;
      totalRealizedPnl: number;
      totalNotional: number; // optional: qty*avg(entry,exit) als grob
    }
  >();

  for (const p of positions) {
    const key = p.symbol;
    const cur =
      map.get(key) ??
      {
        symbol: key,
        positions: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalNetProfit: 0,
        totalRealizedPnl: 0,
        totalNotional: 0,
      };

    cur.positions += 1;
    if (p.netProfit > 0) cur.wins += 1;
    if (p.netProfit < 0) cur.losses += 1;

    cur.totalNetProfit += p.netProfit ?? 0;
    cur.totalRealizedPnl += p.realizedPnl ?? 0;

    // grobes Notional für Position (entryQty * entryPrice)
    cur.totalNotional += (p.quantity ?? 0) * (p.entryPrice ?? 0);

    map.set(key, cur);
  }

  const out = Array.from(map.values());
  for (const r of out) r.winRate = r.positions ? r.wins / r.positions : 0;

  // sortiere nach NetProfit desc
  out.sort((a, b) => (b.totalNetProfit ?? 0) - (a.totalNetProfit ?? 0));
  return out;
}

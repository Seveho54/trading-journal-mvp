import type { Position } from "../positions/buildPositions";

function monthKey(iso: string) {
  // YYYY-MM
  return String(iso).slice(0, 7);
}

export function byMonthPositions(positions: Position[]) {
  const map = new Map<
    string,
    {
      month: string;
      positions: number;
      wins: number;
      losses: number;
      winRate: number;
      totalNetProfit: number;
      totalRealizedPnl: number;
      totalNotional: number;
    }
  >();

  for (const p of positions) {
    const when = p.closedAt ?? p.openedAt; // für Statistik eher closeAt
    const key = monthKey(when);

    const cur =
      map.get(key) ??
      {
        month: key,
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
    cur.totalNotional += (p.quantity ?? 0) * (p.entryPrice ?? 0);

    map.set(key, cur);
  }

  const out = Array.from(map.values());
  for (const r of out) r.winRate = r.positions ? r.wins / r.positions : 0;

  // sort chronologisch
  out.sort((a, b) => a.month.localeCompare(b.month));
  return out;
}

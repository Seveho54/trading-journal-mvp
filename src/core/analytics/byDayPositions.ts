import type { Position } from "../positions/buildPositions";

function dayKey(iso: string) {
  // YYYY-MM-DD
  return String(iso).slice(0, 10);
}

export function byDayPositions(positions: Position[]) {
  const map = new Map<
    string,
    {
      day: string;
      positions: number;
      wins: number;
      losses: number;
      winRate: number;
      totalNetProfit: number;
      totalRealizedPnl: number;
    }
  >();

  for (const p of positions) {
    const when = p.closedAt ?? p.openedAt;
    const key = dayKey(when);

    const cur =
      map.get(key) ??
      { day: key, positions: 0, wins: 0, losses: 0, winRate: 0, totalNetProfit: 0, totalRealizedPnl: 0 };

    cur.positions += 1;
    if (p.netProfit > 0) cur.wins += 1;
    if (p.netProfit < 0) cur.losses += 1;

    cur.totalNetProfit += p.netProfit ?? 0;
    cur.totalRealizedPnl += p.realizedPnl ?? 0;

    map.set(key, cur);
  }

  const out = Array.from(map.values());
  for (const r of out) r.winRate = r.positions ? r.wins / r.positions : 0;

  out.sort((a, b) => a.day.localeCompare(b.day));
  return out;
}

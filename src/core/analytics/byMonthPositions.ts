import type { Position } from "../positions/buildPositions";

function monthKeyUTC(when: any): string | null {
  const d = new Date(when);
  if (!Number.isFinite(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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
    // ✅ 1) ONLY closed positions for month stats
    if (!p.closedAt) continue;

    const key = monthKeyUTC(p.closedAt);
    if (!key) continue;

    const cur = map.get(key) ?? {
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

    const pnl = Number(p.netProfit ?? 0);
    if (pnl > 0) cur.wins += 1;
    else if (pnl < 0) cur.losses += 1;

    cur.totalNetProfit += pnl;
    cur.totalRealizedPnl += Number(p.realizedPnl ?? 0);

    // notional (best effort)
    const qty = Number(p.quantity ?? 0);
    const entry = Number(p.entryPrice ?? 0);
    cur.totalNotional += qty * entry;

    map.set(key, cur);
  }

  const out = Array.from(map.values());
  for (const r of out) r.winRate = r.positions ? r.wins / r.positions : 0;

  out.sort((a, b) => a.month.localeCompare(b.month));
  return out;
}

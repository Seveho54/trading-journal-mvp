import type { TradeEvent } from "../schema/trade";

export type MonthStats = {
  month: string; // z.B. "2025-01"
  trades: number;
  wins: number;
  losses: number;
  winRate: number; // 0..1
  totalNetProfit: number;
  totalRealizedPnl: number;
  totalNotional: number;
};

function monthKey(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function buildByMonth(trades: TradeEvent[]): MonthStats[] {
  const executed = trades.filter(t => t.status === "EXECUTED");

  const map = new Map<string, MonthStats>();

  for (const t of executed) {
    const key = monthKey(t.timestamp);

    if (!map.has(key)) {
      map.set(key, {
        month: key,
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalNetProfit: 0,
        totalRealizedPnl: 0,
        totalNotional: 0,
      });
    }

    const s = map.get(key)!;

    s.trades += 1;
    s.totalNetProfit += t.netProfit ?? 0;
    s.totalRealizedPnl += t.realizedPnl ?? 0;
    s.totalNotional += t.notional ?? 0;

    if (t.netProfit !== undefined) {
      if (t.netProfit > 0) s.wins += 1;
      else if (t.netProfit < 0) s.losses += 1;
    }
  }

  for (const s of map.values()) {
    const counted = s.wins + s.losses;
    s.winRate = counted > 0 ? s.wins / counted : 0;
  }

  // sortiert chronologisch
  return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
}

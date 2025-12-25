import type { TradeEvent } from "../schema/trade";

export type DayStats = {
  day: string; // "YYYY-MM-DD"
  trades: number;
  totalNetProfit: number;
  totalRealizedPnl: number;
};

function dayKey(isoTimestamp: string): string {
  const d = new Date(isoTimestamp);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildByDay(trades: TradeEvent[]): DayStats[] {
  const executed = trades.filter(t => t.status === "EXECUTED");

  const map = new Map<string, DayStats>();

  for (const t of executed) {
    const key = dayKey(t.timestamp);

    if (!map.has(key)) {
      map.set(key, {
        day: key,
        trades: 0,
        totalNetProfit: 0,
        totalRealizedPnl: 0,
      });
    }

    const s = map.get(key)!;
    s.trades += 1;
    s.totalNetProfit += t.netProfit ?? 0;
    s.totalRealizedPnl += t.realizedPnl ?? 0;
  }

  return Array.from(map.values()).sort((a, b) => a.day.localeCompare(b.day));
}

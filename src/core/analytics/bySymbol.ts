import type { TradeEvent } from "../schema/trade";

export type SymbolStats = {
  symbol: string;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;        // 0..1
  totalNetProfit: number;
  totalRealizedPnl: number;
  totalNotional: number;
};

export function buildBySymbol(trades: TradeEvent[]): SymbolStats[] {
  const executed = trades.filter(t => t.status === "EXECUTED");

  const map = new Map<string, SymbolStats>();

  for (const t of executed) {
    const symbol = t.symbol || "UNKNOWN";

    if (!map.has(symbol)) {
      map.set(symbol, {
        symbol,
        trades: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalNetProfit: 0,
        totalRealizedPnl: 0,
        totalNotional: 0,
      });
    }

    const s = map.get(symbol)!;

    s.trades += 1;
    s.totalNetProfit += t.netProfit ?? 0;
    s.totalRealizedPnl += t.realizedPnl ?? 0;
    s.totalNotional += t.notional ?? 0;

    // Win/Loss nur bewerten, wenn netProfit vorhanden ist
    if (t.netProfit !== undefined) {
      if (t.netProfit > 0) s.wins += 1;
      else if (t.netProfit < 0) s.losses += 1;
    }
  }

  // Winrate berechnen
  for (const s of map.values()) {
    const counted = s.wins + s.losses;
    s.winRate = counted > 0 ? s.wins / counted : 0;
  }

  // Sortiert: profitabelste zuerst
  return Array.from(map.values()).sort((a, b) => b.totalNetProfit - a.totalNetProfit);
}

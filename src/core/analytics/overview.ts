import type { TradeEvent } from "../schema/trade";

export type OverviewSummary = {
  totalRows: number;
  executed: number;
  cancelled: number;

  symbols: number;
  from?: string;
  to?: string;

  totalNotional: number;
  totalRealizedPnl: number;
  totalNetProfit: number;
};

export function buildOverview(trades: TradeEvent[]): OverviewSummary {
  const executedTrades = trades.filter(t => t.status === "EXECUTED");

  const symbolsSet = new Set(executedTrades.map(t => t.symbol).filter(Boolean));

  const times = executedTrades
    .map(t => new Date(t.timestamp).getTime())
    .filter(n => Number.isFinite(n))
    .sort((a, b) => a - b);

  const totalNotional = executedTrades.reduce((sum, t) => sum + (t.notional || 0), 0);
  const totalRealizedPnl = executedTrades.reduce((sum, t) => sum + (t.realizedPnl || 0), 0);
  const totalNetProfit = executedTrades.reduce((sum, t) => sum + (t.netProfit || 0), 0);

  return {
    totalRows: trades.length,
    executed: executedTrades.length,
    cancelled: trades.length - executedTrades.length,

    symbols: symbolsSet.size,
    from: times.length ? new Date(times[0]).toISOString() : undefined,
    to: times.length ? new Date(times[times.length - 1]).toISOString() : undefined,

    totalNotional,
    totalRealizedPnl,
    totalNetProfit,
  };
}

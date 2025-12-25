import type { TradeEvent } from "../schema/trade";

export type Position = {
  id: string;
  symbol: string;
  positionSide: "LONG" | "SHORT";
  openedAt: string;
  closedAt: string;
  trades: TradeEvent[];
  netProfit: number;
  realizedPnl: number;
  notional: number;
  tradeCount: number;
};

function keyOf(t: TradeEvent) {
  return `${t.symbol}__${t.positionSide}`;
}

export function buildPositions(trades: TradeEvent[]): Position[] {
  const sorted = [...trades].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // pro Symbol+Side arbeiten wir FIFO mit "open buckets"
  const openBuckets = new Map<string, TradeEvent[]>();
  const positions: Position[] = [];

  for (const t of sorted) {
    if (t.status !== "EXECUTED") continue;

    const k = keyOf(t);
    if (!openBuckets.has(k)) openBuckets.set(k, []);

    if (t.action === "OPEN") {
      openBuckets.get(k)!.push(t);
      continue;
    }

    // CLOSE
    const opens = openBuckets.get(k)!;
    const openTrade = opens.shift(); // FIFO
    if (!openTrade) {
      // Close ohne Open -> ignorieren oder als "orphan" loggen (MVP: ignorieren)
      continue;
    }

    const netProfit = (openTrade.netProfit ?? 0) + (t.netProfit ?? 0);
    const realized = (openTrade.realizedPnl ?? 0) + (t.realizedPnl ?? 0);
    const notional = (openTrade.notional ?? 0) + (t.notional ?? 0);

    positions.push({
      id: `${openTrade.id ?? "open"}__${t.id ?? "close"}`,
      symbol: t.symbol,
      positionSide: t.positionSide,
      openedAt: openTrade.timestamp,
      closedAt: t.timestamp,
      trades: [openTrade, t],
      netProfit,
      realizedPnl: realized,
      notional,
      tradeCount: 2,
    });
  }

  // optional: offene Positionen nicht ausgeben (MVP)
  return positions;
}

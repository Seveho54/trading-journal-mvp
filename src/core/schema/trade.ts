// Diese Typen beschreiben feste Werte (Auswahlmöglichkeiten)

export type Exchange = "binance" | "bitget" | "unknown";
export type MarketType = "futures" | "spot";

export type Action = "OPEN" | "CLOSE";
export type PositionSide = "LONG" | "SHORT";

export type TradeStatus = "EXECUTED" | "CANCELLED";

// Das ist unser STANDARD-TRADE-OBJEKT
// Jeder Trade in unserer Plattform sieht so aus

export type TradeEvent = {
  id: string;            // z.B. Order ID
  timestamp: string;     // Datum/Zeit im ISO-Format

  exchange: Exchange;
  marketType: MarketType;

  symbol: string;        // z.B. BTCUSDT
  action: Action;        // OPEN oder CLOSE
  positionSide: PositionSide; // LONG oder SHORT

  quantity: number;      // Menge
  price: number;         // Preis
  notional: number;      // Handelswert

  realizedPnl?: number;  // optional (?)
  netProfit?: number;    // optional (?)

  status: TradeStatus;

  raw: Record<string, unknown>; // Originaldaten (für Debug)
};

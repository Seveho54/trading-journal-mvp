export type RiskEventType =
  | "TRADE_CLOSE"
  | "POSITION_OPEN"
  | "POSITION_UPDATE"
  | "POSITION_CLOSE"
  | "EQUITY_SNAPSHOT";

export type RiskEvent = {
  id: string;
  type: RiskEventType;
  ts: number;

  // trade data
  symbol?: string;
  side?: "LONG" | "SHORT";
  qty?: number;
  price?: number;
  realizedPnl?: number;
  fee?: number;

  // equity
  equity?: number;

  meta?: Record<string, any>;
};

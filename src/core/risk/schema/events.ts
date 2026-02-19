// src/core/risk/schema/events.ts

export type ExchangeId = "bitget";

export type EventType = "ACCOUNT_SNAPSHOT" | "POSITION_SNAPSHOT" | "FILL"; // trade fill / executed trade

export type BaseEvent = {
  id: string; // deterministic id (hash ok later)
  exchange: ExchangeId;
  type: EventType;
  ts: number; // unix ms
  ingestTs: number; // when we stored it
};

export type AccountSnapshotEvent = BaseEvent & {
  type: "ACCOUNT_SNAPSHOT";
  data: {
    equity: number; // wallet + unrealized
    walletBalance: number; // wallet
    availableBalance?: number; // optional
    unrealizedPnl: number;
    maintenanceMargin?: number;
    marginBalance?: number;
    currency: "USDT"; // start narrow: Bitget futures USDT
  };
};

export type PositionSnapshotEvent = BaseEvent & {
  type: "POSITION_SNAPSHOT";
  data: {
    symbol: string; // e.g. BTCUSDT
    side: "LONG" | "SHORT";
    size: number; // contracts or base qty (normalize later)
    entryPrice: number;
    markPrice: number;
    liquidationPrice?: number;
    leverage?: number;
    marginMode?: "isolated" | "cross";
    unrealizedPnl: number;
    notional: number; // |size * markPrice|
  };
};

export type FillEvent = BaseEvent & {
  type: "FILL";
  data: {
    symbol: string;
    side: "BUY" | "SELL"; // raw action at fill level
    positionSide: "LONG" | "SHORT"; // normalized intent
    qty: number;
    price: number;
    fee: number;
    feeCurrency: "USDT";
    realizedPnl?: number; // if exchange provides per fill
    orderId?: string;
  };
};

export type RiskEvent =
  | AccountSnapshotEvent
  | PositionSnapshotEvent
  | FillEvent;

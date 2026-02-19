// src/core/risk/schema/snapshots.ts

export type AccountSnapshot = {
  ts: number; // unix ms
  equity: number;
  walletBalance: number;
  unrealizedPnl: number;
};

export type PositionSnapshot = {
  ts: number;
  symbol: string;
  side: "LONG" | "SHORT";
  notional: number;
  leverage?: number;
};

export type RiskStateNow = {
  ts: number;
  account: AccountSnapshot | null;
  positions: PositionSnapshot[];
};

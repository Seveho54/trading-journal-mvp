export type PositionSide = "LONG" | "SHORT" | "UNKNOWN";

export type Position = {
  id: string;              // Position-ID (z.B. aus Symbol+OpenTime oder OrderGroup)
  symbol: string;
  side: PositionSide;

  openedAt: string;        // ISO
  closedAt?: string;       // ISO (wenn noch offen)
  status: "OPEN" | "CLOSED";

  qtyOpen: number;
  qtyClose: number;

  avgOpenPrice?: number;
  avgClosePrice?: number;

  realizedPnl?: number;
  netProfit?: number;
  fees?: number;

  trades: any[];           // Referenz/Raw trades, die dazugehören
};

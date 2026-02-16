// src/core/positions/buildPositions.ts
import type { TradeEvent } from "../schema/trade";

export type Position = {
  id: string;

  symbol: string;
  positionSide: "LONG" | "SHORT";

  openedAt: string;
  closedAt?: string;

  quantity: number;

  entryPrice: number;
  exitPrice: number;

  realizedPnl: number;
  netProfit: number;

  trades: TradeEvent[];
};

type LotTrade =
  | (TradeEvent & { _sliceQty?: never })
  | (TradeEvent & { _sliceQty: number });

type ActivePos = {
  id: string;
  key: string;
  symbol: string;
  positionSide: "LONG" | "SHORT";
  openedAt: string;

  openQtyTotal: number;
  closeQtyTotal: number;
  remainingQty: number;

  entryNotional: number;
  exitNotional: number;

  sumRealized: number;
  sumNet: number;

  trades: LotTrade[];
};

function safeNum(n: any) {
  const x =
    typeof n === "number"
      ? n
      : typeof n === "string"
        ? Number(n.replace(",", "."))
        : Number(n);
  return Number.isFinite(x) ? x : 0;
}

function ts(t: TradeEvent) {
  return new Date(t.timestamp).getTime();
}

function makeKey(t: TradeEvent) {
  return `${t.exchange}|${t.marketType}|${t.symbol}|${t.positionSide}`;
}

export function buildPositions(trades: TradeEvent[]) {
  const errors: string[] = [];

  const sorted = [...trades].sort((a, b) => ts(a) - ts(b));

  const activeByKey = new Map<string, ActivePos>();
  const positions: Position[] = [];

  for (const t of sorted) {
    if (t.status && t.status !== "EXECUTED") continue;

    const qty = safeNum(t.quantity);
    const price = safeNum(t.price);
    const realizedPnl = safeNum((t as any).realizedPnl);
    const netProfit = safeNum((t as any).netProfit);

    if (!t.symbol || !t.positionSide) continue;
    if (qty <= 0) continue;

    const key = makeKey(t);

    // ---------------- OPEN ----------------
    if (t.action === "OPEN") {
      let pos = activeByKey.get(key);

      if (!pos) {
        pos = {
          id: `${t.symbol}-${t.positionSide}-${t.id ?? t.timestamp}`,
          key,
          symbol: t.symbol,
          positionSide: t.positionSide as any,
          openedAt: t.timestamp,

          openQtyTotal: 0,
          closeQtyTotal: 0,
          remainingQty: 0,

          entryNotional: 0,
          exitNotional: 0,

          sumRealized: 0,
          sumNet: 0,

          trades: [],
        };
        activeByKey.set(key, pos);
      }

      pos.openQtyTotal += qty;
      pos.remainingQty += qty;
      pos.entryNotional += qty * price;
      pos.trades.push(t);

      continue;
    }

    // ---------------- CLOSE ----------------
    if (t.action === "CLOSE") {
      const pos = activeByKey.get(key);

      if (!pos || pos.remainingQty <= 1e-8) {
        errors.push(
          `CLOSE without OPEN: ${t.symbol} ${t.positionSide} at ${t.timestamp}`,
        );
        continue;
      }

      const takeQty = Math.min(qty, pos.remainingQty);

      pos.closeQtyTotal += takeQty;
      pos.remainingQty -= takeQty;

      pos.exitNotional += takeQty * price;

      const r = qty > 0 ? takeQty / qty : 0;
      pos.sumRealized += realizedPnl * r;
      pos.sumNet += netProfit * r;

      pos.trades.push({ ...t, _sliceQty: takeQty });

      // Position vollständig geschlossen
      if (pos.remainingQty <= 1e-8) {
        const entryPrice =
          pos.openQtyTotal > 0 ? pos.entryNotional / pos.openQtyTotal : 0;

        const exitPrice =
          pos.closeQtyTotal > 0 ? pos.exitNotional / pos.closeQtyTotal : 0;

        const finalNet = pos.sumNet !== 0 ? pos.sumNet : pos.sumRealized;

        positions.push({
          id: pos.id,
          symbol: pos.symbol,
          positionSide: pos.positionSide,
          openedAt: pos.openedAt,
          closedAt: t.timestamp,
          quantity: pos.openQtyTotal,
          entryPrice,
          exitPrice,
          realizedPnl: pos.sumRealized,
          netProfit: finalNet,
          trades: pos.trades,
        });

        activeByKey.delete(key);
      }

      continue;
    }
  }

  const openLotsLeft = [...activeByKey.values()];

  return { positions, openLotsLeft, errors };
}

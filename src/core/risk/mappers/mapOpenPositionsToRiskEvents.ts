import type { RiskEvent } from "../types";

function toNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toSide(s: any): "LONG" | "SHORT" {
  const str = String(s ?? "").toUpperCase();
  return str.includes("SHORT") ? "SHORT" : "LONG";
}

export function mapOpenPositionsToRiskEvents(
  rows: any[],
  tsNow: number,
): RiskEvent[] {
  return (rows ?? [])
    .map((p, i) => {
      const symbol = String(p?.symbol ?? "");
      if (!symbol) return null;

      const qty = toNum(p?.total);
      const mark = toNum(p?.markPrice);
      const lev = toNum(p?.leverage);

      // notional = qty * mark (für Exposure Engine)
      const notional = Math.abs(qty * mark);

      // wenn qty 0 → ignorieren
      if (!qty || !mark) return null;

      return {
        id: `pos-${symbol}-${tsNow}-${i}`,
        type: "POSITION_UPDATE",
        ts: tsNow,
        symbol,
        side: toSide(p?.holdSide),
        qty,
        price: mark,
        meta: {
          source: "bitget",
          leverage: lev || null,
          notional,
          marginCoin: p?.marginCoin ?? null,
        },
      } as RiskEvent;
    })
    .filter(Boolean) as RiskEvent[];
}

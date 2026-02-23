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

      const qty = Math.abs(
        toNum(
          p?.total ??
            p?.totalSize ??
            p?.size ??
            p?.qty ??
            p?.amount ??
            p?.available ??
            p?.pos ??
            0,
        ),
      );

      const mark = toNum(
        p?.markPrice ??
          p?.markPx ??
          p?.mark ??
          p?.last ??
          p?.lastPrice ??
          p?.price ??
          0,
      );

      const lev = toNum(p?.leverage ?? p?.marginLeverage ?? 0);

      // notional = qty * mark (für Exposure Engine)
      const notional = Math.abs(qty * mark);

      // wenn qty 0 → ignorieren
      if (!(qty > 0) || !(mark > 0)) return null;

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

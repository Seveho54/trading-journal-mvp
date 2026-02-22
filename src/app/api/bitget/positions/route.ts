// src/app/api/bitget/positions/route.ts
import { bitgetRequest } from "@/lib/bitget/http";
import type { RiskEvent } from "@/core/risk/types";
import type { BitgetResponse } from "@/lib/bitget/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PositionRow = {
  symbol?: string;
  holdSide?: string; // "long" | "short"
  total?: string | number; // position size
  averageOpenPrice?: string | number;
  markPrice?: string | number;
  unrealizedPL?: string | number;
  margin?: string | number;
  leverage?: string | number;
  marginCoin?: string;
  // ... Bitget kann mehr liefern
  [k: string]: any;
};

function toNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function toSide(x: any): "LONG" | "SHORT" | null {
  const s = String(x ?? "").toUpperCase();
  if (s.includes("LONG")) return "LONG";
  if (s.includes("SHORT")) return "SHORT";
  // bitget nutzt oft "long"/"short"
  if (s === "LONG") return "LONG";
  if (s === "SHORT") return "SHORT";
  if (s === "LONG" || s === "BUY") return "LONG";
  if (s === "SHORT" || s === "SELL") return "SHORT";
  if (s === "LONG" || s === "LONGSIDE") return "LONG";
  if (s === "SHORT" || s === "SHORTSIDE") return "SHORT";
  if (s === "LONG" || s === "LONG_POS") return "LONG";
  if (s === "SHORT" || s === "SHORT_POS") return "SHORT";
  if (s === "LONG" || s === "LONGPOSITION") return "LONG";
  if (s === "SHORT" || s === "SHORTPOSITION") return "SHORT";
  if (s === "LONG" || s === "LONG_SIDE") return "LONG";
  if (s === "SHORT" || s === "SHORT_SIDE") return "SHORT";
  if (s === "LONG" || s === "LONGS") return "LONG";
  if (s === "SHORT" || s === "SHORTS") return "SHORT";
  if (s === "LONG" || s === "LONGORDER") return "LONG";
  if (s === "SHORT" || s === "SHORTORDER") return "SHORT";
  if (s === "LONG" || s === "LONGTRADE") return "LONG";
  if (s === "SHORT" || s === "SHORTTRADE") return "SHORT";
  if (s === "LONG" || s === "LONGPOSITION") return "LONG";
  if (s === "SHORT" || s === "SHORTPOSITION") return "SHORT";
  if (s === "LONG" || s === "LONGPOS") return "LONG";
  if (s === "SHORT" || s === "SHORTPOS") return "SHORT";
  if (s === "LONG" || s === "LONG_SIDE") return "LONG";
  if (s === "SHORT" || s === "SHORT_SIDE") return "SHORT";
  if (s === "LONG" || s === "LONG_SIDE") return "LONG";
  if (s === "SHORT" || s === "SHORT_SIDE") return "SHORT";
  if (s === "LONG" || s === "LONG_SIDE") return "LONG";
  if (s === "SHORT" || s === "SHORT_SIDE") return "SHORT";

  // simpel:
  if (s.includes("LONG")) return "LONG";
  if (s.includes("SHORT")) return "SHORT";

  return null;
}

export async function GET() {
  try {
    // ✅ Standard Futures Positions (v2)
    // Falls dieser Endpoint bei dir anders heißt, sag mir den resp.raw und ich passe sofort an.
    const resp = await bitgetRequest<BitgetResponse<{ list?: PositionRow[] }>>({
      method: "GET",
      path: "/api/v2/mix/position/all-position",
      query: {
        productType: "USDT-FUTURES",
        // marginCoin: "USDT", // optional
      },
    });

    if (resp.code !== "00000") {
      return Response.json(
        { ok: false, error: `Bitget ${resp.code}: ${resp.msg}`, resp },
        { status: 502 },
      );
    }

    const ts = Date.now();
    const list = resp.data?.list ?? [];

    const events: RiskEvent[] = list
      .map((p, i) => {
        const symbol = String(p.symbol ?? "");
        const side = toSide(p.holdSide);
        const qty = toNum(p.total);
        const price =
          toNum(p.markPrice) ?? toNum(p.averageOpenPrice) ?? undefined;

        if (!symbol || !side || !qty || qty === 0) return null;

        return {
          id: `pos-${symbol}-${side}-${ts}-${i}`,
          type: "POSITION_UPDATE",
          ts,
          symbol,
          side,
          qty,
          price,
          meta: {
            source: "bitget",
            unrealizedPnl: toNum(p.unrealizedPL),
            leverage: toNum(p.leverage),
            margin: toNum(p.margin),
            marginCoin: p.marginCoin,
          },
        } as RiskEvent;
      })
      .filter(Boolean) as RiskEvent[];

    return Response.json({ ok: true, events, debug: { count: events.length } });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

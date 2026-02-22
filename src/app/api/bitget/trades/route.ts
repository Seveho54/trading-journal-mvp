// src/app/api/bitget/trades/route.ts
import { bitgetRequest } from "@/lib/bitget/http";
import type { RiskEvent } from "@/core/risk/types";
import type { BitgetResponse } from "@/lib/bitget/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// defensiv typisiert, Bitget kann je nach Account Felder anders nennen
type TradeRow = {
  symbol?: string;
  side?: string; // buy/sell
  positionSide?: string; // long/short
  holdSide?: string; // long/short
  tradeSide?: string;
  price?: string | number;
  fillPrice?: string | number;
  size?: string | number;
  qty?: string | number;
  amount?: string | number;
  fee?: string | number;
  commission?: string | number;
  realizedPnl?: string | number;
  pnl?: string | number;
  profit?: string | number;
  cTime?: string | number; // ms
  uTime?: string | number; // ms
  ts?: string | number;
  [k: string]: any;
};

function toNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toTs(x: any): number {
  const n = Number(x);
  if (Number.isFinite(n) && n > 0) return n;
  const d = new Date(x);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function toSide(row: TradeRow): "LONG" | "SHORT" {
  const s = String(
    row.positionSide ?? row.holdSide ?? row.tradeSide ?? row.side ?? "",
  ).toUpperCase();

  if (s.includes("SHORT")) return "SHORT";
  // buy/sell fallback (nicht perfekt, aber ok als fallback):
  if (s === "SELL") return "SHORT";
  return "LONG";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? "200");
    const max = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 500)
      : 200;

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const resp = await bitgetRequest<BitgetResponse<{ list?: TradeRow[] }>>({
      method: "GET",
      path: "/api/v2/mix/order/fill-history",
      query: {
        productType: "USDT-FUTURES",
        startTime: thirtyDaysAgo,
        endTime: now,
      },
    });

    if (resp.code !== "00000") {
      return Response.json(
        { ok: false, error: `Bitget ${resp.code}: ${resp.msg}`, resp },
        { status: 502 },
      );
    }

    const list = resp.data?.list ?? [];

    const events: RiskEvent[] = list
      .map((t, i) => {
        const ts = toTs(t.cTime ?? t.uTime ?? t.ts);
        const symbol = String(t.symbol ?? "");
        if (!ts || !symbol) return null;

        const realized =
          toNum(t.realizedPnl) || toNum(t.pnl) || toNum(t.profit);

        const qty = toNum(t.qty) || toNum(t.size) || toNum(t.amount);

        const price = toNum(t.fillPrice ?? t.price);

        return {
          id: `fill-${symbol}-${ts}-${i}`,
          type: "TRADE_CLOSE",
          ts,
          symbol,
          side: toSide(t),
          qty,
          price,
          realizedPnl: realized,
          fee: toNum(t.fee ?? t.commission),
          meta: { source: "bitget", raw: t },
        } as RiskEvent;
      })
      .filter(Boolean) as RiskEvent[];

    // sort chronologisch
    events.sort((a, b) => a.ts - b.ts);

    return Response.json(
      { ok: true, events, debug: { count: events.length } },
      { status: 200 },
    );
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

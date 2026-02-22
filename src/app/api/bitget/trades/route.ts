// src/app/api/bitget/trades/route.ts
import { bitgetRequest } from "@/lib/bitget/http";
import type { RiskEvent } from "@/core/risk/types";
import type { BitgetResponse } from "@/lib/bitget/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PositionHistoryRow = {
  symbol?: string;
  holdSide?: string;
  openPrice?: string | number;
  closePrice?: string | number;
  openTime?: string | number;
  closeTime?: string | number;
  total?: string | number;
  pnl?: string | number;
  realizedPnl?: string | number;
  fee?: string | number;
  [k: string]: any;
};

function toNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function toTs(x: any): number {
  const n = Number(x);
  if (Number.isFinite(n) && n > 0) return n;
  return 0;
}

function toSide(s: any): "LONG" | "SHORT" {
  const str = String(s ?? "").toUpperCase();
  if (str.includes("SHORT")) return "SHORT";
  return "LONG";
}

export async function GET() {
  try {
    const now = Date.now();
    const MS = 24 * 60 * 60 * 1000;
    const DAYS_PER_BLOCK = 7;
    const lookbackDays = 30;

    const start = now - lookbackDays * MS;

    const blocks: { start: number; end: number }[] = [];
    let cursor = start;

    while (cursor < now) {
      const end = Math.min(cursor + DAYS_PER_BLOCK * MS, now);
      blocks.push({ start: cursor, end });
      cursor = end;
    }

    let allRows: PositionHistoryRow[] = [];

    for (const b of blocks) {
      const resp = await bitgetRequest<
        BitgetResponse<{ list?: PositionHistoryRow[] }>
      >({
        method: "GET",
        path: "/api/v2/mix/position/history-position",
        query: {
          productType: "USDT-FUTURES",
          startTime: b.start,
          endTime: b.end,
        },
      });

      if (resp.code !== "00000") {
        throw new Error(`Bitget ${resp.code}: ${resp.msg}`);
      }

      const list = resp.data?.list ?? [];
      allRows = allRows.concat(list);
    }

    const events: RiskEvent[] = allRows
      .map((p, i) => {
        const ts = toTs(p.closeTime);
        if (!ts || !p.symbol) return null;

        return {
          id: `pos-close-${p.symbol}-${ts}-${i}`,
          type: "TRADE_CLOSE",
          ts,
          symbol: p.symbol,
          side: toSide(p.holdSide),
          qty: toNum(p.total),
          price: toNum(p.closePrice),
          realizedPnl: toNum(p.realizedPnl) || toNum(p.pnl),
          fee: toNum(p.fee),
          meta: { source: "bitget" },
        } as RiskEvent;
      })
      .filter(Boolean) as RiskEvent[];

    events.sort((a, b) => a.ts - b.ts);

    return Response.json({
      ok: true,
      debug: {
        blocks: blocks.length,
        rawCount: allRows.length,
        mappedCount: events.length,
      },
      events,
    });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

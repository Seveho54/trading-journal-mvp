// src/app/api/bitget/snapshot/route.ts
import { bitgetRequest } from "@/lib/bitget/http";
import type { RiskEvent } from "@/core/risk/types";
import type { BitgetResponse } from "@/lib/bitget/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function readEquityFromAccountRow(row: any): number | null {
  // je nach Konto/Endpoint heißen Felder unterschiedlich
  return (
    toNum(row?.accountEquity) ??
    toNum(row?.equity) ??
    toNum(row?.usdtEquity) ??
    toNum(row?.totalEquity) ??
    null
  );
}

async function fetchAccounts(productType: string) {
  // ✅ LIST endpoint (nicht /account/account!)
  const resp = await bitgetRequest<BitgetResponse<any[]>>({
    method: "GET",
    path: "/api/v2/mix/account/accounts",
    query: { productType },
  });

  return resp;
}

export async function GET() {
  try {
    // Für “alle Futures Accounts” probieren wir die gängigen ProductTypes
    const productTypes = ["USDT-FUTURES", "COIN-FUTURES", "USDC-FUTURES"];

    const results: Array<{
      productType: string;
      ok: boolean;
      code?: string;
      msg?: string;
      equitySum?: number;
      count?: number;
      sampleKeys?: string[];
    }> = [];

    let totalEquity = 0;
    let anySuccess = false;

    for (const pt of productTypes) {
      try {
        const resp = await fetchAccounts(pt);

        if (!resp || resp.code !== "00000") {
          results.push({
            productType: pt,
            ok: false,
            code: resp?.code,
            msg: resp?.msg,
          });
          continue;
        }

        const rows = Array.isArray(resp.data) ? resp.data : [];
        let sum = 0;
        let count = 0;

        for (const row of rows) {
          const eq = readEquityFromAccountRow(row);
          if (eq == null) continue;
          sum += eq;
          count += 1;
        }

        // Wenn Bitget für diesen ProductType “leer” liefert, ist das ok – dann addieren wir 0
        totalEquity += sum;
        anySuccess = true;

        results.push({
          productType: pt,
          ok: true,
          code: resp.code,
          msg: resp.msg,
          equitySum: sum,
          count,
          sampleKeys: rows[0] ? Object.keys(rows[0]) : [],
        });
      } catch (e: any) {
        results.push({
          productType: pt,
          ok: false,
          msg: e?.message ?? String(e),
        });
      }
    }

    if (!anySuccess) {
      return Response.json(
        { ok: false, error: "Bitget accounts query failed", results },
        { status: 502 },
      );
    }

    const ts = Date.now();

    const events: RiskEvent[] = [
      {
        id: `eq-${ts}`,
        type: "EQUITY_SNAPSHOT",
        ts,
        equity: totalEquity,
        meta: { source: "bitget", results },
      },
    ];

    return Response.json(
      { ok: true, events, debug: { totalEquity, results } },
      { status: 200 },
    );
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

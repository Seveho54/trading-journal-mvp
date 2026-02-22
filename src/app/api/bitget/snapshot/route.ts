// src/app/api/bitget/snapshot/route.ts
import { bitgetRequest } from "@/lib/bitget/http";
import type { RiskEvent } from "@/core/risk/types";
import type { BitgetResponse } from "@/lib/bitget/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BitgetMixAccountResp = {
  code: string;
  msg: string;
  data?: {
    // Bitget liefert je nach Endpoint/Account Struktur leicht variierend.
    // Wir lesen defensiv mehrere mögliche Felder aus.
    usdtEquity?: string | number;
    equity?: string | number;
    accountEquity?: string | number;
    available?: string | number;
    // manchmal nested / arrays – lassen wir erstmal außen vor
    [k: string]: any;
  };
};

function toNum(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

type MixAccountData = any; // später typisieren

export async function GET() {
  try {
    // Futures Account Endpoint (v2)
    const resp = await bitgetRequest<BitgetResponse<MixAccountData>>({
      method: "GET",
      path: "/api/v2/mix/account/account",
      query: {
        productType: "USDT-FUTURES",
        // falls nötig:
        // marginCoin: "USDT",
      },
    });

    if (resp.code !== "00000") {
      throw new Error(`Bitget error ${resp.code}: ${resp.msg}`);
    }

    if (!resp || resp.code !== "00000") {
      return Response.json(
        { ok: false, error: "Bitget error", resp },
        { status: 502 },
      );
    }

    const ts = Date.now();
    const d = resp.data ?? {};

    // defensiv: wir versuchen mehrere mögliche Equity-Felder
    const equity =
      toNum(d.usdtEquity) ?? toNum(d.accountEquity) ?? toNum(d.equity) ?? null;

    if (equity == null) {
      return Response.json(
        {
          ok: false,
          error: "Could not read equity from Bitget response",
          resp,
        },
        { status: 502 },
      );
    }

    const events: RiskEvent[] = [
      {
        id: `eq-${ts}`,
        type: "EQUITY_SNAPSHOT",
        ts,
        equity,
        meta: { source: "bitget", rawKeys: Object.keys(d) },
      },
    ];

    return Response.json(
      { ok: true, events, debug: { equity } },
      { status: 200 },
    );
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

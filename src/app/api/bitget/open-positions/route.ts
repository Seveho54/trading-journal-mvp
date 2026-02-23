import { bitgetRequest } from "@/lib/bitget/http";
import type { BitgetResponse } from "@/lib/bitget/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OpenPosRow = {
  symbol?: string;
  holdSide?: string; // long/short
  total?: string | number; // qty
  markPrice?: string | number;
  leverage?: string | number;
  marginCoin?: string; // USDT
  uTime?: string | number; // update time (ms)
  cTime?: string | number;
  [k: string]: any;
};

export async function GET() {
  try {
    const resp = await bitgetRequest<BitgetResponse<{ list?: OpenPosRow[] }>>({
      method: "GET",
      path: "/api/v2/mix/position/all-position",
      query: {
        productType: "USDT-FUTURES",
      },
    });

    if (resp.code !== "00000") {
      return Response.json(
        { ok: false, error: `Bitget ${resp.code}: ${resp.msg}`, resp },
        { status: 502 },
      );
    }

    const list = resp.data?.list ?? [];

    return Response.json(
      { ok: true, positions: list, debug: { rawCount: list.length } },
      { status: 200 },
    );
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

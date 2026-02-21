import { bitgetRequest } from "@/../src/lib/bitget/http";

export const runtime = "nodejs";

export async function GET() {
  const data = await bitgetRequest<any>({
    method: "GET",
    path: "/api/v2/mix/position/all-position",
    query: { productType: "USDT-FUTURES" },
  });

  const positions = Array.isArray(data?.data) ? data.data : [];

  return Response.json({
    ok: true,
    ts: Date.now(),
    positions,
  });
}

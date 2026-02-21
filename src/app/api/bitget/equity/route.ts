import { bitgetRequest } from "@/../src/lib/bitget/http";

export const runtime = "nodejs";

export async function GET() {
  // 1) Wallet/Account Overview (USDT-FUTURES)
  const data = await bitgetRequest<any>({
    method: "GET",
    path: "/api/v2/mix/account/accounts",
    query: { productType: "USDT-FUTURES" },
  });

  // Bitget: data.data kann array sein
  // Wir normalisieren: equity = (available + frozen + unrealized?) -> je nach API Feld
  // Wir nehmen erstmal das wichtigste: "equity" / "accountEquity" falls vorhanden.
  const first = Array.isArray(data?.data) ? data.data[0] : data?.data;

  const equity =
    Number(first?.accountEquity ?? first?.equity ?? first?.usdtEquity ?? 0) ||
    0;

  return Response.json({
    ok: true,
    ts: Date.now(),
    equity,
    raw: first, // fürs Debug erstmal drin lassen
  });
}

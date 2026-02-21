import crypto from "crypto";

export const runtime = "nodejs";

function sign(prehash: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(prehash).digest("base64");
}

export async function GET() {
  const apiKey = process.env.BITGET_API_KEY ?? "";
  const apiSecret = process.env.BITGET_API_SECRET ?? "";
  const passphrase = process.env.BITGET_API_PASSPHRASE ?? "";
  const base = process.env.BITGET_API_BASE ?? "https://api.bitget.com";

  if (!apiKey || !apiSecret || !passphrase) {
    return Response.json(
      { ok: false, error: "Missing env BITGET_API_KEY/SECRET/PASSPHRASE" },
      { status: 500 },
    );
  }

  const method = "GET";

  // ✅ Nimm erst den "Account List" Endpoint (einfacher)
  const requestPath = "/api/v2/mix/account/accounts";

  // ✅ productType ist REQUIRED
  const query = "productType=USDT-FUTURES";
  const fullPathForSign = `${requestPath}?${query}`;
  const url = `${base}${fullPathForSign}`;

  const ts = Date.now().toString();
  const body = ""; // GET -> ""

  // ✅ Bitget Sign: ts + method + requestPath(+?query) + body
  const prehash = ts + method + fullPathForSign + body;
  const signature = sign(prehash, apiSecret);

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "ACCESS-KEY": apiKey,
      "ACCESS-SIGN": signature,
      "ACCESS-TIMESTAMP": ts,
      "ACCESS-PASSPHRASE": passphrase,
    },
    cache: "no-store",
  });

  const text = await res.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }

  return Response.json(
    {
      ok: res.ok,
      status: res.status,
      data: json,
      debug: { url, prehash, requestPath, query },
    },
    { status: 200 },
  );
}

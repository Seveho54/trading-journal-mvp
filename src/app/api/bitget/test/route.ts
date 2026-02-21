import crypto from "crypto";

export const runtime = "nodejs"; // wichtig auf Vercel/Next

function sign(prehash: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(prehash).digest("base64");
}

export async function GET() {
  const apiKey = process.env.BITGET_API_KEY!;
  const apiSecret = process.env.BITGET_API_SECRET!;
  const passphrase = process.env.BITGET_API_PASSPHRASE!;
  const base = process.env.BITGET_API_BASE ?? "https://api.bitget.com";

  if (!apiKey || !apiSecret || !passphrase) {
    return Response.json(
      { ok: false, error: "Missing env BITGET_API_KEY/SECRET/PASSPHRASE" },
      { status: 500 },
    );
  }

  const method = "GET";

  // ✅ WICHTIG: Query muss im requestPath enthalten sein
  const requestPath = "/api/v2/mix/account/account";

  const ts = Date.now().toString();
  const body = ""; // GET => leer

  // ✅ WICHTIG: prehash = ts + method + requestPath + body
  const prehash = ts + method + requestPath + body;
  const signature = sign(prehash, apiSecret);

  const res = await fetch(base + requestPath, {
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

  // Bitget antwortet oft JSON als text
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text };
  }

  return Response.json(
    {
      ok: res.ok,
      status: res.status,
      data: json,
      debug: { requestPath },
    },
    { status: 200 },
  );
}

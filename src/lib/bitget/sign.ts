// src/lib/bitget/sign.ts
import crypto from "crypto";

export function bitgetSign(args: {
  secret: string;
  timestamp: string; // ms as string
  method: "GET" | "POST" | "DELETE";
  requestPath: string; // e.g. "/api/v2/mix/account/account"
  query?: string; // e.g. "productType=USDT-FUTURES"
  body?: string; // raw JSON string, "" if none
}) {
  const { secret, timestamp, method, requestPath } = args;
  const query = args.query ? `?${args.query}` : "";
  const body = args.body ?? "";

  // Bitget: sign prehash = timestamp + method + requestPath + (?query) + body
  const prehash = `${timestamp}${method}${requestPath}${query}${body}`;

  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(prehash);
  return hmac.digest("base64");
}

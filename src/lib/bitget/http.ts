// src/lib/bitget/http.ts
import { bitgetSign } from "./sign";

const BASE_URL = "https://api.bitget.com";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function bitgetRequest<T>(args: {
  method: "GET" | "POST" | "DELETE";
  path: string; // e.g. "/api/v2/mix/account/account"
  query?: Record<string, string | number | boolean | undefined>;
  body?: any;
}) {
  const key = mustEnv("BITGET_API_KEY");
  const secret = mustEnv("BITGET_API_SECRET");
  const passphrase = mustEnv("BITGET_API_PASSPHRASE");

  const queryString = args.query
    ? Object.entries(args.query)
        .filter(([, v]) => v !== undefined)
        .map(
          ([k, v]) =>
            `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`,
        )
        .join("&")
    : "";

  const url = `${BASE_URL}${args.path}${queryString ? `?${queryString}` : ""}`;

  const timestamp = String(Date.now());
  const bodyString = args.body != null ? JSON.stringify(args.body) : "";

  const sign = bitgetSign({
    secret,
    timestamp,
    method: args.method,
    requestPath: args.path,
    query: queryString || undefined,
    body: args.method === "GET" ? "" : bodyString,
  });

  const res = await fetch(url, {
    method: args.method,
    headers: {
      "Content-Type": "application/json",
      "ACCESS-KEY": key,
      "ACCESS-SIGN": sign,
      "ACCESS-TIMESTAMP": timestamp,
      "ACCESS-PASSPHRASE": passphrase,
    },
    body: args.method === "GET" ? undefined : bodyString,
    cache: "no-store",
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text
  }

  if (!res.ok) {
    throw new Error(`Bitget HTTP ${res.status}: ${text}`);
  }

  return json as T;
}

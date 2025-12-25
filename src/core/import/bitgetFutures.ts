import Papa from "papaparse";
import type { TradeEvent, TradeStatus } from "../schema/trade";
import { parseDirection } from "../normalize/direction";

// Hilfsfunktion: macht aus "1,23" oder "1.23" eine Zahl
function toNumber(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const s = String(value).trim().replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

// Hilfsfunktion: macht aus Datum einen ISO-String
function toISODate(value: unknown): string {
  const s = String(value).trim();
  const normalized = s.includes(" ") && !s.includes("T") ? s.replace(" ", "T") : s;
  const dt = new Date(normalized);
  return isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

function mapStatus(value: unknown): TradeStatus {
  const s = String(value).trim().toLowerCase();
  if (s.includes("cancel")) return "CANCELLED";
  return "EXECUTED";
}

// Typ: so sehen die Spalten in DEINER Bitget CSV aus
type BitgetFuturesRow = {
  Date: string;
  "Order ID": string;
  Direction: string;
  Futures: string;
  "Average Price": string;
  Executed: string;
  "Trading volume": string;
  "Realized P/L"?: string;
  NetProfits?: string;
  Status: string;
};

// Das ist die Funktion, die wir später in der API benutzen
export function parseBitgetFuturesCSV(csvText: string): { trades: TradeEvent[]; errors: string[] } {
  const parsed = Papa.parse<BitgetFuturesRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: string[] = [];
  if (parsed.errors?.length) {
    for (const e of parsed.errors) errors.push(e.message);
  }

  const trades: TradeEvent[] = [];

  for (const row of parsed.data) {
    if (!row || !row["Order ID"] || !row.Date) continue;

    const status = mapStatus(row.Status);
    const { action, positionSide } = parseDirection(row.Direction);

    const trade: TradeEvent = {
      id: String(row["Order ID"]).trim(),
      timestamp: toISODate(row.Date),

      exchange: "bitget",
      marketType: "futures",

      symbol: String(row.Futures || "").trim(),
      action,
      positionSide,

      quantity: toNumber(row.Executed),
      price: toNumber(row["Average Price"]),
      notional: toNumber(row["Trading volume"]),

      realizedPnl: row["Realized P/L"] !== undefined ? toNumber(row["Realized P/L"]) : undefined,
      netProfit: row.NetProfits !== undefined ? toNumber(row.NetProfits) : undefined,

      status,
      raw: row as unknown as Record<string, unknown>,
    };

    trades.push(trade);
  }

  return { trades, errors };
}

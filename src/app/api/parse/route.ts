import { NextResponse } from "next/server";
import { parseBitgetFuturesCSV } from "../../../core/import/bitgetFutures";
import { buildOverview } from "../../../core/analytics/overview";
import { buildBySymbol } from "../../../core/analytics/bySymbol";
import { buildByMonth } from "../../../core/analytics/byMonth";
import { buildByDay } from "../../../core/analytics/byDay";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: true, method: "GET" });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "No file uploaded (field name must be 'file')" },
        { status: 400 }
      );
    }

    const text = await file.text();

    const { trades, errors } = parseBitgetFuturesCSV(text);
    const summary = buildOverview(trades);
    const bySymbol = buildBySymbol(trades);
    const byMonth = buildByMonth(trades);
    const byDay = buildByDay(trades);


    return NextResponse.json({
        ok: true,
        summary,
        bySymbol,
        byMonth,
        byDay,
        rowsParsed: trades.length,
        trades, // erstmal komplett, später limitieren wir sauber
        errors,
      });
      
      
      
      
      
  } catch (e: any) {
    // Falls irgendwas crasht, bekommst du die echte Fehlermeldung als JSON zurück
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error", stack: e?.stack ?? null },
      { status: 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { parseBitgetFuturesCSV } from "../../../core/import/bitgetFutures";
import { buildOverview } from "../../../core/analytics/overview";
import { buildBySymbol } from "../../../core/analytics/bySymbol";
import { buildByMonth } from "../../../core/analytics/byMonth";
import { buildByDay } from "../../../core/analytics/byDay";
import { buildPositions } from "@/core/positions/buildPositions";
import { bySymbolPositions } from "@/core/analytics/bySymbolPositions";
import { byMonthPositions } from "@/core/analytics/byMonthPositions";
import { byDayPositions } from "@/core/analytics/byDayPositions";


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
    const { positions, openLotsLeft, errors: posErrors } = buildPositions(trades);

    const bySymbolPos = bySymbolPositions(positions);
    const byMonthPos = byMonthPositions(positions);
    const byDayPos = byDayPositions(positions);
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
      
        trades,                 // aktuell komplett
        positions,              // ✅ NEU: die gematchten Positionen
        positionsCount: positions.length,        // optional, hilfreich
        openPositionsCount: openLotsLeft.length, // optional, hilfreich

          // ✅ Positions-Analytics:
  bySymbolPositions: bySymbolPos,
  byMonthPositions: byMonthPos,
  byDayPositions: byDayPos,
      
        errors: [...(errors ?? []), ...(posErrors ?? [])], // ✅ zusammenführen
      });
      
      
      
      
      
      
  } catch (e: any) {
    // Falls irgendwas crasht, bekommst du die echte Fehlermeldung als JSON zurück
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error", stack: e?.stack ?? null },
      { status: 500 }
    );
  }
}

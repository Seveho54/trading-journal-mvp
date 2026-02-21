import { NextResponse } from "next/server";
import { riskEventStore } from "@/core/risk/store/eventStore";
import { mapTradesToRiskEvents } from "@/core/risk/mappers/mapTradesToRiskEvents";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const trades = body.trades ?? [];

    const events = mapTradesToRiskEvents(trades);

    // clear store for now (MVP session based)
    riskEventStore.clear();

    for (const e of events) {
      riskEventStore.append(e);
    }

    return NextResponse.json({
      success: true,
      eventsStored: events.length,
    });
  } catch {
    return NextResponse.json({ error: "Ingest failed" }, { status: 500 });
  }
}

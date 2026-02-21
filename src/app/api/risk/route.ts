import { NextResponse } from "next/server";
import { computeRiskOS } from "@/core/risk/riskOS";
import { riskEventStore } from "@/core/risk/store/eventStore";

export async function GET() {
  try {
    const events = riskEventStore.getAll();

    const os = computeRiskOS({
      events,
      nowTs: Date.now(),
    });

    return NextResponse.json(os);
  } catch {
    return NextResponse.json(
      { error: "RiskOS execution failed" },
      { status: 500 },
    );
  }
}

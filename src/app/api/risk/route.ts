import { computeRiskOS } from "@/core/risk/riskOS";
import type { RiskEvent } from "@/core/risk/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);

    const events = (body?.events ?? []) as RiskEvent[];

    const counts = events.reduce(
      (acc, e: any) => {
        acc.total++;
        acc.byType[e.type] = (acc.byType[e.type] ?? 0) + 1;
        return acc;
      },
      { total: 0, byType: {} as Record<string, number> },
    );

    console.log("[/api/risk] events:", counts);

    if (!Array.isArray(events) || events.length === 0) {
      return Response.json(
        { ok: false, error: "No events provided" },
        { status: 400 },
      );
    }

    const guardrails = body?.guardrails ?? null;
    const os = computeRiskOS({ events, nowTs: Date.now(), guardrails });

    console.log("[/api/risk] baselines:", os.baselines?.length ?? 0);
    console.log(
      "[/api/risk] deviations:",
      os.deviations?.deviations?.length ?? 0,
    );
    console.log("[/api/risk] actions:", os.actions?.actions?.length ?? 0);

    return Response.json(
      { ok: true, os, debug: { equity: os.equity } },
      { status: 200 },
    );
  } catch (err: any) {
    return Response.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 },
    );
  }
}

// optional: damit GET im Browser nicht 405 macht
export async function GET() {
  return Response.json(
    { ok: false, error: "Use POST with { events: RiskEvent[] }" },
    { status: 405 },
  );
}

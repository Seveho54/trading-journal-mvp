import type { RiskEvent } from "../types";

function toTs(x: any): number {
  const d = new Date(x);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

function num(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

export function mapTradesToRiskEvents(trades: any[]): RiskEvent[] {
  const events: RiskEvent[] = [];

  let runningEquity = 10000;

  for (const t of trades.sort(
    (a, b) =>
      toTs(a?.timestamp ?? a?.time ?? a?.date ?? a?.closedAt ?? a?.executedAt) -
      toTs(b?.timestamp ?? b?.time ?? b?.date ?? b?.closedAt ?? b?.executedAt),
  )) {
    const ts = toTs(
      t?.timestamp ?? t?.time ?? t?.date ?? t?.closedAt ?? t?.executedAt,
    );

    const realized = num(t?.realizedPnl ?? t?.netProfit ?? 0);
    const fee = num(t?.fee ?? t?.commission ?? 0);

    runningEquity += realized - fee;

    // TRADE_CLOSE event
    events.push({
      id: String(t?.id ?? `${ts}-${Math.random()}`),
      type: "TRADE_CLOSE",
      ts,
      symbol: String(t?.symbol ?? ""),
      side: String(t?.positionSide ?? t?.side ?? "")
        .toUpperCase()
        .includes("SHORT")
        ? "SHORT"
        : "LONG",
      qty: num(t?.quantity ?? t?.qty),
      price: num(t?.price ?? t?.exitPrice ?? t?.avgPrice),
      realizedPnl: realized,
      fee,
    });

    // EQUITY_SNAPSHOT event
    events.push({
      id: `eq-${ts}`,
      type: "EQUITY_SNAPSHOT",
      ts,
      equity: runningEquity,
    });
  }

  return events;
}

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

  for (const t of trades) {
    const ts = toTs(
      t?.timestamp ?? t?.time ?? t?.date ?? t?.closedAt ?? t?.executedAt,
    );

    const realized = num(t?.realizedPnl ?? t?.netProfit ?? 0);

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
      fee: num(t?.fee ?? t?.commission ?? 0),
    });
  }

  return events.sort((a, b) => a.ts - b.ts);
}

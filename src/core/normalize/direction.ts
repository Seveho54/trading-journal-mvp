import type { Action, PositionSide } from "../schema/trade";

// Diese Funktion nimmt den Binance-Text und macht daraus unsere Standard-Werte
export function parseDirection(direction: string): {
  action: Action;
  positionSide: PositionSide;
} {
  const d = (direction || "").trim().toLowerCase();

  // "open long" -> OPEN
  // "close short" -> CLOSE
  const action: Action = d.startsWith("open") ? "OPEN" : "CLOSE";

  // wenn "short" drinsteht -> SHORT, sonst LONG
  const positionSide: PositionSide = d.includes("short") ? "SHORT" : "LONG";

  return { action, positionSide };
}

// lib/intel/engine.ts
export type Side = "LONG" | "SHORT" | "UNKNOWN";

export type PositionLike = {
  id?: string;
  symbol?: string;
  side?: any;
  netProfit?: number;

  openedAt?: string;
  closedAt?: string;

  entryPrice?: number | null;
  exitPrice?: number | null;

  // optional alternates (falls eure Positions so heißen)
  openTime?: string;
  closeTime?: string;
  entryTime?: string;
  exitTime?: string;
  entryAt?: string;
  exitAt?: string;
  openPrice?: number | null;
  closePrice?: number | null;
  avgEntryPrice?: number | null;
  avgExitPrice?: number | null;
};

export type IndicatorSnapshot = {
  // keep it small & “important”
  rsi14?: number | null;
  macd?: number | null;
  macdSignal?: number | null;
  ema20?: number | null;
  ema50?: number | null;
  atr14?: number | null;

  // structure for later: support/resistance etc.
  support?: number | null;
  resistance?: number | null;
};

export type IntelSnapshot = {
  key: string; // stable id for UI
  symbol: string;
  side: Side;
  net: number;

  openedAt?: string;
  closedAt?: string;
  entryPrice?: number | null;
  exitPrice?: number | null;

  entry: IndicatorSnapshot;
  exit: IndicatorSnapshot;
};

function safeNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

function normalizeSymbol(s: any) {
  const v = String(s ?? "").trim();
  return v || "—";
}

function getSide(p: any): Side {
  const raw = String(
    p?.side ?? p?.positionSide ?? p?.direction ?? p?.type ?? p?.tradeType ?? "",
  ).toUpperCase();

  if (raw.includes("LONG") || raw === "BUY") return "LONG";
  if (raw.includes("SHORT") || raw === "SELL") return "SHORT";

  const qty = Number(
    p?.qty ?? p?.quantity ?? p?.size ?? p?.contracts ?? p?.positionSize,
  );
  if (Number.isFinite(qty)) {
    if (qty > 0) return "LONG";
    if (qty < 0) return "SHORT";
  }

  return "UNKNOWN";
}

function pickOpenedAt(p: PositionLike) {
  return p.openedAt ?? p.openTime ?? p.entryTime ?? p.entryAt ?? undefined;
}
function pickClosedAt(p: PositionLike) {
  return p.closedAt ?? p.closeTime ?? p.exitTime ?? p.exitAt ?? undefined;
}
function pickEntryPrice(p: PositionLike) {
  const v =
    p.entryPrice ?? p.openPrice ?? p.avgEntryPrice ?? p.openPrice ?? null;
  return v == null ? null : safeNum(v);
}
function pickExitPrice(p: PositionLike) {
  const v =
    p.exitPrice ?? p.closePrice ?? p.avgExitPrice ?? p.closePrice ?? null;
  return v == null ? null : safeNum(v);
}

// ---- MARKET CONTEXT PROVIDER (plug-in later) ----
// Later we replace this with real candle fetching + computations.
export type MarketContextProvider = {
  snapshotAt: (symbol: string, isoTime: string) => Promise<IndicatorSnapshot>;
};

// Default provider (placeholder) -> returns nulls.
// This lets UI + pipeline work already.
export const NullMarketProvider: MarketContextProvider = {
  async snapshotAt() {
    return {
      rsi14: null,
      macd: null,
      macdSignal: null,
      ema20: null,
      ema50: null,
      atr14: null,
      support: null,
      resistance: null,
    };
  },
};

export async function buildIntelSnapshots(
  positions: PositionLike[],
  provider: MarketContextProvider = NullMarketProvider,
): Promise<IntelSnapshot[]> {
  const out: IntelSnapshot[] = [];

  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const symbol = normalizeSymbol(p?.symbol);
    const side = getSide(p);
    const net = safeNum(p?.netProfit);

    const openedAt = pickOpenedAt(p);
    const closedAt = pickClosedAt(p);

    const entryPrice = pickEntryPrice(p);
    const exitPrice = pickExitPrice(p);

    // stable key for UI lists
    const key = String(p?.id ?? `${symbol}-${openedAt ?? "na"}-${i}`);

    // fetch indicators at entry/exit times (if available)
    const entry =
      openedAt && symbol !== "—"
        ? await provider.snapshotAt(symbol, openedAt)
        : {};
    const exit =
      closedAt && symbol !== "—"
        ? await provider.snapshotAt(symbol, closedAt)
        : {};

    out.push({
      key,
      symbol,
      side,
      net,
      openedAt,
      closedAt,
      entryPrice,
      exitPrice,
      entry: entry ?? {},
      exit: exit ?? {},
    });
  }

  return out;
}

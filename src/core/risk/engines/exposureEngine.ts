// src/core/risk/engines/exposureEngine.ts

import { RiskEvent } from "../schema";

/**
 * Minimal shape we need for exposure calculations.
 * We intentionally accept "unknown" fields and normalize inside.
 */
export type LivePosition = {
  symbol: string;
  side: "LONG" | "SHORT";
  qty: number; // base quantity (contracts or coin qty)
  markPrice: number; // current / mark price
  notional?: number; // optional if exchange provides
};

export type ExposureBySymbol = {
  symbol: string;
  notional: number; // abs notional in quote currency
  share: number; // 0..1 of total exposure
  longNotional: number;
  shortNotional: number;
};

export type ClusterExposure = {
  cluster: string;
  notional: number;
  share: number; // 0..1
  symbols: string[];
};

export type ExposureAnalysis = {
  ts: number | null;

  totalExposure: number; // Σ |notional|
  netExposure: number; // Σ signed notional (LONG +, SHORT -)
  effectiveLeverage: number | null; // totalExposure / equity

  concentration: {
    topSymbol: string | null;
    topShare: number; // 0..1
  };

  bySymbol: ExposureBySymbol[];

  directional: {
    longExposure: number;
    shortExposure: number;
    bias: "LONG" | "SHORT" | "NEUTRAL"; // based on netExposure ratio
  };

  clusters: ClusterExposure[];
};

/**
 * Main API:
 * - events: normalized event store
 * - equity: current equity (from equityEngine) - optional but recommended
 */
export function analyzeExposure(args: {
  events: RiskEvent[];
  equity?: number | null;
}): ExposureAnalysis {
  const { events, equity } = args;

  // 1) Find the latest position snapshot-like event.
  // We keep this generic: you may have POSITION_SNAPSHOT / OPEN_POSITIONS / ACCOUNT_STATE etc.
  const lastPosEvent = findLatestPositionsEvent(events);

  const ts = lastPosEvent?.ts ?? null;
  const positions = lastPosEvent ? extractPositions(lastPosEvent) : [];

  // 2) Aggregate
  const totals = computeTotals(positions);
  const bySymbol = computeBySymbol(positions, totals.totalExposure);

  const concentration = (() => {
    if (!bySymbol.length) return { topSymbol: null, topShare: 0 };
    const top = [...bySymbol].sort((a, b) => b.notional - a.notional)[0];
    return { topSymbol: top.symbol, topShare: top.share };
  })();

  const directional = (() => {
    const longExposure = totals.longExposure;
    const shortExposure = totals.shortExposure;

    const biasRatio =
      totals.totalExposure > 0 ? totals.netExposure / totals.totalExposure : 0;

    let bias: "LONG" | "SHORT" | "NEUTRAL" = "NEUTRAL";
    if (biasRatio > 0.15) bias = "LONG";
    else if (biasRatio < -0.15) bias = "SHORT";

    return { longExposure, shortExposure, bias };
  })();

  const effectiveLeverage =
    equity && equity > 0 ? totals.totalExposure / equity : null;

  const clusters = computeClusters(positions, totals.totalExposure);

  return {
    ts,
    totalExposure: totals.totalExposure,
    netExposure: totals.netExposure,
    effectiveLeverage,

    concentration,
    bySymbol,

    directional,
    clusters,
  };
}

/* -----------------------------
   Internals (robust + explainable)
----------------------------- */

function findLatestPositionsEvent(events: RiskEvent[]) {
  // Customize these strings to your schema when you’re ready.
  const TYPES = new Set([
    "POSITION_SNAPSHOT",
    "POSITIONS_SNAPSHOT",
    "OPEN_POSITIONS",
    "ACCOUNT_STATE",
    "RISK_STATE",
  ]);

  let best: RiskEvent | null = null;

  for (const e of events) {
    if (!e || typeof e !== "object") continue;
    const t = String((e as any).type ?? "");
    const ts = Number((e as any).ts);

    if (!TYPES.has(t)) continue;
    if (!Number.isFinite(ts)) continue;

    if (!best || ts > Number((best as any).ts)) best = e;
  }

  return best;
}

function extractPositions(e: RiskEvent): LivePosition[] {
  // We accept different shapes:
  // e.data.positions
  // e.data.openPositions
  // e.data.state.positions
  // etc.

  const data = (e as any).data ?? {};

  const rawList =
    data.positions ??
    data.openPositions ??
    data?.state?.positions ??
    data?.account?.positions ??
    [];

  if (!Array.isArray(rawList)) return [];

  const out: LivePosition[] = [];

  for (const p of rawList) {
    const sym = normalizeSymbol(
      p?.symbol ?? p?.instId ?? p?.instrument ?? p?.s,
    );
    if (!sym) continue;

    const side = normalizeSide(
      p?.side ??
        p?.positionSide ??
        p?.direction ??
        p?.posSide ??
        p?.holdSide ??
        p?.tradeSide,
      p,
    );

    const qty =
      safeNum(p?.qty) ??
      safeNum(p?.size) ??
      safeNum(p?.positionAmt) ??
      safeNum(p?.contracts) ??
      safeNum(p?.available) ??
      0;

    const markPrice =
      safeNum(p?.markPrice) ??
      safeNum(p?.markPx) ??
      safeNum(p?.price) ??
      safeNum(p?.lastPrice) ??
      safeNum(p?.last) ??
      0;

    const notional =
      safeNum(p?.notional) ??
      safeNum(p?.positionValue) ??
      safeNum(p?.usdtValue) ??
      safeNum(p?.notionalValue) ??
      null;

    // We only include positions that actually exist
    if (!(qty > 0) || !(markPrice > 0) || side === "UNKNOWN") continue;

    out.push({
      symbol: sym,
      side,
      qty,
      markPrice,
      notional: notional ?? undefined,
    });
  }

  return out;
}

function computeTotals(positions: LivePosition[]) {
  let totalExposure = 0;
  let netExposure = 0;
  let longExposure = 0;
  let shortExposure = 0;

  for (const p of positions) {
    const signed = p.side === "LONG" ? 1 : p.side === "SHORT" ? -1 : 0;
    if (!signed) continue;

    const notion = p.notional ?? p.qty * p.markPrice;
    const abs = Math.abs(notion);

    totalExposure += abs;
    netExposure += signed * abs;

    if (signed > 0) longExposure += abs;
    if (signed < 0) shortExposure += abs;
  }

  return { totalExposure, netExposure, longExposure, shortExposure };
}

function computeBySymbol(positions: LivePosition[], totalExposure: number) {
  const map = new Map<
    string,
    { symbol: string; longNotional: number; shortNotional: number }
  >();

  for (const p of positions) {
    const notion = Math.abs(p.notional ?? p.qty * p.markPrice);
    if (!(notion > 0)) continue;

    const cur = map.get(p.symbol) ?? {
      symbol: p.symbol,
      longNotional: 0,
      shortNotional: 0,
    };

    if (p.side === "LONG") cur.longNotional += notion;
    if (p.side === "SHORT") cur.shortNotional += notion;

    map.set(p.symbol, cur);
  }

  const out: ExposureBySymbol[] = [];
  for (const x of map.values()) {
    const notional = x.longNotional + x.shortNotional;
    out.push({
      symbol: x.symbol,
      notional,
      share: totalExposure > 0 ? notional / totalExposure : 0,
      longNotional: x.longNotional,
      shortNotional: x.shortNotional,
    });
  }

  out.sort((a, b) => b.notional - a.notional);
  return out;
}

function computeClusters(positions: LivePosition[], totalExposure: number) {
  // MVP deterministic clusters (can be expanded later)
  // - BTC cluster
  // - ETH cluster
  // - Others
  const clusterOf = (sym: string) => {
    const s = sym.toUpperCase();
    if (s.includes("BTC")) return "BTC cluster";
    if (s.includes("ETH")) return "ETH cluster";
    return "Other";
  };

  const map = new Map<
    string,
    { cluster: string; notional: number; symbols: Set<string> }
  >();

  for (const p of positions) {
    const c = clusterOf(p.symbol);
    const notion = Math.abs(p.notional ?? p.qty * p.markPrice);
    if (!(notion > 0)) continue;

    const cur = map.get(c) ?? {
      cluster: c,
      notional: 0,
      symbols: new Set<string>(),
    };

    cur.notional += notion;
    cur.symbols.add(p.symbol);
    map.set(c, cur);
  }

  const out: ClusterExposure[] = [];
  for (const x of map.values()) {
    out.push({
      cluster: x.cluster,
      notional: x.notional,
      share: totalExposure > 0 ? x.notional / totalExposure : 0,
      symbols: Array.from(x.symbols.values()).sort(),
    });
  }

  out.sort((a, b) => b.notional - a.notional);
  return out;
}

/* -----------------------------
   Normalization helpers
----------------------------- */

function safeNum(x: any): number | null {
  const n =
    typeof x === "number"
      ? x
      : typeof x === "string"
        ? Number(x.replace(",", "."))
        : Number(x);

  return Number.isFinite(n) ? n : null;
}

function normalizeSymbol(x: any) {
  const s = String(x ?? "").trim();
  if (!s) return "";
  // Keep futures symbols readable; don’t over-normalize yet.
  return s.toUpperCase();
}

function normalizeSide(raw: any, p: any): "LONG" | "SHORT" | "UNKNOWN" {
  const r = String(raw ?? "").toUpperCase();

  if (r.includes("LONG") || r === "BUY") return "LONG";
  if (r.includes("SHORT") || r === "SELL") return "SHORT";

  // sometimes qty sign encodes direction
  const amt =
    safeNum(p?.positionAmt) ??
    safeNum(p?.qty) ??
    safeNum(p?.size) ??
    safeNum(p?.contracts) ??
    null;

  if (amt != null) {
    if (amt > 0) return "LONG";
    if (amt < 0) return "SHORT";
  }

  return "UNKNOWN";
}

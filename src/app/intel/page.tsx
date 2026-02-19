"use client";

import React, { useMemo, useState, useEffect, useCallback } from "react";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { useRouter } from "next/navigation";
import { DEFAULT_CCY, fmtMoney, fmtPercent } from "@/lib/format";
import { getSnapshotAt, type Timeframe } from "@/lib/intel/marketData";

type AnyPos = any;

function normalizeSymbol(s: any) {
  const v = String(s ?? "").trim();
  return v || "—";
}

function getSide(p: any): "LONG" | "SHORT" | "UNKNOWN" {
  const raw = String(
    p?.side ?? p?.positionSide ?? p?.direction ?? p?.type ?? p?.tradeType ?? "",
  ).toUpperCase();
  if (raw.includes("LONG") || raw === "BUY") return "LONG";
  if (raw.includes("SHORT") || raw === "SELL") return "SHORT";
  return "UNKNOWN";
}

function getEntryExitFromPosition(p: any) {
  const entry =
    p?.entryPrice ??
    p?.avgEntryPrice ??
    p?.openPrice ??
    p?.entry ??
    p?.price ??
    p?.fillPrice ??
    null;

  const exit =
    p?.exitPrice ??
    p?.avgExitPrice ??
    p?.closePrice ??
    p?.exit ??
    p?.close ??
    p?.exitFillPrice ??
    null;

  const entryPx = entry != null ? Number(entry) : null;
  const exitPx = exit != null ? Number(exit) : null;

  return {
    entryPx: Number.isFinite(entryPx as any) ? (entryPx as number) : null,
    exitPx: Number.isFinite(exitPx as any) ? (exitPx as number) : null,
  };
}

function parseIso(x: any): string | null {
  if (x == null || x === "") return null;

  // number or numeric string => epoch
  const asNum =
    typeof x === "number"
      ? x
      : typeof x === "string" && /^\d+(\.\d+)?$/.test(x.trim())
        ? Number(x.trim())
        : NaN;

  if (Number.isFinite(asNum)) {
    // seconds vs ms heuristic
    const ms = asNum < 1e12 ? Math.round(asNum * 1000) : Math.round(asNum);
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  }

  // normal date string (ISO etc.)
  const d = new Date(String(x));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function cardInner(): React.CSSProperties {
  return {
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 14,
    background: "rgba(255,255,255,0.02)",
  };
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

function fmtNum(x: any, d = 2) {
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(d) : "—";
}

function getMacdParts(ind: any): {
  macd: number | null;
  signal: number | null;
  hist: number | null;
} {
  const m =
    ind?.macd ?? ind?.MACD ?? ind?.macd_12_26_9 ?? ind?.macd12269 ?? null;

  if (!m) return { macd: null, signal: null, hist: null };

  const macd = m.macd ?? m.line ?? m.value ?? m.macdLine ?? null;
  const signal = m.signal ?? m.signalLine ?? null;
  const hist = m.hist ?? m.histogram ?? m.diff ?? null;

  const toN = (x: any) => (Number.isFinite(Number(x)) ? Number(x) : null);

  return { macd: toN(macd), signal: toN(signal), hist: toN(hist) };
}

function macdState(ind: any) {
  const { macd, signal } = getMacdParts(ind);
  if (macd == null || signal == null) return "MACD ?";
  return macd >= signal ? "MACD Bull" : "MACD Bear";
}

function classifyRSI(rsi?: number | null) {
  if (rsi == null || !Number.isFinite(rsi)) return "—";
  if (rsi < 30) return "Oversold (<30)";
  if (rsi > 70) return "Overbought (>70)";
  return "Neutral (30–70)";
}

function trendState(ema20?: number | null, ema50?: number | null) {
  if (
    ema20 == null ||
    ema50 == null ||
    !Number.isFinite(ema20) ||
    !Number.isFinite(ema50)
  )
    return "—";
  return ema20 >= ema50
    ? "Uptrend (EMA20 ≥ EMA50)"
    : "Downtrend (EMA20 < EMA50)";
}

function atrPercent(atr?: number | null, price?: number | null) {
  if (
    atr == null ||
    price == null ||
    !Number.isFinite(atr) ||
    !Number.isFinite(price) ||
    price <= 0
  )
    return null;
  return atr / price; // e.g. 0.012 = 1.2%
}

function fmtIsoFromMs(ms: any) {
  const n = Number(ms);
  if (!Number.isFinite(n)) return "—";
  return new Date(n).toISOString().slice(0, 16).replace("T", " ");
}

function confidenceLabel(idx: any) {
  const i = Number(idx);
  if (!Number.isFinite(i)) return { text: "—", cls: "pnl-zero" };
  if (i >= 80) return { text: "OK", cls: "pnl-positive" };
  if (i >= 40) return { text: "MEDIUM", cls: "pnl-zero" };
  return { text: "LOW (not enough history)", cls: "pnl-negative" };
}

function fmtShortMoney(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(2)}k`;
  return n.toFixed(2);
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function edgeScore(args: {
  avg: number; // avg net per trade
  winRate: number; // 0..1
  count: number;
  std: number; // std dev of net per trade
}) {
  const { avg, winRate, count, std } = args;

  // sample weight (0..1), saturates after ~25 samples
  const sampleW = clamp01(count / 25);

  // stability: reward lower variance (std)
  // if std is huge relative to avg, penalize heavily
  const denom = Math.abs(avg) + 1e-9;
  const volPenalty = clamp01(1 - Math.min(3, std / denom) / 3); // 1 good -> 0 bad

  // winrate confidence (centered around 50%)
  const wrW = clamp01((winRate - 0.45) / 0.35); // ~0 at 45%, ~1 at 80%

  // avg normalization (soft)
  const avgW = clamp01(Math.tanh(Math.abs(avg) / 20)); // tune later

  const score01 = avgW * 0.45 + wrW * 0.35 + sampleW * 0.2;
  const score = Math.round(100 * score01 * (0.65 + 0.35 * volPenalty));

  return Math.max(0, Math.min(100, score));
}

function stabilityLabel(firstAvg: number, secondAvg: number) {
  const a = firstAvg;
  const b = secondAvg;

  // both positive or both negative -> stable direction
  if (a >= 0 && b >= 0) return { text: "Stable ✅", cls: "pnl-positive" };
  if (a <= 0 && b <= 0) return { text: "Stable ✅", cls: "pnl-positive" };

  return { text: "Unstable ⚠️", cls: "pnl-negative" };
}

function badgeStyle(kind: "BEST" | "WORST") {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      kind === "BEST" ? "rgba(0, 212, 255, 0.10)" : "rgba(255, 72, 72, 0.10)",
  } as React.CSSProperties;
}

function metaTextStyle(): React.CSSProperties {
  return { fontSize: 12, opacity: 0.85, lineHeight: 1.3 };
}

function splitPatternKey(key: string) {
  // expected: "ADAUSDT LONG · RSI50-70 · Uptrend... · MACD Bull · Px>EMA20..."
  const parts = String(key ?? "")
    .split("·")
    .map((s) => s.trim())
    .filter(Boolean);

  const head = parts[0] ?? "Pattern";
  const rest = parts.slice(1);

  return { head, badges: rest };
}

export default function IntelPage() {
  const router = useRouter();
  const { data } = useTradeSession();
  const positions = useMemo(() => (data?.positions ?? []) as AnyPos[], [data]);

  const hasSession = positions.length > 0;

  // MVP timeframe selector (later: advanced)
  const [tf, setTf] = useState<Timeframe>("15m");

  const [patternTab, setPatternTab] = useState<"BEST" | "WORST">("BEST");

  // selected position
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // snapshots
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [entrySnap, setEntrySnap] = useState<any>(null);
  const [exitSnap, setExitSnap] = useState<any>(null);

  const [batchIntel, setBatchIntel] = useState<
    Array<{
      id: string;
      symbol: string;
      side: "LONG" | "SHORT" | "UNKNOWN";
      net: number;
      entry: any | null;
      entryPx: number | null; // ✅ HIER hinzufügen
    }>
  >([]);

  // keep list short so page stays compact
  const list = useMemo(() => {
    const out = [...positions];
    // newest first if closedAt exists
    out.sort((a, b) =>
      String(b?.closedAt ?? b?.openedAt ?? "").localeCompare(
        String(a?.closedAt ?? a?.openedAt ?? ""),
      ),
    );
    return out.slice(0, 20);
  }, [positions]);

  const loadIntel = useCallback(
    async (p: AnyPos) => {
      setLoading(true);
      setErr(null);
      setEntrySnap(null);
      setExitSnap(null);

      try {
        const symbol = normalizeSymbol(p?.symbol);
        const openedAt =
          parseIso(p?.openedAt ?? p?.openTime ?? p?.entryTime ?? p?.entryAt) ??
          null;
        const closedAt =
          parseIso(p?.closedAt ?? p?.closeTime ?? p?.exitTime ?? p?.exitAt) ??
          null;

        if (!openedAt)
          throw new Error("Position has no valid openedAt timestamp.");

        const entry = await getSnapshotAt({
          symbol,
          tf,
          isoTime: openedAt,
          lookbackDays: 120,
        });

        const exit = closedAt
          ? await getSnapshotAt({
              symbol,
              tf,
              isoTime: closedAt,
              lookbackDays: 120,
            })
          : null;

        setEntrySnap(entry);
        setExitSnap(exit);

        // ---- Batch: last N positions for pattern detection (entry snapshots only)
        const N = 60;
        const recent = [...positions]
          .slice()
          .sort((a, b) =>
            String(b?.closedAt ?? b?.openedAt ?? "").localeCompare(
              String(a?.closedAt ?? a?.openedAt ?? ""),
            ),
          )
          .slice(0, N);

        const batch: Array<{
          id: string;
          symbol: string;
          side: "LONG" | "SHORT" | "UNKNOWN";
          net: number;
          entry: any | null;
          entryPx: number | null; // ✅ hinzufügen
        }> = [];

        for (const rp of recent) {
          const rid = String(rp?.id ?? rp?._id ?? rp?.uid ?? "");
          const rsym = normalizeSymbol(rp?.symbol);
          const rside = getSide(rp);
          const rnet = Number(rp?.netProfit ?? 0);

          const { entryPx } = getEntryExitFromPosition(rp); // NEW

          const ropenedAt =
            parseIso(
              rp?.openedAt ?? rp?.openTime ?? rp?.entryTime ?? rp?.entryAt,
            ) ?? null;

          if (!ropenedAt || rsym === "—") {
            batch.push({
              id: rid,
              symbol: rsym,
              side: rside,
              net: rnet,
              entry: null,
              entryPx: entryPx ?? null, // NEW
            });
            continue;
          }

          const ent = await getSnapshotAt({
            symbol: rsym,
            tf,
            isoTime: ropenedAt,
            lookbackDays: 120,
          });

          batch.push({
            id: rid,
            symbol: rsym,
            side: rside,
            net: rnet,
            entry: ent,
            entryPx: entryPx ?? null, // NEW
          });
        }

        setBatchIntel(batch);
      } catch (e: any) {
        setErr(e?.message ?? "Intel load failed");
      } finally {
        setLoading(false);
      }
    },
    [tf],
  );

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return (
      list.find(
        (p) => String(p?.id ?? p?._id ?? p?.uid ?? "") === selectedId,
      ) ?? null
    );
  }, [selectedId, list]);

  const intelSummary = useMemo(() => {
    const net = Number(selected?.netProfit ?? 0);

    const e = entrySnap?.indicators;
    const x = exitSnap?.indicators;

    const entryClose = Number(entrySnap?.candle?.c ?? NaN);
    const exitClose = Number(exitSnap?.candle?.c ?? NaN);

    const entryRsi = e?.rsi14 ?? null;
    const exitRsi = x?.rsi14 ?? null;

    const entryMacd = e?.macd?.macd ?? null;
    const entrySig = e?.macd?.signal ?? null;

    const entryEma20 = e?.ema20 ?? null;
    const entryEma50 = e?.ema50 ?? null;

    const entryAtr = e?.atr14 ?? null;

    const atrPct = atrPercent(
      entryAtr,
      Number.isFinite(entryClose) ? entryClose : null,
    );

    const action =
      net >= 0
        ? "Try to repeat this context (same trend + momentum) with strict risk."
        : "This context looks risky for your style — consider avoiding or reducing size.";

    return {
      net,
      entry: {
        rsiLabel: classifyRSI(entryRsi),
        macdLabel: macdState(entryMacd),
        trendLabel: trendState(entryEma20, entryEma50),
        atrPct,
      },
      exit: {
        rsiLabel: classifyRSI(exitRsi),
      },
      action,
    };
  }, [selected, entrySnap, exitSnap]);

  const patterns = useMemo(() => {
    function rsiBucket(rsi?: number | null) {
      if (rsi == null || !Number.isFinite(rsi)) return "RSI ?";
      if (rsi < 30) return "RSI<30";
      if (rsi < 50) return "RSI30-50";
      if (rsi < 70) return "RSI50-70";
      return "RSI>70";
    }

    type Bucket = {
      key: string;
      count: number;
      wins: number;
      net: number;
      avg: number;
      winRate: number;
      std: number;
      edge: number;
      firstAvg: number;
      secondAvg: number;
      stability: { text: string; cls: string };
    };

    const map = new Map<
      string,
      { key: string; nets: number[]; wins: number }
    >();

    for (const r of batchIntel) {
      const ind = r.entry?.indicators;
      if (!ind) continue;

      const rb = rsiBucket(ind?.rsi14 ?? null);
      const tr = trendState(ind?.ema20 ?? null, ind?.ema50 ?? null);
      const mc = macdState(ind); // nutzt deinen robusten getMacdParts()

      // OPTIONAL: symbol/side drin lassen (so wie du es hattest)
      const key = `${r.symbol} ${r.side} · ${rb} · ${tr} · ${mc}`;

      const cur = map.get(key) ?? { key, nets: [], wins: 0 };
      const n = Number(r.net ?? 0);

      cur.nets.push(n);
      if (n > 0) cur.wins += 1;

      map.set(key, cur);
    }

    const out: Bucket[] = [];

    for (const v of map.values()) {
      const count = v.nets.length;
      const net = v.nets.reduce((a, b) => a + b, 0);
      const avg = count ? net / count : 0;
      const winRate = count ? v.wins / count : 0;

      // std dev
      const mean = avg;
      const variance =
        count > 1
          ? v.nets.reduce((a, x) => a + (x - mean) * (x - mean), 0) /
            (count - 1)
          : 0;
      const std = Math.sqrt(Math.max(0, variance));

      // stability split
      const half = Math.floor(count / 2);
      const first = v.nets.slice(0, Math.max(1, half));
      const second = v.nets.slice(Math.max(1, half));
      const firstAvg = first.length
        ? first.reduce((a, b) => a + b, 0) / first.length
        : 0;
      const secondAvg = second.length
        ? second.reduce((a, b) => a + b, 0) / second.length
        : 0;
      const stability = stabilityLabel(firstAvg, secondAvg);

      const edge = edgeScore({ avg, winRate, count, std });

      out.push({
        key: v.key,
        count,
        wins: v.wins,
        net,
        avg,
        winRate,
        std,
        edge,
        firstAvg,
        secondAvg,
        stability,
      });
    }

    // only meaningful
    const filtered = out.filter((x) => x.count >= 4);

    // BEST = highest edge with net positive
    const best = [...filtered]
      .filter((x) => x.net > 0)
      .sort((a, b) => b.edge - a.edge || b.net - a.net)
      .slice(0, 3);

    // WORST = lowest edge with net negative (true leak)
    const worst = [...filtered]
      .filter((x) => x.net < 0)
      .sort((a, b) => a.edge - b.edge || a.net - b.net)
      .slice(0, 3);

    return { best, worst, sampleN: batchIntel.length };
  }, [batchIntel]);

  useEffect(() => {
    if (selected) loadIntel(selected);
  }, [tf, selectedId, loadIntel, selected]);

  function PatternRow({ kind, p }: { kind: "BEST" | "WORST"; p: any }) {
    const net = Number(p?.net ?? 0);
    const count = Number(p?.count ?? 0);
    const wr = Number(p?.winRate ?? 0);

    return (
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          padding: "10px 12px",
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={badgeStyle(kind)}>
              {kind === "BEST" ? "EDGE" : "LEAK"}
            </span>

            <div style={{ fontWeight: 1000, fontSize: 13 }}>
              {p?.label ?? p?.key ?? "Pattern"}
            </div>
          </div>

          <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
            {count} trades · WR {Math.round(wr * 100)}%
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <div
            className={pnlClass(net)}
            style={{ fontWeight: 1000, fontSize: 14 }}
          >
            {fmtMoney(net, DEFAULT_CCY)}
          </div>

          <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
            avg {fmtMoney(Number(p?.avg ?? 0), DEFAULT_CCY)} · WR{" "}
            {Math.round(wr * 100)}% · {count}x
          </div>
        </div>
      </div>
    );
  }

  function PatternCard({ kind, p }: { kind: "BEST" | "WORST"; p: any }) {
    const net = Number(p?.net ?? 0);
    const count = Number(p?.count ?? 0);
    const wr = Number(p?.winRate ?? 0);
    const avg = Number(p?.avg ?? 0);

    const { head, badges } = splitPatternKey(p?.key ?? "");

    return (
      <div
        style={{
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(255,255,255,0.02)",
          borderRadius: 16,
          padding: 12,
          display: "grid",
          gap: 10,
        }}
      >
        {/* Header row */}
        <div
          style={{ display: "flex", justifyContent: "space-between", gap: 12 }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={badgeStyle(kind)}>
              {kind === "BEST" ? "EDGE" : "LEAK"}
            </span>
            <div style={{ fontWeight: 1000, fontSize: 13 }}>{head}</div>
          </div>

          <div style={{ textAlign: "right" }}>
            <div
              className={pnlClass(net)}
              style={{ fontWeight: 1000, fontSize: 14 }}
            >
              {fmtMoney(net, DEFAULT_CCY)}
            </div>
            <div className="p-muted" style={{ fontSize: 12, marginTop: 4 }}>
              total net
            </div>
          </div>
        </div>

        {/* Badges */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {badges.slice(0, 5).map((b: string) => (
            <span
              key={b}
              className="badge"
              style={{
                fontSize: 11,
                padding: "4px 8px",
                borderRadius: 999,
                opacity: 0.95,
              }}
            >
              {b}
            </span>
          ))}
          {badges.length > 5 ? (
            <span
              className="badge"
              style={{ fontSize: 11, padding: "4px 8px" }}
            >
              +{badges.length - 5}
            </span>
          ) : null}
        </div>

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 10,
          }}
        >
          <div style={cardInner()}>
            <div className="p-muted" style={metaTextStyle()}>
              Samples
            </div>
            <div style={{ fontWeight: 1000 }}>{count}</div>
          </div>

          <div style={cardInner()}>
            <div className="p-muted" style={metaTextStyle()}>
              Win Rate
            </div>
            <div style={{ fontWeight: 1000 }}>{fmtPercent(wr)}</div>
          </div>

          <div style={cardInner()}>
            <div className="p-muted" style={metaTextStyle()}>
              Avg net
            </div>
            <div className={pnlClass(avg)} style={{ fontWeight: 1000 }}>
              {fmtMoney(avg, DEFAULT_CCY)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 12,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* Header */}
      <div className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 1000, fontSize: 18 }}>Intel</div>

              <span className="badge badge-purple">BITGET ONLY · BETA</span>
              <span className="badge badge-blue">EDUCATIONAL ANALYTICS</span>
            </div>

            <div
              className="p-muted"
              style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4 }}
            >
              Indicator snapshots for learning & review. Not financial advice.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select value={tf} onChange={(e) => setTf(e.target.value as any)}>
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>

            <button
              className="btn-secondary"
              onClick={() => router.push("/positions")}
            >
              Positions
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/mentor")}
            >
              Mentor
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/performance")}
            >
              Performance
            </button>
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 11,
          opacity: 0.6,
          marginBottom: 8,
        }}
      >
        Educational analytics only — not financial advice.
      </div>

      {!hasSession ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 1000 }}>No session loaded</div>
          <div className="p-muted" style={{ marginTop: 8 }}>
            Upload a CSV first so we can build positions and compute Intel.
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              className="btn-primary"
              onClick={() => router.push("/upload")}
            >
              Go to Upload
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "360px 1fr",
            gap: 12,
            alignItems: "start",
          }}
        >
          {/* LEFT: compact positions list */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>
              Pick a position
            </div>
            <div className="p-muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Showing latest {list.length}. Click to load Entry/Exit snapshots.
            </div>

            <div
              style={{
                display: "grid",
                gap: 8,
                maxHeight: 520,
                overflow: "auto",
                paddingRight: 4,
              }}
            >
              {list.map((p) => {
                const id = String(
                  p?.id ??
                    p?._id ??
                    p?.uid ??
                    p?.timestamp ??
                    p?.openedAt ??
                    Math.random(),
                );
                const sym = normalizeSymbol(p?.symbol);
                const side = getSide(p);
                const net = Number(p?.netProfit ?? 0);

                const isSel = selectedId === id;

                return (
                  <button
                    key={id}
                    className="btn-secondary"
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderRadius: 14,
                      background: isSel ? "rgba(0,212,255,0.08)" : undefined,
                      borderColor: isSel ? "rgba(0,212,255,0.35)" : undefined,
                    }}
                    onClick={() => {
                      setSelectedId(id);
                      loadIntel(p);
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontWeight: 1000, fontSize: 13 }}>
                        {sym} · {side}
                      </div>
                      <div
                        className={pnlClass(net)}
                        style={{ fontWeight: 1000, fontSize: 13 }}
                      >
                        {fmtMoney(net, DEFAULT_CCY)}
                      </div>
                    </div>
                    <div
                      className="p-muted"
                      style={{ fontSize: 11, marginTop: 4 }}
                    >
                      {String(p?.openedAt ?? p?.openTime ?? "").slice(0, 16) ||
                        "—"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: intel detail */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Intel Panel</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Timeframe: <b style={{ color: "var(--text)" }}>{tf}</b> · Data
              source: Binance candles (public)
            </div>

            {!selected ? (
              <div style={{ marginTop: 14, ...cardInner() }}>
                <div style={{ fontWeight: 1000 }}>Select a position</div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  We’ll show RSI, MACD, EMA, ATR at Entry/Exit.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                {/* selected meta */}
                <div style={cardInner()}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 1000, fontSize: 15 }}>
                        {normalizeSymbol(selected.symbol)} · {getSide(selected)}
                      </div>
                      <div
                        className="p-muted"
                        style={{ fontSize: 12, marginTop: 4 }}
                      >
                        opened:{" "}
                        {String(
                          selected?.openedAt ??
                            selected?.openTime ??
                            selected?.entryTime ??
                            "—",
                        )}
                        {selected?.closedAt || selected?.closeTime
                          ? ` · closed: ${String(selected?.closedAt ?? selected?.closeTime ?? "—")}`
                          : ""}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div
                        className={pnlClass(Number(selected?.netProfit ?? 0))}
                        style={{ fontWeight: 1000 }}
                      >
                        {fmtMoney(
                          Number(selected?.netProfit ?? 0),
                          DEFAULT_CCY,
                        )}
                      </div>
                      {(() => {
                        const { entryPx, exitPx } =
                          getEntryExitFromPosition(selected);
                        return (
                          <div
                            className="p-muted"
                            style={{ fontSize: 12, marginTop: 4 }}
                          >
                            entry{" "}
                            <b style={{ color: "var(--text)" }}>
                              {entryPx != null ? entryPx : "—"}
                            </b>{" "}
                            · exit{" "}
                            <b style={{ color: "var(--text)" }}>
                              {exitPx != null ? exitPx : "—"}
                            </b>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {/* Mentor Intel Summary (micro) */}
                <div style={cardInner()}>
                  <div style={{ fontWeight: 1000 }}>Mentor Intel Summary</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Quick read of indicator context at entry/exit (uses fetched
                    snapshot).
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: "grid",
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <span className="p-muted">Trade result</span>
                      <span
                        className={pnlClass(intelSummary.net)}
                        style={{ fontWeight: 1000 }}
                      >
                        {fmtMoney(intelSummary.net, DEFAULT_CCY)}
                      </span>
                    </div>

                    <div style={{ marginTop: 6, fontWeight: 1000 }}>
                      Entry context
                    </div>

                    <div style={{ display: "grid", gap: 6 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span className="p-muted">RSI</span>
                        <span style={{ fontWeight: 1000 }}>
                          {intelSummary.entry.rsiLabel}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span className="p-muted">MACD</span>
                        <span style={{ fontWeight: 1000 }}>
                          {intelSummary.entry.macdLabel}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span className="p-muted">Trend</span>
                        <span style={{ fontWeight: 1000 }}>
                          {intelSummary.entry.trendLabel}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span className="p-muted">Volatility (ATR)</span>
                        <span style={{ fontWeight: 1000 }}>
                          {intelSummary.entry.atrPct != null
                            ? `${(intelSummary.entry.atrPct * 100).toFixed(2)}%`
                            : "—"}
                        </span>
                      </div>
                    </div>

                    <div style={{ marginTop: 6, fontWeight: 1000 }}>Action</div>
                    <div className="p-muted" style={{ lineHeight: 1.5 }}>
                      {intelSummary.action}
                    </div>
                  </div>
                </div>

                {loading ? (
                  <div style={cardInner()}>
                    <div style={{ fontWeight: 1000 }}>
                      Loading market intel…
                    </div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      Fetching candles + computing indicators.
                    </div>
                  </div>
                ) : err ? (
                  <div style={cardInner()}>
                    <div style={{ fontWeight: 1000 }}>Intel failed</div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      {err}
                    </div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      Tip: some symbols might not exist on Binance (or need a
                      different quote).
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    {/* ENTRY */}
                    <div style={cardInner()}>
                      <div style={{ fontWeight: 1000 }}>Entry snapshot</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        Candle close at / before entry time
                      </div>

                      {(() => {
                        const conf = confidenceLabel(entrySnap?.idx);
                        return (
                          <div
                            className="p-muted"
                            style={{ marginTop: 6, fontSize: 12 }}
                          >
                            snapshot candle time:{" "}
                            <b style={{ color: "var(--text)" }}>
                              {fmtIsoFromMs(
                                entrySnap?.candle?.tc ?? entrySnap?.candle?.t,
                              )}
                            </b>
                            {" · "}
                            confidence:{" "}
                            <span
                              className={conf.cls}
                              style={{ fontWeight: 1000 }}
                            >
                              {conf.text}
                            </span>
                          </div>
                        );
                      })()}

                      <div
                        style={{
                          marginTop: 10,
                          display: "grid",
                          gap: 8,
                          fontSize: 12,
                        }}
                      >
                        {(() => {
                          const { entryPx } =
                            getEntryExitFromPosition(selected);
                          return (
                            <div style={{ display: "grid", gap: 6 }}>
                              <div className="p-muted">
                                trade entry price:{" "}
                                <b style={{ color: "var(--text)" }}>
                                  {entryPx != null ? fmtNum(entryPx, 6) : "—"}
                                </b>
                              </div>
                            </div>
                          );
                        })()}

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 10,
                          }}
                        >
                          <div>
                            <div className="p-muted">RSI(14)</div>
                            <div style={{ fontWeight: 1000 }}>
                              {fmtNum(entrySnap?.indicators?.rsi14, 2)}
                            </div>
                          </div>
                          <div>
                            <div className="p-muted">ATR(14)</div>
                            <div style={{ fontWeight: 1000 }}>
                              {fmtNum(entrySnap?.indicators?.atr14, 6)}
                            </div>
                          </div>
                          <div>
                            <div className="p-muted">EMA(20)</div>
                            <div style={{ fontWeight: 1000 }}>
                              {fmtNum(entrySnap?.indicators?.ema20, 6)}
                            </div>
                          </div>
                          <div>
                            <div className="p-muted">EMA(50)</div>
                            <div style={{ fontWeight: 1000 }}>
                              {fmtNum(entrySnap?.indicators?.ema50, 6)}
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: 4 }}>
                          <div className="p-muted">MACD</div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <span>macd</span>
                            <b>
                              {(() => {
                                const m = getMacdParts(entrySnap?.indicators);
                                return (
                                  <>
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 10,
                                      }}
                                    >
                                      <span>macd</span>
                                      <b>{fmtNum(m.macd, 6)}</b>
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 10,
                                      }}
                                    >
                                      <span>signal</span>
                                      <b>{fmtNum(m.signal, 6)}</b>
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        gap: 10,
                                      }}
                                    >
                                      <span>hist</span>
                                      <b>{fmtNum(m.hist, 6)}</b>
                                    </div>
                                  </>
                                );
                              })()}
                            </b>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <span>signal</span>
                            <b>
                              {fmtNum(entrySnap?.indicators?.macd?.signal, 6)}
                            </b>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <span>hist</span>
                            <b>
                              {fmtNum(entrySnap?.indicators?.macd?.hist, 6)}
                            </b>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* EXIT */}
                    <div style={cardInner()}>
                      <div style={{ fontWeight: 1000 }}>Exit snapshot</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        Candle close at / before exit time
                      </div>

                      {(() => {
                        const conf = confidenceLabel(exitSnap?.idx);
                        return (
                          <div
                            className="p-muted"
                            style={{ marginTop: 6, fontSize: 12 }}
                          >
                            snapshot candle time:{" "}
                            <b style={{ color: "var(--text)" }}>
                              {fmtIsoFromMs(exitSnap?.candle?.t)}
                            </b>
                            {" · "}
                            confidence:{" "}
                            <span
                              className={conf.cls}
                              style={{ fontWeight: 1000 }}
                            >
                              {conf.text}
                            </span>
                          </div>
                        );
                      })()}

                      {!exitSnap ? (
                        <div
                          className="p-muted"
                          style={{ marginTop: 10, fontSize: 12 }}
                        >
                          No exit time on this position.
                        </div>
                      ) : (
                        <div
                          style={{
                            marginTop: 10,
                            display: "grid",
                            gap: 8,
                            fontSize: 12,
                          }}
                        >
                          {(() => {
                            const { exitPx } =
                              getEntryExitFromPosition(selected);
                            return (
                              <div style={{ display: "grid", gap: 6 }}>
                                <div className="p-muted">
                                  trade exit price:{" "}
                                  <b style={{ color: "var(--text)" }}>
                                    {exitPx != null ? fmtNum(exitPx, 6) : "—"}
                                  </b>
                                </div>
                              </div>
                            );
                          })()}

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 10,
                            }}
                          >
                            <div>
                              <div className="p-muted">RSI(14)</div>
                              <div style={{ fontWeight: 1000 }}>
                                {fmtNum(exitSnap?.indicators?.rsi14, 2)}
                              </div>
                            </div>
                            <div>
                              <div className="p-muted">ATR(14)</div>
                              <div style={{ fontWeight: 1000 }}>
                                {fmtNum(exitSnap?.indicators?.atr14, 6)}
                              </div>
                            </div>
                            <div>
                              <div className="p-muted">EMA(20)</div>
                              <div style={{ fontWeight: 1000 }}>
                                {fmtNum(exitSnap?.indicators?.ema20, 6)}
                              </div>
                            </div>
                            <div>
                              <div className="p-muted">EMA(50)</div>
                              <div style={{ fontWeight: 1000 }}>
                                {fmtNum(exitSnap?.indicators?.ema50, 6)}
                              </div>
                            </div>
                          </div>

                          <div style={{ marginTop: 4 }}>
                            <div className="p-muted">MACD</div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
                              <span>macd</span>
                              <b>
                                {fmtNum(exitSnap?.indicators?.macd?.macd, 6)}
                              </b>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
                              <span>signal</span>
                              <b>
                                {fmtNum(exitSnap?.indicators?.macd?.signal, 6)}
                              </b>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
                              <span>hist</span>
                              <b>
                                {fmtNum(exitSnap?.indicators?.macd?.hist, 6)}
                              </b>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* small CTA */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="btn-secondary"
                    onClick={() => router.push("/positions")}
                  >
                    Open full positions
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => router.push("/mentor")}
                  >
                    Back to Mentor
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ---------- Pattern Detection ---------- */}
      <div className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 1000 }}>Pattern Detection</div>
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Based on last {patterns.sampleN} positions (entry snapshots).
              Context = RSI + Trend + MACD + Price-vs-EMA20.
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={
                patternTab === "BEST" ? "btn-primary" : "btn-secondary"
              }
              onClick={() => setPatternTab("BEST")}
              style={{ padding: "8px 12px", borderRadius: 999, fontSize: 12 }}
            >
              Best (Edges)
            </button>
            <button
              className={
                patternTab === "WORST" ? "btn-danger" : "btn-secondary"
              }
              onClick={() => setPatternTab("WORST")}
              style={{ padding: "8px 12px", borderRadius: 999, fontSize: 12 }}
            >
              Worst (Leaks)
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
          {(patternTab === "BEST" ? patterns.best : patterns.worst).length ? (
            (patternTab === "BEST" ? patterns.best : patterns.worst).map(
              (p: any) => <PatternCard key={p.key} kind={patternTab} p={p} />,
            )
          ) : (
            <div style={cardInner()}>
              <div style={{ fontWeight: 1000 }}>
                Not enough repeated contexts
              </div>
              <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                Trade more or increase the batch size until contexts repeat (min
                4 samples per context).
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

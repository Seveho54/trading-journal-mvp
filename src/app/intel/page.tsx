"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { DEFAULT_CCY, fmtMoney, fmtPercent } from "@/lib/format";
import { buildIntelSnapshots } from "@/lib/intel/engine";

// =============================
// Types
// =============================
type Side = "LONG" | "SHORT" | "UNKNOWN";

type IntelRow = {
  symbol: string;
  side: Side;
  net: number;
  openedAt?: string;
  closedAt?: string;
  holdMin?: number | null;
};

type ComboBucket = {
  key: string;
  symbol: string;
  side: Side;
  holdBucket: string;
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  net: number;
  avgNet: number;
};

// =============================
// Tuning (MVP, klein halten)
// =============================
const MIN_COMBO_SAMPLE = 3;

// =============================
// Helpers
// =============================
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

function parseDate(x: any): Date | null {
  if (!x) return null;
  const d = new Date(x);
  return Number.isFinite(d.getTime()) ? d : null;
}

function holdMinutes(openedAt?: any, closedAt?: any): number | null {
  const o = parseDate(openedAt);
  const c = parseDate(closedAt);
  if (!o || !c) return null;
  const ms = c.getTime() - o.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / (1000 * 60));
}

function holdBucketLabel(mins: number | null): string {
  if (mins == null) return "Unknown";
  if (mins <= 15) return "0–15m";
  if (mins <= 60) return "15–60m";
  if (mins <= 240) return "1–4h";
  if (mins <= 420) return "4–7h";
  if (mins <= 1440) return "7–24h";
  return "24h+";
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

function cardInner(): React.CSSProperties {
  return {
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 14,
    background: "rgba(255,255,255,0.02)",
  };
}

function pickTimeTs(p: { closedAt?: string; openedAt?: string }) {
  return p.closedAt ?? p.openedAt ?? undefined;
}

function hourUTC(ts?: string) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.getUTCHours();
}

function buildPositionsUrl(params: Record<string, any>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === "—") continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `/positions?${qs}` : "/positions";
}

// =============================
// Page
// =============================
export default function IntelPage() {
  const router = useRouter();
  const { data } = useTradeSession();

  const allPositions = useMemo(() => (data?.positions ?? []) as any[], [data]);
  const hasSession = allPositions.length > 0;

  // -------- Time range (header-like)
  const [range, setRange] = useState<"30" | "90" | "365" | "all">("90");

  const filteredPositions = useMemo(() => {
    if (range === "all") return allPositions;

    const now = Date.now();
    const days = range === "30" ? 30 : range === "90" ? 90 : 365;
    const start = now - days * 24 * 60 * 60 * 1000;

    return allPositions.filter((p) => {
      const ts =
        p?.closedAt ??
        p?.closeTime ??
        p?.exitTime ??
        p?.exitAt ??
        p?.openedAt ??
        p?.openTime ??
        p?.entryTime ??
        p?.entryAt;
      const d = parseDate(ts);
      if (!d) return false;
      return d.getTime() >= start && d.getTime() <= now;
    });
  }, [allPositions, range]);

  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [snapLoading, setSnapLoading] = useState(false);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      setSnapLoading(true);
      try {
        const snaps = await buildIntelSnapshots(filteredPositions);
        if (alive) setSnapshots(snaps);
      } finally {
        if (alive) setSnapLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [filteredPositions]);

  // -------- Build rows
  const rows = useMemo<IntelRow[]>(() => {
    const out: IntelRow[] = [];

    for (const p of filteredPositions) {
      const symbol = normalizeSymbol(p?.symbol);
      const side = getSide(p);
      const net = safeNum(p?.netProfit);

      const openedAt =
        p?.openedAt ?? p?.openTime ?? p?.entryTime ?? p?.entryAt ?? undefined;
      const closedAt =
        p?.closedAt ?? p?.closeTime ?? p?.exitTime ?? p?.exitAt ?? undefined;

      const hm = holdMinutes(openedAt, closedAt);

      out.push({
        symbol,
        side,
        net,
        openedAt: openedAt ? String(openedAt) : undefined,
        closedAt: closedAt ? String(closedAt) : undefined,
        holdMin: hm,
      });
    }
    return out;
  }, [filteredPositions]);

  // -------- Combos (symbol + side + hold bucket)
  const combos = useMemo<ComboBucket[]>(() => {
    const map = new Map<string, ComboBucket>();

    for (const r of rows) {
      if (!r.symbol || r.symbol === "—") continue;

      const hb = holdBucketLabel(r.holdMin ?? null);
      const key = `${r.symbol}|${r.side}|${hb}`;

      const cur =
        map.get(key) ??
        ({
          key,
          symbol: r.symbol,
          side: r.side,
          holdBucket: hb,
          count: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          net: 0,
          avgNet: 0,
        } as ComboBucket);

      cur.count += 1;
      cur.net += r.net;
      if (r.net > 0) cur.wins += 1;
      else if (r.net < 0) cur.losses += 1;

      map.set(key, cur);
    }

    const out = Array.from(map.values());
    for (const x of out) {
      x.winRate = x.count ? x.wins / x.count : 0;
      x.avgNet = x.count ? x.net / x.count : 0;
    }

    return out.filter((x) => x.count >= MIN_COMBO_SAMPLE);
  }, [rows]);

  const bestCombo = useMemo(() => {
    if (!combos.length) return null;
    return [...combos].sort((a, b) => {
      const d = (b.net ?? 0) - (a.net ?? 0);
      if (d !== 0) return d;
      return (b.avgNet ?? 0) - (a.avgNet ?? 0);
    })[0];
  }, [combos]);

  const worstCombo = useMemo(() => {
    if (!combos.length) return null;
    return [...combos].sort((a, b) => (a.net ?? 0) - (b.net ?? 0))[0];
  }, [combos]);

  // -------- Timing (worst hour only for action rule)
  const worstHour = useMemo(() => {
    const map = new Map<number, { hour: number; count: number; net: number }>();
    for (const r of rows) {
      const ts = pickTimeTs(r);
      const h = hourUTC(ts);
      if (h == null) continue;
      const cur = map.get(h) ?? { hour: h, count: 0, net: 0 };
      cur.count += 1;
      cur.net += r.net;
      map.set(h, cur);
    }
    const list = Array.from(map.values()).filter((x) => x.count >= 3);
    if (!list.length) return null;
    return [...list].sort((a, b) => a.net - b.net)[0]; // most negative net
  }, [rows]);

  // -------- Briefing summary (super compact)
  const summary = useMemo(() => {
    const netTotal = rows.reduce((a, r) => a + (r.net ?? 0), 0);
    const wins = rows.filter((r) => (r.net ?? 0) > 0).length;
    const losses = rows.filter((r) => (r.net ?? 0) < 0).length;
    const wr = wins + losses > 0 ? wins / (wins + losses) : 0;

    return { netTotal, wr, n: rows.length };
  }, [rows]);

  // -------- Explorer state
  const symbols = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) if (r.symbol && r.symbol !== "—") set.add(r.symbol);
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [rows]);

  const holdBuckets = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(holdBucketLabel(r.holdMin ?? null));
    return ["All", ...Array.from(set)];
  }, [rows]);

  const [symSel, setSymSel] = useState("All");
  const [sideSel, setSideSel] = useState<"All" | Side>("All");
  const [holdSel, setHoldSel] = useState("All");

  const explorerRows = useMemo(() => {
    return rows.filter((r) => {
      if (symSel !== "All" && r.symbol !== symSel) return false;
      if (sideSel !== "All" && r.side !== sideSel) return false;
      const hb = holdBucketLabel(r.holdMin ?? null);
      if (holdSel !== "All" && hb !== holdSel) return false;
      return true;
    });
  }, [rows, symSel, sideSel, holdSel]);

  const explorerStats = useMemo(() => {
    const net = explorerRows.reduce((a, r) => a + (r.net ?? 0), 0);
    const wins = explorerRows.filter((r) => (r.net ?? 0) > 0).length;
    const losses = explorerRows.filter((r) => (r.net ?? 0) < 0).length;
    const wr = wins + losses > 0 ? wins / (wins + losses) : 0;
    return { net, wr, n: explorerRows.length };
  }, [explorerRows]);

  function goPositions(params: Record<string, any>) {
    router.push(buildPositionsUrl(params));
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
            <div style={{ fontWeight: 1000, fontSize: 18 }}>Intel</div>
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Context-first analytics (not another journal).
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn-secondary"
              onClick={() => router.push("/mentor")}
            >
              Mentor
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/positions")}
            >
              Positions
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/risk")}
            >
              Risk
            </button>
          </div>
        </div>

        {/* Range chips */}
        <div
          style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}
        >
          {[
            { id: "30", label: "30D" },
            { id: "90", label: "90D" },
            { id: "365", label: "1Y" },
            { id: "all", label: "All" },
          ].map((x) => (
            <button
              key={x.id}
              className={
                range === (x.id as any) ? "btn-primary" : "btn-secondary"
              }
              style={{ padding: "8px 12px", borderRadius: 999, fontSize: 12 }}
              onClick={() => setRange(x.id as any)}
            >
              {x.label}
            </button>
          ))}

          <div
            className="p-muted"
            style={{ fontSize: 12, alignSelf: "center" }}
          >
            {summary.n} positions · WR {fmtPercent(summary.wr)} ·{" "}
            <span
              className={pnlClass(summary.netTotal)}
              style={{ fontWeight: 900 }}
            >
              {fmtMoney(summary.netTotal, DEFAULT_CCY)}
            </span>
          </div>
        </div>
      </div>

      {!hasSession ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 1000 }}>Keine Session geladen</div>
          <div className="p-muted" style={{ marginTop: 8 }}>
            Lade zuerst eine CSV hoch, damit Intel deine Positions analysieren
            kann.
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
        <div style={{ display: "grid", gap: 12 }}>
          {/* 1) Intel Briefing */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Intel Briefing</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              One screen. Actionable context. Drill down with one click.
            </div>

            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Intel snapshots: {snapLoading ? "loading…" : snapshots.length}
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={cardInner()}>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    fontWeight: 900,
                  }}
                >
                  EDGE CONTEXT (best repeatable)
                </div>
                {bestCombo ? (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontWeight: 1000 }}>
                      {bestCombo.symbol} · {bestCombo.side} ·{" "}
                      {bestCombo.holdBucket}
                    </div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      {bestCombo.count} samples · WR{" "}
                      {fmtPercent(bestCombo.winRate)} · net{" "}
                      <span
                        className={pnlClass(bestCombo.net)}
                        style={{ fontWeight: 900 }}
                      >
                        {fmtMoney(bestCombo.net, DEFAULT_CCY)}
                      </span>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          goPositions({
                            symbol: bestCombo.symbol,
                            side: bestCombo.side,
                          })
                        }
                      >
                        Open matching positions
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Not enough repeated patterns yet (need {MIN_COMBO_SAMPLE}+
                    per combo).
                  </div>
                )}
              </div>

              <div style={cardInner()}>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    fontWeight: 900,
                  }}
                >
                  LEAK CONTEXT (worst repeatable)
                </div>
                {worstCombo ? (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontWeight: 1000 }}>
                      {worstCombo.symbol} · {worstCombo.side} ·{" "}
                      {worstCombo.holdBucket}
                    </div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      {worstCombo.count} samples · WR{" "}
                      {fmtPercent(worstCombo.winRate)} · net{" "}
                      <span
                        className={pnlClass(worstCombo.net)}
                        style={{ fontWeight: 900 }}
                      >
                        {fmtMoney(worstCombo.net, DEFAULT_CCY)}
                      </span>
                    </div>
                    <div style={{ marginTop: 10 }}>
                      <button
                        className="btn-secondary"
                        onClick={() =>
                          goPositions({
                            symbol: worstCombo.symbol,
                            side: worstCombo.side,
                          })
                        }
                      >
                        Inspect positions
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Not enough repeated leaks yet.
                  </div>
                )}
              </div>

              <div style={cardInner()}>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    fontWeight: 900,
                  }}
                >
                  TIMING WARNING (worst window)
                </div>
                {worstHour ? (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontWeight: 1000 }}>
                      Worst hour: {String(worstHour.hour).padStart(2, "0")}:00
                      UTC
                    </div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      {worstHour.count} samples · net{" "}
                      <span
                        className={pnlClass(worstHour.net)}
                        style={{ fontWeight: 900 }}
                      >
                        {fmtMoney(worstHour.net, DEFAULT_CCY)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Not enough timing samples yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 2) Context Explorer (compact) */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Context Explorer</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Filter behavior → see impact instantly → open matching positions.
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
              }}
            >
              <div>
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Symbol
                </div>
                <select
                  value={symSel}
                  onChange={(e) => setSymSel(e.target.value)}
                  style={{ width: "100%", marginTop: 6 }}
                >
                  {symbols.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Side
                </div>
                <select
                  value={sideSel}
                  onChange={(e) => setSideSel(e.target.value as any)}
                  style={{ width: "100%", marginTop: 6 }}
                >
                  {["All", "LONG", "SHORT", "UNKNOWN"].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Hold bucket
                </div>
                <select
                  value={holdSel}
                  onChange={(e) => setHoldSel(e.target.value)}
                  style={{ width: "100%", marginTop: 6 }}
                >
                  {holdBuckets.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ ...cardInner(), padding: 12, flex: "1 1 320px" }}>
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Result
                </div>
                <div style={{ marginTop: 6, fontWeight: 1000 }}>
                  {explorerStats.n} positions · WR{" "}
                  {fmtPercent(explorerStats.wr)}
                </div>
                <div
                  className={pnlClass(explorerStats.net)}
                  style={{ marginTop: 6, fontWeight: 1000 }}
                >
                  {fmtMoney(explorerStats.net, DEFAULT_CCY)}
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                <button
                  className="btn-primary"
                  onClick={() =>
                    goPositions({
                      symbol: symSel === "All" ? undefined : symSel,
                      side: sideSel === "All" ? undefined : sideSel,
                      holdBucket: holdSel === "All" ? undefined : holdSel, // (optional param, harmless if positions page ignores it)
                    })
                  }
                >
                  Show positions
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setSymSel("All");
                    setSideSel("All");
                    setHoldSel("All");
                  }}
                >
                  Reset
                </button>
              </div>
            </div>
          </div>

          {/* 3) Rule Cards (3 max) */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Intel Rules</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Small set of guardrails. This is your “Risk OS” layer.
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              <div style={cardInner()}>
                <div className="badge badge-red">AVOID</div>
                <div style={{ marginTop: 8, fontWeight: 1000 }}>
                  Protect the leak
                </div>
                <div
                  className="p-muted"
                  style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5 }}
                >
                  {worstCombo
                    ? `Avoid repeating ${worstCombo.symbol} ${worstCombo.side} with ${worstCombo.holdBucket} holds.`
                    : "Not enough data yet to detect a stable leak."}
                </div>
                <div style={{ marginTop: 10 }}>
                  {worstCombo ? (
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        goPositions({
                          symbol: worstCombo.symbol,
                          side: worstCombo.side,
                        })
                      }
                    >
                      Inspect
                    </button>
                  ) : null}
                </div>
              </div>

              <div style={cardInner()}>
                <div className="badge badge-green">FOCUS</div>
                <div style={{ marginTop: 8, fontWeight: 1000 }}>
                  Double down on edge
                </div>
                <div
                  className="p-muted"
                  style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5 }}
                >
                  {bestCombo
                    ? `Prioritize ${bestCombo.symbol} ${bestCombo.side} with ${bestCombo.holdBucket} holds (WR ${fmtPercent(
                        bestCombo.winRate,
                      )}).`
                    : "Not enough data yet to detect a stable edge."}
                </div>
                <div style={{ marginTop: 10 }}>
                  {bestCombo ? (
                    <button
                      className="btn-secondary"
                      onClick={() =>
                        goPositions({
                          symbol: bestCombo.symbol,
                          side: bestCombo.side,
                        })
                      }
                    >
                      Open
                    </button>
                  ) : null}
                </div>
              </div>

              <div style={cardInner()}>
                <div className="badge badge-purple">FILTER</div>
                <div style={{ marginTop: 8, fontWeight: 1000 }}>
                  Use timing as a guardrail
                </div>
                <div
                  className="p-muted"
                  style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5 }}
                >
                  {worstHour
                    ? `Reduce activity around ${String(worstHour.hour).padStart(2, "0")}:00 UTC (your worst window).`
                    : "Not enough timing samples yet."}
                </div>
              </div>
            </div>

            <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
              Next step: we’ll replace “simple buckets” with real market context
              (indicators per entry/exit).
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

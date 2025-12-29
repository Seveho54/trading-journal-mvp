"use client";

import React, { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { Sparkline } from "../components/Sparkline";
import { buildTradeSummaryFromPositions } from "@/core/analytics/tradeSummaryPositions";

function fmt2(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtPercent(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(n);
}
function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

function bucketLabel(pnl: number) {
  const a = Math.abs(pnl);
  if (a === 0) return "0";
  if (a < 1) return "< 1";
  if (a < 5) return "1–5";
  if (a < 20) return "5–20";
  if (a < 50) return "20–50";
  return "50+";
}

function cardInner(): React.CSSProperties {
  return { border: "1px solid var(--border)", borderRadius: 14, padding: 14, background: "rgba(255,255,255,0.02)" };
}

function sectionTitleStyle(): React.CSSProperties {
  return { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 10 };
}

function Divider() {
  return <div style={{ height: 1, background: "var(--border)", margin: "12px 0" }} />;
}

/** Simple bar chart (no libs): values >=0. Negative values show as red bars below midline */
function BarChartSimple({
  labels,
  values,
  height = 160,
}: {
  labels: string[];
  values: number[];
  height?: number;
}) {
  const maxAbs = useMemo(() => {
    if (!values.length) return 1;
    return Math.max(1, ...values.map((v) => Math.abs(v)));
  }, [values]);

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: 12,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--muted)", fontSize: 12 }}>
        <span>Distribution of P&L</span>
        <span>scale: ±{fmt2(maxAbs)}</span>
      </div>

      <div style={{ position: "relative", height, marginTop: 10 }}>
        {/* midline */}
        <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "var(--border)" }} />

        <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, values.length)}, 1fr)`, gap: 6, height: "100%" }}>
          {values.map((v, i) => {
            const hPct = Math.min(1, Math.abs(v) / maxAbs);
            const hPx = Math.max(2, Math.round((height / 2 - 6) * hPct));
            const isPos = v >= 0;

            return (
              <div key={i} style={{ position: "relative", height: "100%" }}>
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: isPos ? `calc(50% - ${hPx}px)` : "50%",
                    height: hPx,
                    borderRadius: 8,
                    background: isPos ? "rgba(54,211,153,0.45)" : "rgba(251,113,133,0.45)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                  title={`${labels[i]} • count: ${v}`}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap", color: "var(--muted)", fontSize: 11 }}>
        {labels.map((l, i) => (
          <span key={i} style={{ opacity: 0.9 }}>
            {l}
            {i < labels.length - 1 ? " · " : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

// ======================
// TICKER ANALYTICS HELPERS (ADD ABOVE PerformancePage)
// ======================

function safeNum(x: any) {
    const n = Number(x);
    return Number.isFinite(n) ? n : 0;
  }
  
  function normalizeSymbol(s: any) {
    return String(s ?? "").trim() || "—";
  }
  
  function getSide(p: any): "LONG" | "SHORT" | "UNKNOWN" {
    // 1) direct fields
    const raw = String(
      p?.side ??
        p?.positionSide ??
        p?.direction ??
        p?.type ??
        p?.tradeType ??
        ""
    ).toUpperCase();
  
    if (raw.includes("LONG") || raw === "BUY") return "LONG";
    if (raw.includes("SHORT") || raw === "SELL") return "SHORT";
  
    // 2) derive from signed size/qty
    const qty =
      Number(p?.qty ?? p?.quantity ?? p?.size ?? p?.contracts ?? p?.positionSize);
  
    if (Number.isFinite(qty)) {
      if (qty > 0) return "LONG";
      if (qty < 0) return "SHORT";
    }
  
    // 3) derive from pnl leg fields (fallback)
    // sometimes there is 'entrySide' or 'openSide'
    const entry = String(p?.entrySide ?? p?.openSide ?? "").toUpperCase();
    if (entry === "BUY") return "LONG";
    if (entry === "SELL") return "SHORT";
  
    return "UNKNOWN";
  }
  
  
  function dayKeyFromAnyTs(ts: any) {
    // your project already uses this pattern
    return String(ts ?? "").slice(0, 10); // YYYY-MM-DD
  }
  
  function tradeDurationDays(p: any) {
    // best effort: use openedAt/closedAt if present
    const o = p?.openedAt ?? p?.openTime ?? p?.entryTime ?? p?.entryAt;
    const c = p?.closedAt ?? p?.closeTime ?? p?.exitTime ?? p?.exitAt;
    const od = o ? new Date(o) : null;
    const cd = c ? new Date(c) : null;
    if (!od || !cd || Number.isNaN(od.getTime()) || Number.isNaN(cd.getTime())) return null;
    const diff = Math.max(0, cd.getTime() - od.getTime());
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
  }
  
  function mostUsedStrategy(positions: any[]) {
    const map = new Map<string, number>();
    for (const p of positions) {
      const s = String(p?.strategy ?? p?.setup ?? p?.tag ?? "").trim();
      if (!s) continue;
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    let best = "";
    let bestN = 0;
    for (const [k, v] of map.entries()) {
      if (v > bestN) {
        bestN = v;
        best = k;
      }
    }
    return best || "—";
  }
  
  function computeSymbolStats(positions: any[]) {
    const list = positions ?? [];
    const count = list.length;
  
    const pnls = list.map((p) => safeNum(p?.netProfit));
    const net = pnls.reduce((a, b) => a + b, 0);
  
    const wins = pnls.filter((x) => x > 0);
    const losses = pnls.filter((x) => x < 0);
  
    const winRate = count ? wins.length / count : 0;
  
    const grossProfit = wins.reduce((a, b) => a + b, 0);
    const grossLossAbs = Math.abs(losses.reduce((a, b) => a + b, 0));
    const profitFactor = grossLossAbs > 0 ? grossProfit / grossLossAbs : Infinity;
  
    const largestWin = wins.length ? Math.max(...wins) : 0;
    const largestLoss = losses.length ? Math.min(...losses) : 0;
  
    const avgWin = wins.length ? grossProfit / wins.length : 0;
    const avgLoss = losses.length ? (losses.reduce((a, b) => a + b, 0) / losses.length) : 0; // negative
  
    const durations = list
      .map((p) => tradeDurationDays(p))
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));
  
    const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;

    
  
    return {
      count,
      net,
      winRate,
      profitFactor,
      avgWin,
      avgLoss,
      largestWin,
      largestLoss,
      avgDuration,
      wins: wins.length,
      losses: losses.length,
      mostUsed: mostUsedStrategy(list),
    };
  }
  
  // Simple pos/neg bar chart by ticker (like your sheet)
  function TickerBarChart({
    rows,
    height = 240,
  }: {
    rows: { symbol: string; net: number }[];
    height?: number;
  }) {
    const maxAbs = useMemo(() => {
      if (!rows.length) return 1;
      return Math.max(1, ...rows.map((r) => Math.abs(r.net)));
    }, [rows]);
  
    return (
      <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.02)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Net Profit by Ticker</div>
          <div className="p-muted" style={{ fontSize: 12 }}>Scale: ±{fmt2(maxAbs)}</div>
        </div>
  
        <div style={{ position: "relative", height, marginTop: 12, overflowX: "auto", paddingBottom: 8 }}>
          {/* baseline */}
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 1, background: "var(--border)" }} />
  
          <div
            style={{
              display: "grid",
              gridAutoFlow: "column",
              gridAutoColumns: "minmax(34px, 1fr)",
              gap: 10,
              height: "100%",
              minWidth: Math.max(540, rows.length * 48),
              alignItems: "stretch",
            }}
          >
            {rows.map((r) => {
              const pct = Math.min(1, Math.abs(r.net) / maxAbs);
              const half = height / 2 - 18;
              const barH = Math.max(3, Math.round(half * pct));
              const isPos = r.net >= 0;
  
              return (
                <div key={r.symbol} style={{ position: "relative", height: "100%" }}>
                  <div
                    title={`${r.symbol}: ${fmt2(r.net)}`}
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      top: isPos ? `calc(50% - ${barH}px)` : "50%",
                      height: barH,
                      borderRadius: 8,
                      background: isPos ? "rgba(54,211,153,0.55)" : "rgba(251,113,133,0.55)",
                      border: "1px solid rgba(255,255,255,0.12)",
                    }}
                  />
                  <div
                    style={{
                      position: "absolute",
                      left: "50%",
                      transform: "translateX(-50%)",
                      bottom: 0,
                      fontSize: 11,
                      color: "var(--muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.symbol}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
  
        <div className="p-muted" style={{ fontSize: 12, marginTop: 8 }}>
          Tipp: Scroll horizontal wenn viele Ticker.
        </div>
      </div>
    );
  }
 
  
  

/** Simple donut without canvas/libs (conic-gradient) */
function DonutSimple({
  label,
  aLabel,
  aValue,
  bLabel,
  bValue,
}: {
  label: string;
  aLabel: string;
  aValue: number;
  bLabel: string;
  bValue: number;
}) {
  const total = Math.max(1, aValue + bValue);
  const aPct = (aValue / total) * 100;

  return (
    <div style={{ ...cardInner(), padding: 12 }}>
      <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>{label}</div>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 10 }}>
        <div
          style={{
            width: 74,
            height: 74,
            borderRadius: "50%",
            background: `conic-gradient(rgba(54,211,153,0.65) 0 ${aPct}%, rgba(251,113,133,0.55) ${aPct}% 100%)`,
            border: "1px solid var(--border)",
            boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 12,
              borderRadius: "50%",
              background: "rgba(11,18,32,0.85)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
              fontSize: 12,
            }}
          >
            {fmtPercent(aValue / total)}
          </div>
        </div>

        <div style={{ fontSize: 12, color: "var(--muted)" }}>
          <div style={{ marginBottom: 6 }}>
            <span style={{ color: "rgba(54,211,153,0.9)", fontWeight: 900 }}>{aLabel}:</span>{" "}
            <b style={{ color: "var(--text)" }}>{aValue}</b>
          </div>
          <div>
            <span style={{ color: "rgba(251,113,133,0.9)", fontWeight: 900 }}>{bLabel}:</span>{" "}
            <b style={{ color: "var(--text)" }}>{bValue}</b>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionNav({
  items,
}: {
  items: { id: string; label: string; hint?: string; onClick: () => void }[];
}) {
  return (
    <div
      className="card"
      style={{
        padding: 12,
        marginBottom: 12,
        position: "sticky",
        top: 10,
        zIndex: 20,
        backdropFilter: "blur(8px)",
      }}
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {items.map((it) => (
          <button
            key={it.id}
            className="btn-secondary"
            onClick={it.onClick}
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              fontWeight: 900,
              fontSize: 12,
              whiteSpace: "nowrap",
            }}
            title={it.hint ?? ""}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TickerTableBlock({
    title,
    rows,
    router,
  }: {
    title: string;
    rows: any[];
    router: any;
  }) {
    return (
      <div style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, overflow: "hidden", background: "rgba(255,255,255,0.02)" }}>
        <div style={{ padding: 10, fontWeight: 900, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          {title}
        </div>
  
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Ticker", "Net Profit", "Trades", "Win Rate"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: 10,
                    fontSize: 12,
                    color: "var(--muted)",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
  
          <tbody>
            {(rows ?? []).slice(0, 14).map((r: any) => (
              <tr
                key={r.symbol}
                style={{ cursor: "pointer" }}
                onClick={() => router.push(`/positions?symbol=${encodeURIComponent(r.symbol)}`)}
              >
                <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <b>{r.symbol}</b>
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <span className={pnlClass(r.net ?? 0)} style={{ fontWeight: 900 }}>
                    {fmt2(r.net ?? 0)}
                  </span>
                </td>
                <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{r.count ?? 0}</td>
                <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {fmtPercent(r.winRate ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  
  function TickerComparePanel({
    universe,
    allRows,
    positions,
    router,
  }: {
    universe: string[];
    allRows: any[];
    positions: any[];
    router: any;
  }) {
    const [a, setA] = React.useState(universe[0] ?? "—");
    const [b, setB] = React.useState(universe[1] ?? universe[0] ?? "—");
  
    const aList = useMemo(() => positions.filter((p) => normalizeSymbol(p?.symbol) === a), [positions, a]);
    const bList = useMemo(() => positions.filter((p) => normalizeSymbol(p?.symbol) === b), [positions, b]);
  
    const aStats = useMemo(() => computeSymbolStats(aList), [aList]);
    const bStats = useMemo(() => computeSymbolStats(bList), [bList]);
  
    function last3Pnls(list: any[]) {
      const sorted = [...list].sort((x, y) => {
        const tx = String(x?.closedAt ?? x?.timestamp ?? x?.date ?? x?.openedAt ?? "");
        const ty = String(y?.closedAt ?? y?.timestamp ?? y?.date ?? y?.openedAt ?? "");
        return ty.localeCompare(tx);
      });
      return sorted.slice(0, 3).map((p) => safeNum(p?.netProfit));
    }
  
    const aLast = useMemo(() => last3Pnls(aList), [aList]);
    const bLast = useMemo(() => last3Pnls(bList), [bList]);
  
    const aUpDown = aStats.net > 0 ? "▲" : aStats.net < 0 ? "▼" : "•";
    const bUpDown = bStats.net > 0 ? "▲" : bStats.net < 0 ? "▼" : "•";
  
    const rowStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 10, padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.06)" };
  
    function MetricRow({ label, av, bv, clsA, clsB }: any) {
      return (
        <div style={rowStyle}>
          <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>{label}</div>
          <div className={clsA} style={{ fontWeight: 900 }}>{av}</div>
          <div className={clsB} style={{ fontWeight: 900 }}>{bv}</div>
        </div>
      );
    }
  
    return (
      <div style={{ gridColumn: "1 / -1" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 10 }}>
          <div>
            <div className="p-muted" style={{ fontSize: 12, fontWeight: 800 }}>Ticker A</div>
            <select value={a} onChange={(e) => setA(e.target.value)} style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 12, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)" }}>
              {universe.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
  
          <div>
            <div className="p-muted" style={{ fontSize: 12, fontWeight: 800 }}>Ticker B</div>
            <select value={b} onChange={(e) => setB(e.target.value)} style={{ width: "100%", marginTop: 6, padding: 10, borderRadius: 12, border: "1px solid var(--border)", background: "rgba(255,255,255,0.02)", color: "var(--text)" }}>
              {universe.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
  
        <div style={{ ...rowStyle, borderBottom: "1px solid rgba(255,255,255,0.10)", paddingBottom: 10 }}>
          <div />
          <div style={{ fontWeight: 900 }}>{a}</div>
          <div style={{ fontWeight: 900 }}>{b}</div>
        </div>
  
        <MetricRow label="Total Number of Trades" av={aStats.count} bv={bStats.count} />
        <MetricRow label="Total Net P&L" av={fmt2(aStats.net)} bv={fmt2(bStats.net)} clsA={pnlClass(aStats.net)} clsB={pnlClass(bStats.net)} />
        <MetricRow label="Win Rate" av={fmtPercent(aStats.winRate)} bv={fmtPercent(bStats.winRate)} />
        <MetricRow label="Average Trade Duration (days)" av={fmt2(aStats.avgDuration)} bv={fmt2(bStats.avgDuration)} />
        <MetricRow label="Largest Win" av={fmt2(aStats.largestWin)} bv={fmt2(bStats.largestWin)} clsA={pnlClass(aStats.largestWin)} clsB={pnlClass(bStats.largestWin)} />
        <MetricRow label="Average Win Size" av={fmt2(aStats.avgWin)} bv={fmt2(bStats.avgWin)} clsA={pnlClass(aStats.avgWin)} clsB={pnlClass(bStats.avgWin)} />
        <MetricRow label="Largest Loss" av={fmt2(aStats.largestLoss)} bv={fmt2(bStats.largestLoss)} clsA={pnlClass(aStats.largestLoss)} clsB={pnlClass(bStats.largestLoss)} />
        <MetricRow label="Average Loss Size" av={fmt2(aStats.avgLoss)} bv={fmt2(bStats.avgLoss)} clsA={pnlClass(aStats.avgLoss)} clsB={pnlClass(bStats.avgLoss)} />
        <MetricRow label="Most used strategy" av={aStats.mostUsed} bv={bStats.mostUsed} />
  
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 10, paddingTop: 10 }}>
          <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>3 last trades</div>
          <div style={{ display: "flex", gap: 8 }}>
            {aLast.map((x, i) => (
              <span key={i} className={pnlClass(x)} style={{ fontWeight: 900 }}>
                {fmt2(x)}
              </span>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {bLast.map((x, i) => (
              <span key={i} className={pnlClass(x)} style={{ fontWeight: 900 }}>
                {fmt2(x)}
              </span>
            ))}
          </div>
        </div>
  
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr 1fr", gap: 10, paddingTop: 10 }}>
          <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Up/Down</div>
          <div style={{ fontWeight: 900 }}>{aUpDown}</div>
          <div style={{ fontWeight: 900 }}>{bUpDown}</div>
        </div>
  
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
          <button className="btn-secondary" onClick={() => router.push(`/positions?symbol=${encodeURIComponent(a)}`)}>
            Open {a}
          </button>
          <button className="btn-secondary" onClick={() => router.push(`/positions?symbol=${encodeURIComponent(b)}`)}>
            Open {b}
          </button>
        </div>
      </div>
    );
  }
  

export default function PerformancePage() {
  const router = useRouter();
  const { data } = useTradeSession();

  // refs for navigation
  const refSummary = useRef<HTMLDivElement | null>(null);
  const refHistory = useRef<HTMLDivElement | null>(null);
  const refTicker = useRef<HTMLDivElement | null>(null);
  const refRisk = useRef<HTMLDivElement | null>(null);
  const refStrategy = useRef<HTMLDivElement | null>(null);

  const positions = useMemo(() => (data?.positions ?? []) as any[], [data]);
  const byMonthPos = useMemo(() => ((data as any)?.byMonthPositions ?? []) as any[], [data]);
  const byDayPos = useMemo(() => ((data as any)?.byDayPositions ?? []) as any[], [data]);

  const summary = useMemo(() => buildTradeSummaryFromPositions(positions), [positions]);

  const monthLabels = useMemo(() => {
    const months = [...byMonthPos].sort((a: any, b: any) => String(a.month).localeCompare(String(b.month)));
    return months.map((m: any) => m.month);
  }, [byMonthPos]);

  const equityCurveMonthly = useMemo(() => {
    const months = [...byMonthPos].sort((a: any, b: any) => String(a.month).localeCompare(String(b.month)));
    let eq = 0;
    return months.map((m: any) => {
      eq += (m.totalNetProfit ?? 0);
      return eq;
    });
  }, [byMonthPos]);

  const dayLabels = useMemo(() => {
    const days = [...byDayPos].sort((a: any, b: any) => String(a.day).localeCompare(String(b.day)));
    // show shorter label: MM-DD
    return days.map((d: any) => String(d.day).slice(5));
  }, [byDayPos]);

  const equityCurveDaily = useMemo(() => {
    const days = [...byDayPos].sort((a: any, b: any) => String(a.day).localeCompare(String(b.day)));
    let eq = 0;
    return days.map((d: any) => {
      eq += (d.totalNetProfit ?? 0);
      return eq;
    });
  }, [byDayPos]);

  // Distribution: buckets -> counts (for the bar chart)
  const dist = useMemo(() => {
    const list = positions ?? [];
    let winners = 0;
    let losers = 0;
    let breakeven = 0;

    const buckets = new Map<string, { label: string; count: number; net: number }>();

    for (const p of list) {
      const pnl = p?.netProfit ?? 0;
      if (pnl > 0) winners++;
      else if (pnl < 0) losers++;
      else breakeven++;

      const label = bucketLabel(pnl);
      const cur = buckets.get(label) ?? { label, count: 0, net: 0 };
      cur.count += 1;
      cur.net += pnl;
      buckets.set(label, cur);
    }

    const order = ["0", "< 1", "1–5", "5–20", "20–50", "50+"];
    const bucketRows = Array.from(buckets.values()).sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
    const labels = order.filter((l) => bucketRows.some((r) => r.label === l));
    const counts = labels.map((l) => bucketRows.find((r) => r.label === l)?.count ?? 0);

    return { winners, losers, breakeven, bucketRows, labels, counts };
  }, [positions]);

  // Risk analytics from daily
  const risk = useMemo(() => {
    const days = [...byDayPos].sort((a: any, b: any) => String(a.day).localeCompare(String(b.day)));
    if (!days.length) {
      return {
        count: 0,
        profitableDays: 0,
        profitableRate: 0,
        avgDay: 0,
        best: null as any,
        worst: null as any,
        volatility: 0,
        sharpeLite: 0,
      };
    }

    

    const pnls = days.map((d: any) => Number(d.totalNetProfit ?? 0));
    const count = pnls.length;

    const profitableDays = pnls.filter((x) => x > 0).length;
    const profitableRate = profitableDays / count;

    const avgDay = pnls.reduce((a, b) => a + b, 0) / count;

    const sortedByPnl = [...days].sort((a: any, b: any) => (b.totalNetProfit ?? 0) - (a.totalNetProfit ?? 0));
    const best = sortedByPnl[0];
    const worst = sortedByPnl[sortedByPnl.length - 1];

    const mean = avgDay;
    const variance = pnls.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / Math.max(1, count - 1);
    const volatility = Math.sqrt(variance);

    const sharpeLite = volatility > 0 ? mean / volatility : 0;

    return { count, profitableDays, profitableRate, avgDay, best, worst, volatility, sharpeLite };
  }, [byDayPos]);

  const bySymbolTable = useMemo(() => {
    const list = ((data as any)?.bySymbolPositions ?? []) as any[];
    return [...list].sort((a: any, b: any) => (b.totalNetProfit ?? 0) - (a.totalNetProfit ?? 0));
  }, [data]);

  const tickerAgg = useMemo(() => {
    const all = new Map<string, any[]>();
    const longs = new Map<string, any[]>();
    const shorts = new Map<string, any[]>();

    for (const p of positions) {
      const sym = normalizeSymbol(p?.symbol);
      const side = getSide(p);

      if (!all.has(sym)) all.set(sym, []);
      all.get(sym)!.push(p);

      if (side === "LONG") {
        if (!longs.has(sym)) longs.set(sym, []);
        longs.get(sym)!.push(p);
      } else if (side === "SHORT") {
        if (!shorts.has(sym)) shorts.set(sym, []);
        shorts.get(sym)!.push(p);
      }
    }

    function build(map: Map<string, any[]>) {
      const rows: any[] = [];
      for (const [symbol, list] of map.entries()) {
        const s = computeSymbolStats(list);
        rows.push({ symbol, ...s });
      }
      rows.sort((a, b) => (b.net ?? 0) - (a.net ?? 0));
      return rows;
    }

    return {
      all: build(all),
      longs: build(longs),
      shorts: build(shorts),
    };
  }, [positions]);

  const tickerRowsSorted = useMemo(() => {
    // for the bar chart (keep it readable)
    return (tickerAgg.all ?? [])
      .slice()
      .sort((a, b) => Math.abs(b.net ?? 0) - Math.abs(a.net ?? 0))
      .slice(0, 18)
      .map((r) => ({ symbol: r.symbol, net: r.net ?? 0 }));
  }, [tickerAgg]);

  const tickerUniverse = useMemo(() => {
    const list = (tickerAgg.all ?? []).map((r) => r.symbol);
    return list.length ? list : ["—"];
  }, [tickerAgg]);


  // Strategy analytics (MVP)
  const strategyTable = useMemo(() => {
    // If you later add data.byStrategyPositions, use it here.
    const list = ((data as any)?.byStrategyPositions ?? []) as any[];
    return [...list].sort((a: any, b: any) => (b.totalNetProfit ?? 0) - (a.totalNetProfit ?? 0));
  }, [data]);

    // =========================
  // PERFORMANCE HISTORY (sheet-style)
  // =========================

  function safeDate(ts: any) {
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d : null;
  }

  function diffDays(a: Date, b: Date) {
    const ms = b.getTime() - a.getTime();
    return ms / (1000 * 60 * 60 * 24);
  }

  function isoDay(ts: any) {
    return String(ts ?? "").slice(0, 10); // YYYY-MM-DD
  }

  const history = useMemo(() => {
    const days = [...byDayPos].sort((a: any, b: any) => String(a.day).localeCompare(String(b.day)));
    const months = [...byMonthPos].sort((a: any, b: any) => String(a.month).localeCompare(String(b.month)));

    // ---- Weekly / Monthly / Yearly (simple MVP definition)
    // weekly = last 7 trading days (not calendar week)
    const last7 = days.slice(-7);
    const weeklyNet = last7.reduce((acc: number, d: any) => acc + (d.totalNetProfit ?? 0), 0);

    // monthly = current calendar month (UTC-ish via string)
    const now = new Date();
    const curMonthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const monthDays = days.filter((d: any) => String(d.day ?? "").startsWith(curMonthKey));
    const monthlyNet = monthDays.reduce((acc: number, d: any) => acc + (d.totalNetProfit ?? 0), 0);

    // yearly = current calendar year
    const curYearKey = String(now.getUTCFullYear());
    const yearDays = days.filter((d: any) => String(d.day ?? "").startsWith(curYearKey));
    const yearlyNet = yearDays.reduce((acc: number, d: any) => acc + (d.totalNetProfit ?? 0), 0);

    // ---- Best/Worst days (overall)
    const sortedDays = [...days].sort((a: any, b: any) => (b.totalNetProfit ?? 0) - (a.totalNetProfit ?? 0));
    const bestDays = sortedDays.slice(0, 4);
    const worstDays = [...sortedDays].reverse().slice(0, 4);

    // ---- Trade duration analytics from positions (openedAt/closedAt)
    const withDur = (positions ?? [])
      .map((p: any) => {
        const o = safeDate(p.openedAt);
        const c = safeDate(p.closedAt);
        if (!o || !c) return null;
        const d = diffDays(o, c);
        if (!Number.isFinite(d) || d < 0) return null;
        return { ...p, _durDays: d };
      })
      .filter(Boolean) as any[];

    let longest = null as any;
    let shortest = null as any;
    let avgDurDays = 0;

    if (withDur.length) {
      const sorted = [...withDur].sort((a: any, b: any) => (b._durDays ?? 0) - (a._durDays ?? 0));
      longest = sorted[0];
      shortest = [...sorted].reverse()[0];
      avgDurDays = withDur.reduce((acc: number, p: any) => acc + (p._durDays ?? 0), 0) / withDur.length;
    }

    // ---- Duration buckets like your sheet
    const buckets = [
      { key: "0-1", label: "Days (0-1)", min: 0, max: 1 },
      { key: "2-3", label: "Days (2-3)", min: 2, max: 3 },
      { key: "4-7", label: "Days (4-7)", min: 4, max: 7 },
      { key: "8-14", label: "Days (8-14)", min: 8, max: 14 },
      { key: "15-30", label: "Days (15-30)", min: 15, max: 30 },
      { key: "30+", label: "Days (+30)", min: 30, max: Infinity },
    ];

    const bucketRows = buckets.map((b) => {
      const list = withDur.filter((p: any) => {
        const d = Number(p._durDays ?? 0);
        if (b.max === Infinity) return d >= b.min;
        return d >= b.min && d <= b.max;
      });

      const net = list.reduce((acc: number, p: any) => acc + (p.netProfit ?? 0), 0);
      const count = list.length;

      return { ...b, count, net };
    });

    const totalAbs = Math.max(
      1,
      bucketRows.reduce((acc: number, r: any) => acc + Math.abs(r.net ?? 0), 0)
    );
    const bucketRowsWithShare = bucketRows.map((r: any) => ({
      ...r,
      shareAbs: Math.abs(r.net ?? 0) / totalAbs, // 0..1
    }));

    // ---- Monthly net last 12 (for a clean “performance by last 12 months”)
    const last12 = months.slice(-12);
    const monthLabels12 = last12.map((m: any) => String(m.month));
    const monthNet12 = last12.map((m: any) => Number(m.totalNetProfit ?? 0));

    return {
      weeklyNet,
      monthlyNet,
      yearlyNet,
      bestDays,
      worstDays,
      longest,
      shortest,
      avgDurDays,
      bucketRows: bucketRowsWithShare,
      monthLabels12,
      monthNet12,
    };
  }, [byDayPos, byMonthPos, positions]);


  if (!data) {
    return (
      <main>
        <div className="card" style={{ padding: 18 }}>
          <div className="h1">Performance</div>
          <p className="p-muted">Keine Daten geladen. Bitte zuerst eine CSV hochladen.</p>
          <button onClick={() => router.push("/upload")}>Go to Upload</button>
        </div>
      </main>
    );
  }

  function scrollTo(ref: React.RefObject<HTMLDivElement | null>) {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  

  return (
    <main>
      {/* Header */}
      <div className="card" style={{ padding: 18, marginBottom: 12 }}>
        <div className="h1">Performance</div>
        <p className="p-muted">
          Session: <b>{data.uploadedFileName}</b> · Positions: <b>{positions.length}</b>
        </p>
      </div>

      {/* Section Nav (shows what analyses exist) */}
      <SectionNav
        items={[
          { id: "summary", label: "Trade Summary", hint: "KPIs + distribution", onClick: () => scrollTo(refSummary) },
          { id: "history", label: "Performance History", hint: "Equity curve + month/day", onClick: () => scrollTo(refHistory) },
          { id: "ticker", label: "Ticker Analytics", hint: "Symbol leaderboard", onClick: () => scrollTo(refTicker) },
          { id: "risk", label: "Risk Analytics", hint: "Daily stats + volatility", onClick: () => scrollTo(refRisk) },
          { id: "strategy", label: "Strategy Analytics", hint: "Plan / placeholder", onClick: () => scrollTo(refStrategy) },
        ]}
      />

      {/* 1) TRADE SUMMARY */}
      <div ref={refSummary} className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={sectionTitleStyle()}>
          <div style={{ fontWeight: 900 }}>Trade Summary</div>
          <div className="p-muted">High-level snapshot (based on closed positions)</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1.6fr 1.2fr", gap: 12 }}>
          {/* Left: KPI stack */}
          <div style={{ display: "grid", gap: 12 }}>
            <div style={cardInner()}>
              <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>TOTAL P&L</div>
              <div className={pnlClass(summary.totalNetProfit)} style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>
                {fmt2(summary.totalNetProfit)}
              </div>
              <div className="p-muted" style={{ fontSize: 12, marginTop: 6 }}>
                Expectancy: <b style={{ color: "var(--text)" }}>{fmt2(summary.expectancy)}</b> / position
              </div>
            </div>

            <div style={cardInner()}>
              <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>WIN RATE</div>
              <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{fmtPercent(summary.winRate)}</div>
              <div className="p-muted" style={{ fontSize: 12, marginTop: 6 }}>
                {summary.wins}W · {summary.losses}L
              </div>
            </div>

            <div style={cardInner()}>
              <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>PROFIT FACTOR</div>
              <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                {Number.isFinite(summary.profitFactor) ? summary.profitFactor.toFixed(2) : "∞"}
              </div>
              <div className="p-muted" style={{ fontSize: 12, marginTop: 6 }}>
                GP: <span className={pnlClass(summary.grossProfit)}>{fmt2(summary.grossProfit)}</span> · GL:{" "}
                <span className={pnlClass(summary.grossLoss)}>{fmt2(summary.grossLoss)}</span>
              </div>
            </div>
          </div>

          {/* Middle: distribution bar chart */}
          <div>
            <BarChartSimple labels={dist.labels} values={dist.counts} height={180} />
            <div className="p-muted" style={{ fontSize: 12, marginTop: 8 }}>
              Purpose: quick sense of how your results cluster (small wins vs big wins).
            </div>
          </div>

          {/* Right: Win/Loss donuts + DD */}
          <div style={{ display: "grid", gap: 12 }}>
            <DonutSimple label="Wins vs Losses" aLabel="Wins" aValue={dist.winners} bLabel="Losses" bValue={dist.losers} />
            <div style={cardInner()}>
              <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>MAX DRAWDOWN</div>
              <div className={pnlClass(summary.maxDrawdown)} style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                {fmt2(summary.maxDrawdown)}
              </div>
              <div className="p-muted" style={{ fontSize: 12, marginTop: 6 }}>
                Win streak: <b style={{ color: "var(--text)" }}>{summary.maxWinStreak}</b> · Loss streak:{" "}
                <b style={{ color: "var(--text)" }}>{summary.maxLossStreak}</b>
              </div>
            </div>
          </div>
        </div>

        <Divider />

        {/* best / worst */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <div style={cardInner()}>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>BEST POSITION</div>
            {summary.bestPosition ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{summary.bestPosition.symbol}</div>
                <div className={pnlClass(summary.bestPosition.netProfit)} style={{ fontWeight: 900, fontSize: 18 }}>
                  {fmt2(summary.bestPosition.netProfit)}
                </div>
                <button
                  className="btn-secondary"
                  style={{ marginTop: 10 }}
                  onClick={() => router.push(`/positions/${summary.bestPosition!.id}`)}
                >
                  View Position
                </button>
              </div>
            ) : (
              <div className="p-muted" style={{ marginTop: 6 }}>
                –
              </div>
            )}
          </div>

          <div style={cardInner()}>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>WORST POSITION</div>
            {summary.worstPosition ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{summary.worstPosition.symbol}</div>
                <div className={pnlClass(summary.worstPosition.netProfit)} style={{ fontWeight: 900, fontSize: 18 }}>
                  {fmt2(summary.worstPosition.netProfit)}
                </div>
                <button
                  className="btn-secondary"
                  style={{ marginTop: 10 }}
                  onClick={() => router.push(`/positions/${summary.worstPosition!.id}`)}
                >
                  View Position
                </button>
              </div>
            ) : (
              <div className="p-muted" style={{ marginTop: 6 }}>
                –
              </div>
            )}
          </div>
        </div>
      </div>

            {/* 2) PERFORMANCE HISTORY (NEW - sheet inspired) */}
            <div ref={refHistory} className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={sectionTitleStyle()}>
          <div style={{ fontWeight: 900 }}>Performance History</div>
          <div className="p-muted">Time-based breakdown + duration impact (sheet-inspired)</div>
        </div>

        {/* Top grid like your sheet: left summary + middle chart + right duration summary */}
        <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.8fr 1.1fr", gap: 12 }}>
          {/* LEFT: Weekly/Monthly/Yearly + Best/Worst */}
          <div style={cardInner()}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>Summary</div>

            <div style={{ display: "grid", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span className="p-muted">Weekly</span>
                <span className={pnlClass(history.weeklyNet)} style={{ fontWeight: 900 }}>
                  {fmt2(history.weeklyNet)}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span className="p-muted">Monthly</span>
                <span className={pnlClass(history.monthlyNet)} style={{ fontWeight: 900 }}>
                  {fmt2(history.monthlyNet)}
                </span>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span className="p-muted">Yearly</span>
                <span className={pnlClass(history.yearlyNet)} style={{ fontWeight: 900 }}>
                  {fmt2(history.yearlyNet)}
                </span>
              </div>
            </div>

            <Divider />

            <div style={{ fontWeight: 900, marginBottom: 8 }}>Best / Worst Days</div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
              <div>
                <div className="p-muted" style={{ fontSize: 12, marginBottom: 6 }}>Best Days</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {history.bestDays?.length ? history.bestDays.map((d: any) => (
                    <div key={d.day} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: "6px 8px", borderRadius: 10, fontSize: 12 }}
                        onClick={() => router.push(`/positions?day=${d.day}`)}
                      >
                        {d.day}
                      </button>
                      <span className={pnlClass(d.totalNetProfit ?? 0)} style={{ fontWeight: 900 }}>
                        {fmt2(d.totalNetProfit ?? 0)}
                      </span>
                    </div>
                  )) : <div className="p-muted">–</div>}
                </div>
              </div>

              <div>
                <div className="p-muted" style={{ fontSize: 12, marginBottom: 6 }}>Worst Days</div>
                <div style={{ display: "grid", gap: 6 }}>
                  {history.worstDays?.length ? history.worstDays.map((d: any) => (
                    <div key={d.day} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <button
                        className="btn-secondary"
                        style={{ padding: "6px 8px", borderRadius: 10, fontSize: 12 }}
                        onClick={() => router.push(`/positions?day=${d.day}`)}
                      >
                        {d.day}
                      </button>
                      <span className={pnlClass(d.totalNetProfit ?? 0)} style={{ fontWeight: 900 }}>
                        {fmt2(d.totalNetProfit ?? 0)}
                      </span>
                    </div>
                  )) : <div className="p-muted">–</div>}
                </div>
              </div>
            </div>
          </div>

          {/* MIDDLE: “Performance by last 12 months” chart */}
          <div style={cardInner()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Performance by last 12 months</div>
              <div className="p-muted" style={{ fontSize: 12 }}>Monthly net PnL (not cumulative)</div>
            </div>

            <div style={{ marginTop: 10 }}>
              {history.monthLabels12?.length ? (
                <BarChartSimple labels={history.monthLabels12.map((m: string) => m.slice(2))} values={history.monthNet12} height={190} />
              ) : (
                <div className="p-muted">No month data</div>
              )}
            </div>

            <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
              Tip: Use Calendar/Positions filters to drill down.
            </div>
          </div>

          {/* RIGHT: Duration summary + breakdown */}
          <div style={{ display: "grid", gap: 12 }}>
            <div style={cardInner()}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Trade Duration</div>

              <div style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span className="p-muted">Longest Trade</span>
                  <span style={{ fontWeight: 900 }}>
                    {history.longest?._durDays != null ? `${history.longest._durDays.toFixed(1)}d` : "–"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span className="p-muted">Shortest Trade</span>
                  <span style={{ fontWeight: 900 }}>
                    {history.shortest?._durDays != null ? `${history.shortest._durDays.toFixed(1)}d` : "–"}
                  </span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <span className="p-muted">Avg Duration</span>
                  <span style={{ fontWeight: 900 }}>
                    {Number.isFinite(history.avgDurDays) && history.avgDurDays > 0 ? `${history.avgDurDays.toFixed(1)}d` : "–"}
                  </span>
                </div>
              </div>
            </div>

            <div style={cardInner()}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Duration Breakdown</div>

              <div style={{ display: "grid", gap: 8 }}>
                {(history.bucketRows ?? []).map((r: any) => (
                  <div key={r.key} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 64px", gap: 10, alignItems: "center" }}>
                    <div className="p-muted" style={{ fontSize: 12 }}>{r.label}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span className={pnlClass(r.net)} style={{ fontWeight: 900 }}>
                        {fmt2(r.net)}
                      </span>
                      <span className="p-muted" style={{ fontSize: 12 }}>
                        {r.count}x
                      </span>
                    </div>
                    <div style={{ textAlign: "right", fontWeight: 900, fontSize: 12, color: "var(--muted)" }}>
                      {fmtPercent(r.shareAbs ?? 0)}
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
                Share = Anteil am gesamten |Net PnL| über alle Duration-Buckets.
              </div>
            </div>
          </div>
        </div>

        <Divider />

        {/* Bottom: keep your existing equity curves (clean, but now clearly separated) */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div style={cardInner()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Monthly Equity Curve</div>
              <div className="p-muted" style={{ fontSize: 12 }}>Cumulative equity (monthly)</div>
            </div>
            <div style={{ marginTop: 10, height: 120 }}>
  <Sparkline values={equityCurveMonthly} labels={monthLabels} height={120} />
</div>

          </div>

          <div style={cardInner()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Daily Equity Curve</div>
              <div className="p-muted" style={{ fontSize: 12 }}>Cumulative equity (daily)</div>
            </div>
            <div style={{ marginTop: 10, height: 120 }}>
  <Sparkline values={equityCurveDaily} labels={dayLabels} height={120} />
</div>

          </div>
        </div>
      </div>


            {/* 3) TICKER ANALYTICS (Sheet-style) */}
            <div ref={refTicker} className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={sectionTitleStyle()}>
          <div style={{ fontWeight: 900 }}>Ticker Analytics</div>
          <div className="p-muted">Like your sheet: bar chart + compare 2 tickers + ALL/LONG/SHORT tables</div>
        </div>

        {/* A) Bar chart */}
        <div style={{ marginBottom: 12 }}>
          {tickerRowsSorted.length ? (
            <TickerBarChart rows={tickerRowsSorted} height={260} />
          ) : (
            <div className="p-muted" style={cardInner()}>
              No ticker data yet.
            </div>
          )}
        </div>

        {/* B) Compare 2 tickers (dropdowns) */}
        <div style={{ ...cardInner(), padding: 14, marginBottom: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {/* We keep state-free by using URLSearchParams? No: simplest = local state */}
            <TickerComparePanel
              universe={tickerUniverse}
              allRows={tickerAgg.all}
              positions={positions}
              router={router}
            />
          </div>
        </div>

        {/* C) Tables: ALL | LONGS | SHORTS (like sheet) */}
        <div style={{ overflowX: "auto", borderRadius: 14, border: "1px solid var(--border)" }}>
          <div style={{ minWidth: 980, padding: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <TickerTableBlock title="ALL" rows={tickerAgg.all} router={router} />
              <TickerTableBlock title="LONGS" rows={tickerAgg.longs} router={router} />
              <TickerTableBlock title="SHORTS" rows={tickerAgg.shorts} router={router} />
            </div>
          </div>
        </div>

        <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
          Klick auf einen Ticker → öffnet Positions gefiltert.
        </div>
      </div>


      {/* 4) RISK ANALYTICS */}
      <div ref={refRisk} className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={sectionTitleStyle()}>
          <div style={{ fontWeight: 900 }}>Risk Analytics</div>
          <div className="p-muted">Daily results: stability, volatility, extremes</div>
        </div>

        {risk.count === 0 ? (
          <div className="p-muted">Noch keine Tagesdaten vorhanden.</div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
              <div style={cardInner()}>
                <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>% Profitable Days</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{fmtPercent(risk.profitableRate)}</div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  {risk.profitableDays} / {risk.count} days
                </div>
              </div>

              <div style={cardInner()}>
                <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Avg Day PnL</div>
                <div className={pnlClass(risk.avgDay)} style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
                  {fmt2(risk.avgDay)}
                </div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Mean of daily net PnL
                </div>
              </div>

              <div style={cardInner()}>
                <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Volatility (Daily σ)</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{fmt2(risk.volatility)}</div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Sharpe-lite: <b style={{ color: "var(--text)" }}>{risk.sharpeLite.toFixed(2)}</b>
                </div>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              <div style={cardInner()}>
                <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>BEST DAY</div>
                <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>{risk.best?.day ?? "-"}</div>
                <div style={{ marginTop: 6 }}>
                  <span className={pnlClass(risk.best?.totalNetProfit ?? 0)} style={{ fontWeight: 900 }}>
                    {fmt2(risk.best?.totalNetProfit ?? 0)}
                  </span>
                </div>
                {risk.best?.day ? (
                  <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => router.push(`/positions?day=${risk.best.day}`)}>
                    View positions
                  </button>
                ) : null}
              </div>

              <div style={cardInner()}>
                <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>WORST DAY</div>
                <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>{risk.worst?.day ?? "-"}</div>
                <div style={{ marginTop: 6 }}>
                  <span className={pnlClass(risk.worst?.totalNetProfit ?? 0)} style={{ fontWeight: 900 }}>
                    {fmt2(risk.worst?.totalNetProfit ?? 0)}
                  </span>
                </div>
                {risk.worst?.day ? (
                  <button className="btn-secondary" style={{ marginTop: 10 }} onClick={() => router.push(`/positions?day=${risk.worst.day}`)}>
                    View positions
                  </button>
                ) : null}
              </div>
            </div>

            <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
              Sharpe-lite ist nur eine grobe Orientierung (Mean/Std). Kein Risk-free, kein Annualizing.
            </div>
          </>
        )}
      </div>

      {/* 5) STRATEGY ANALYTICS */}
      <div ref={refStrategy} className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={sectionTitleStyle()}>
          <div style={{ fontWeight: 900 }}>Strategy Analytics</div>
          <div className="p-muted">What setups work best (MVP placeholder until data exists)</div>
        </div>

        {strategyTable.length === 0 ? (
          <div style={cardInner()}>
            <div style={{ fontWeight: 900, marginBottom: 6 }}>No strategy data yet</div>
            <div className="p-muted" style={{ fontSize: 12 }}>
              MVP idea: add a “strategy” column in CSV or tagging in the app. Then we can rank strategies by PnL, winrate,
              and drawdown impact.
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
              <button className="btn-secondary" onClick={() => router.push("/trades")}>
                Open Trade Log
              </button>
              <button className="btn-secondary" onClick={() => router.push("/pricing")}>
                Unlock PRO (soon)
              </button>
            </div>
          </div>
        ) : (
          <div style={{ overflow: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Strategy", "Positions", "Winrate", "Net PnL"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {strategyTable.slice(0, 20).map((s: any) => (
                  <tr key={s.strategy} style={{ cursor: "pointer" }}>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <b>{s.strategy}</b>
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{s.positions ?? "-"}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{fmtPercent(s.winRate ?? 0)}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className={pnlClass(s.totalNetProfit ?? 0)} style={{ fontWeight: 900 }}>
                        {fmt2(s.totalNetProfit ?? 0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="card" style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => router.push("/dashboard")} className="btn-secondary">
          Back to Dashboard
        </button>
        <button onClick={() => router.push("/positions")} className="btn-secondary">
          Positions
        </button>
        <button onClick={() => router.push("/calendar")} className="btn-secondary">
          Calendar
        </button>
      </div>
    </main>
  );
}

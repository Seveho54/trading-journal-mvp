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

  // Strategy analytics (MVP)
  const strategyTable = useMemo(() => {
    // If you later add data.byStrategyPositions, use it here.
    const list = ((data as any)?.byStrategyPositions ?? []) as any[];
    return [...list].sort((a: any, b: any) => (b.totalNetProfit ?? 0) - (a.totalNetProfit ?? 0));
  }, [data]);

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

      {/* 2) PERFORMANCE HISTORY */}
      <div ref={refHistory} className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={sectionTitleStyle()}>
          <div style={{ fontWeight: 900 }}>Performance History</div>
          <div className="p-muted">Equity curve over time (monthly + daily)</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
          <div style={cardInner()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Monthly Equity Curve</div>
              <div className="p-muted" style={{ fontSize: 12 }}>
                Click a month row to drill down
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              {byMonthPos.length ? <Sparkline values={equityCurveMonthly} labels={monthLabels} /> : <div className="p-muted">–</div>}
            </div>
          </div>

          <div style={cardInner()}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 900 }}>Daily Equity Curve</div>
              <div className="p-muted" style={{ fontSize: 12 }}>
                Click a day in Calendar for heatmap view
              </div>
            </div>
            <div style={{ marginTop: 10 }}>
              {byDayPos.length ? <Sparkline values={equityCurveDaily} labels={dayLabels} /> : <div className="p-muted">–</div>}
            </div>
          </div>
        </div>

        <Divider />

        {/* compact monthly table */}
        <div style={{ overflow: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Month", "Positions", "Winrate", "Net PnL"].map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 10, fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...byMonthPos]
                .sort((a: any, b: any) => String(a.month).localeCompare(String(b.month)))
                .slice(-12) // last 12 months only (clean)
                .map((m: any) => (
                  <tr
                    key={m.month}
                    style={{ cursor: "pointer" }}
                    onClick={() => router.push(`/positions?day=${m.month}-01`)}
                  >
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <b>{m.month}</b>
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{m.positions}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{fmtPercent(m.winRate ?? 0)}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className={pnlClass(m.totalNetProfit ?? 0)} style={{ fontWeight: 900 }}>
                        {fmt2(m.totalNetProfit ?? 0)}
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
          Showing last 12 months for clarity. Drill down via Calendar / Positions filters.
        </div>
      </div>

      {/* 3) TICKER ANALYTICS */}
      <div ref={refTicker} className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={sectionTitleStyle()}>
          <div style={{ fontWeight: 900 }}>Ticker Analytics</div>
          <div className="p-muted">Which symbols make (or lose) you money</div>
        </div>

        {bySymbolTable.length === 0 ? (
          <div className="p-muted">Noch keine Symbol-Daten vorhanden.</div>
        ) : (
          <div style={{ overflow: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Symbol", "Positions", "Winrate", "Net PnL", "Profit Factor", "Avg Win", "Avg Loss"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: 10,
                        borderBottom: "1px solid var(--border)",
                        fontSize: 12,
                        color: "var(--muted)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {bySymbolTable.slice(0, 25).map((s: any) => (
                  <tr
                    key={s.symbol}
                    style={{ cursor: "pointer" }}
                    onClick={() => router.push(`/positions?symbol=${encodeURIComponent(s.symbol)}`)}
                  >
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <b>{s.symbol}</b>
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{s.positions ?? "-"}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{fmtPercent(s.winRate ?? 0)}</td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className={pnlClass(s.totalNetProfit ?? 0)} style={{ fontWeight: 900 }}>
                        {fmt2(s.totalNetProfit ?? 0)}
                      </span>
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className={pnlClass(s.avgWin ?? 0)} style={{ fontWeight: 900 }}>
                        {fmt2(s.avgWin ?? 0)}
                      </span>
                    </td>
                    <td style={{ padding: 10, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className={pnlClass(s.avgLoss ?? 0)} style={{ fontWeight: 900 }}>
                        {fmt2(s.avgLoss ?? 0)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
          Tip: Klick auf ein Symbol → öffnet Positions gefiltert.
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

"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { buildPositionStats } from "@/core/analytics/positionStats";
import EquityCurvePro from "../components/EquityCurve";

function fmt2(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPercent(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(n);
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

function fmtHoldMinutes(mins: number) {
  if (!Number.isFinite(mins) || mins <= 0) return "–";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = mins / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  const d = h / 24;
  return `${d.toFixed(1)}d`;
}

function safeNumber(n: any) {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function pillStyle(kind: "WIN" | "LOSS" | "NEUTRAL") {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    border: "1px solid var(--border)",
    letterSpacing: 0.2,
    whiteSpace: "nowrap",
  };
  if (kind === "WIN") return { ...base, background: "rgba(54, 211, 153, 0.12)", color: "var(--text)" };
  if (kind === "LOSS") return { ...base, background: "rgba(251, 113, 133, 0.12)", color: "var(--text)" };
  return { ...base, background: "rgba(255,255,255,0.05)", color: "var(--text)" };
}

function kpiCardStyle(): React.CSSProperties {
  return { border: "1px solid var(--border)", borderRadius: 14, padding: 14 };
}

export default function DashboardPage() {
  const router = useRouter();
  const { data, isPro, setIsPro } = useTradeSession();

  // ✅ chart toggles
  const [bucket, setBucket] = useState<"DAILY" | "WEEKLY" | "MONTHLY">("DAILY");
  const [mode, setMode] = useState<"EQUITY" | "DAILY">("EQUITY");

  if (!data) {
    return (
      <main>
        <div className="card" style={{ padding: 18 }}>
          <div className="h1">Dashboard</div>
          <p className="p-muted">Keine Daten geladen. Bitte zuerst eine CSV hochladen.</p>
          <div style={{ marginTop: 14 }}>
            <button onClick={() => router.push("/upload")}>Go to Upload</button>
          </div>
        </div>
      </main>
    );
  }

  // ✅ positions + stats
  const positions = useMemo(() => (data?.positions ?? []) as any[], [data]);
  const stats = useMemo(() => buildPositionStats(positions as any), [positions]);

  // ✅ avg pnl / position (fix for missing avgNet property)
  const avgNet = useMemo(() => {
    const count = stats.positions || 0;
    return count > 0 ? safeNumber(stats.totalNetProfit) / count : 0;
  }, [stats.positions, stats.totalNetProfit]);

  // ✅ by symbol (positions) + best/worst
  const bySymbolPos = useMemo(() => (data?.bySymbolPositions ?? []) as any[], [data]);
  const bestPos = bySymbolPos.length ? bySymbolPos[0] : null;
  const worstPos = bySymbolPos.length ? bySymbolPos[bySymbolPos.length - 1] : null;

  const summary = (data as any)?.summary ?? null;

  // ✅ biggest win/loss position
  const biggestWinPosition = useMemo(() => {
    if (!positions.length) return null;
    const winners = positions.filter((p: any) => (p?.netProfit ?? 0) > 0);
    if (!winners.length) return null;
    return [...winners].sort((a: any, b: any) => (b?.netProfit ?? 0) - (a?.netProfit ?? 0))[0];
  }, [positions]);

  const biggestLossPosition = useMemo(() => {
    if (!positions.length) return null;
    const losers = positions.filter((p: any) => (p?.netProfit ?? 0) < 0);
    if (!losers.length) return null;
    return [...losers].sort((a: any, b: any) => (a?.netProfit ?? 0) - (b?.netProfit ?? 0))[0];
  }, [positions]);

  // ✅ most traded symbol (by positions count)
  const mostTradedSymbol = useMemo(() => {
    if (bySymbolPos?.length) {
      return [...bySymbolPos].sort((a: any, b: any) => (b.positions ?? 0) - (a.positions ?? 0))[0]?.symbol ?? null;
    }
    const map = new Map<string, number>();
    for (const p of positions) {
      const s = String(p?.symbol ?? "");
      if (!s) continue;
      map.set(s, (map.get(s) ?? 0) + 1);
    }
    let best: string | null = null;
    let bestN = 0;
    for (const [k, v] of map.entries()) {
      if (v > bestN) {
        bestN = v;
        best = k;
      }
    }
    return best;
  }, [bySymbolPos, positions]);

  // ✅ trades executed
  const tradesExecuted = useMemo(() => {
    const trades = ((data as any)?.trades ?? []) as any[];
    const executed = trades.filter((t) => !t.status || String(t.status).toUpperCase() === "EXECUTED");
    return { total: trades.length, executed: executed.length };
  }, [data]);

  // ✅ headline pill
  type PillKind = "WIN" | "LOSS" | "NEUTRAL";

  const topLine = useMemo((): { kind: PillKind; net: number } => {
    const net = safeNumber(stats.totalNetProfit);
    const kind: PillKind = net > 0 ? "WIN" : net < 0 ? "LOSS" : "NEUTRAL";
    return { kind, net };
  }, [stats.totalNetProfit]);
  

  // ✅ chart raw points from byDayPositions
  const equityRawPoints = useMemo(() => {
    const byDay = ((data as any)?.byDayPositions ?? []) as any[];
    return [...byDay]
      .filter((d) => d?.day)
      .sort((a, b) => String(a.day).localeCompare(String(b.day)))
      .map((d) => ({
        date: String(d.day), // YYYY-MM-DD
        pnl: safeNumber(d.totalNetProfit ?? 0),
      }));
  }, [data]);

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      {/* Header */}
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="h1" style={{ marginBottom: 6 }}>
              Dashboard
            </div>
            <div className="p-muted">
              Session: <b>{data.uploadedFileName}</b> · Rows: <b>{data.rowsParsed}</b> · Positions:{" "}
              <b>{positions.length}</b> · Trades: <b>{tradesExecuted.executed}</b>
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span style={pillStyle(topLine.kind)}>
  {topLine.kind === "WIN" ? "PROFITABLE" : topLine.kind === "LOSS" ? "DRAWDOWN" : "BREAKEVEN"}
</span>

            {!isPro ? (
              <button className="btn-primary" onClick={() => router.push("/pricing")}>
                Unlock PRO
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {/* Primary KPIs */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontWeight: 900 }}>Overview</div>
          <div className="p-muted">Core KPIs based on closed positions</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div style={kpiCardStyle()}>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Total Net PnL</div>
            <div className={pnlClass(stats.totalNetProfit)} style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>
              {fmt2(stats.totalNetProfit)}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              Max DD:{" "}
              <span className={pnlClass(stats.maxDrawdown)} style={{ fontWeight: 900 }}>
                {fmt2(stats.maxDrawdown)}
              </span>
            </div>
          </div>

          <div style={kpiCardStyle()}>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Win Rate</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{fmtPercent(stats.winRate)}</div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              {stats.wins}W / {stats.losses}L · {stats.positions} total
            </div>
          </div>

          <div style={kpiCardStyle()}>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Profit Factor</div>
            <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>
              {Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              Avg Hold: <b style={{ color: "var(--text)" }}>{fmtHoldMinutes(stats.avgHoldMinutes)}</b>
            </div>
          </div>

          <div style={kpiCardStyle()}>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Avg PnL / Position</div>
            <div className={pnlClass(avgNet)} style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>
              {fmt2(avgNet)}
            </div>
            <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
              Avg Win:{" "}
              <span className={pnlClass(stats.avgWin)} style={{ fontWeight: 900 }}>
                {fmt2(stats.avgWin)}
              </span>{" "}
              · Avg Loss:{" "}
              <span className={pnlClass(stats.avgLoss)} style={{ fontWeight: 900 }}>
                {fmt2(stats.avgLoss)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Performance over time</div>
          <div className="p-muted">Hover for exact values</div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className={mode === "EQUITY" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("EQUITY")}>
              Equity
            </button>
            <button className={mode === "DAILY" ? "btn-primary" : "btn-secondary"} onClick={() => setMode("DAILY")}>
              Daily PnL
            </button>

            <button className={bucket === "DAILY" ? "btn-primary" : "btn-secondary"} onClick={() => setBucket("DAILY")}>
              Daily
            </button>
            <button className={bucket === "WEEKLY" ? "btn-primary" : "btn-secondary"} onClick={() => setBucket("WEEKLY")}>
              Weekly
            </button>
            <button className={bucket === "MONTHLY" ? "btn-primary" : "btn-secondary"} onClick={() => setBucket("MONTHLY")}>
              Monthly
            </button>
          </div>
        </div>

        <div style={{ marginTop: 10 }}>
          <EquityCurvePro rawPoints={equityRawPoints} height={260} bucket={bucket} mode={mode} />
        </div>
      </div>

      {/* Biggest Win / Loss */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 900 }}>Biggest Win</div>
            <span style={pillStyle("WIN")}>WIN</span>
          </div>

          {biggestWinPosition ? (
            <>
              <div style={{ marginTop: 10, fontSize: 16, fontWeight: 900 }}>
                {biggestWinPosition.symbol} · {biggestWinPosition.positionSide}
              </div>
              <div style={{ marginTop: 6, color: "var(--muted)" }}>
                PnL:{" "}
                <span className="pnl-positive" style={{ fontWeight: 900 }}>
                  {fmt2(biggestWinPosition.netProfit ?? 0)}
                </span>
                {" · "}
                Trades: <b style={{ color: "var(--text)" }}>{(biggestWinPosition.trades?.length ?? "-") as any}</b>
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={() => router.push(`/positions/${biggestWinPosition.id}`)} className="btn-secondary">
                  View Position
                </button>
              </div>
            </>
          ) : (
            <div className="p-muted" style={{ marginTop: 10 }}>
              No winning positions yet.
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontWeight: 900 }}>Biggest Loss</div>
            <span style={pillStyle("LOSS")}>LOSS</span>
          </div>

          {biggestLossPosition ? (
            <>
              <div style={{ marginTop: 10, fontSize: 16, fontWeight: 900 }}>
                {biggestLossPosition.symbol} · {biggestLossPosition.positionSide}
              </div>
              <div style={{ marginTop: 6, color: "var(--muted)" }}>
                PnL:{" "}
                <span className="pnl-negative" style={{ fontWeight: 900 }}>
                  {fmt2(biggestLossPosition.netProfit ?? 0)}
                </span>
                {" · "}
                Trades: <b style={{ color: "var(--text)" }}>{(biggestLossPosition.trades?.length ?? "-") as any}</b>
              </div>
              <div style={{ marginTop: 10 }}>
                <button onClick={() => router.push(`/positions/${biggestLossPosition.id}`)} className="btn-secondary">
                  View Position
                </button>
              </div>
            </>
          ) : (
            <div className="p-muted" style={{ marginTop: 10 }}>
              No losing positions yet.
            </div>
          )}
        </div>
      </div>

      {/* Symbols */}
      {(bestPos || worstPos || mostTradedSymbol) && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900 }}>Symbols</div>
            <div className="p-muted">Quick read on what worked / didn’t</div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 12 }}>
            <div style={kpiCardStyle()}>
              <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Most Traded</div>
              <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{mostTradedSymbol ?? "–"}</div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
                Tip: use Positions filters to drill down
              </div>
              {mostTradedSymbol ? (
                <div style={{ marginTop: 10 }}>
                  <button
                    className="btn-secondary"
                    onClick={() => router.push(`/positions?symbol=${encodeURIComponent(mostTradedSymbol)}`)}
                  >
                    View Positions
                  </button>
                </div>
              ) : null}
            </div>

            <div style={kpiCardStyle()}>
              <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Top Symbol (PnL)</div>
              {bestPos ? (
                <>
                  <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{bestPos.symbol}</div>
                  <div style={{ color: "var(--muted)", marginTop: 6, fontSize: 12 }}>
                    Net:{" "}
                    <span className={pnlClass(bestPos.totalNetProfit ?? 0)} style={{ fontWeight: 900 }}>
                      {fmt2(bestPos.totalNetProfit ?? 0)}
                    </span>
                    {" · "}WR: <b style={{ color: "var(--text)" }}>{fmtPercent(bestPos.winRate ?? 0)}</b>
                    {" · "}Pos: <b style={{ color: "var(--text)" }}>{bestPos.positions ?? "-"}</b>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn-secondary"
                      onClick={() => router.push(`/positions?symbol=${encodeURIComponent(bestPos.symbol)}`)}
                    >
                      View Positions
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-muted" style={{ marginTop: 10 }}>
                  –
                </div>
              )}
            </div>

            <div style={kpiCardStyle()}>
              <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Worst Symbol (PnL)</div>
              {worstPos ? (
                <>
                  <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{worstPos.symbol}</div>
                  <div style={{ color: "var(--muted)", marginTop: 6, fontSize: 12 }}>
                    Net:{" "}
                    <span className={pnlClass(worstPos.totalNetProfit ?? 0)} style={{ fontWeight: 900 }}>
                      {fmt2(worstPos.totalNetProfit ?? 0)}
                    </span>
                    {" · "}WR: <b style={{ color: "var(--text)" }}>{fmtPercent(worstPos.winRate ?? 0)}</b>
                    {" · "}Pos: <b style={{ color: "var(--text)" }}>{worstPos.positions ?? "-"}</b>
                  </div>
                  <div style={{ marginTop: 10 }}>
                    <button
                      className="btn-secondary"
                      onClick={() => router.push(`/positions?symbol=${encodeURIComponent(worstPos.symbol)}`)}
                    >
                      View Positions
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-muted" style={{ marginTop: 10 }}>
                  –
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Trades summary */}
      {summary && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 900 }}>Trade Events</div>
            <div className="p-muted">(raw executed trades)</div>
          </div>

          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 10, color: "var(--muted)" }}>
            <div>
              Executed: <b style={{ color: "var(--text)" }}>{summary.executed}</b>
            </div>
            <div>
              Total Net:{" "}
              <span className={pnlClass(summary.totalNetProfit ?? 0)} style={{ fontWeight: 900 }}>
                {fmt2(summary.totalNetProfit ?? 0)}
              </span>
            </div>
            <div>
              Symbols: <b style={{ color: "var(--text)" }}>{summary.symbols}</b>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="card" style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => router.push("/calendar")} className="btn-secondary">
          Calendar
        </button>
        <button onClick={() => router.push("/positions")} className="btn-secondary">
          Positions
        </button>
        <button onClick={() => router.push("/trades")} className="btn-secondary">
          Trade Log
        </button>
        <button onClick={() => router.push("/performance")} className="btn-secondary">
          Performance
        </button>

        <div style={{ flex: 1 }} />

        <button onClick={() => router.push("/upload")} className="btn-secondary">
          Upload
        </button>
        <button onClick={() => router.push("/pricing")} className="btn-secondary">
          Pricing
        </button>
      </div>

      {/* Dev toggle (optional) */}
      {/*
      <div className="card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Plan:</div>
          <div className="p-muted">
            {isPro ? <b style={{ color: "var(--text)" }}>PRO</b> : <b style={{ color: "var(--text)" }}>FREE</b>}
          </div>

          <button onClick={() => setIsPro(!isPro)} style={{ marginLeft: "auto" }}>
            Toggle (Dev)
          </button>
        </div>

<div className="p-muted" style={{ marginTop: 8 }}>
  Free plan has limited access. Upgrade to Pro to unlock all features.
</div>


      </div>
      */}
    </main>
  );
}

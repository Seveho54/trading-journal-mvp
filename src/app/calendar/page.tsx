"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";

function fmt2(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtPercent(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(n);
}
function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

function heatBg(pnl: number, maxAbs: number) {
  if (!maxAbs || maxAbs <= 0) return "rgba(255,255,255,0.02)";
  const strength = Math.min(1, Math.abs(pnl) / maxAbs);
  const alpha = 0.08 + strength * 0.22;
  if (pnl > 0) return `rgba(54, 211, 153, ${alpha})`;
  if (pnl < 0) return `rgba(251, 113, 133, ${alpha})`;
  return "rgba(255,255,255,0.02)";
}

function toDateKey(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfMonthUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addDaysUTC(d: Date, days: number) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
}
function monthLabelUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}
function monthDiffUTC(target: Date, base: Date) {
  return (target.getUTCFullYear() - base.getUTCFullYear()) * 12 + (target.getUTCMonth() - base.getUTCMonth());
}
function dayKeyFromAnyTs(ts: any) {
  return String(ts ?? "").slice(0, 10);
}

export default function CalendarPage() {
  const router = useRouter();
  const { data } = useTradeSession();

  // ✅ ALWAYS safe defaults (hooks always run)
  const byDay = useMemo(() => ((data as any)?.byDayPositions ?? []) as any[], [data]);
  const positions = useMemo(() => ((data as any)?.positions ?? []) as any[], [data]);
  const trades = useMemo(() => ((data as any)?.trades ?? []) as any[], [data]);

  const [monthOffset, setMonthOffset] = useState(0);
  const [showDailyList, setShowDailyList] = useState(false);

  // ✅ best/worst days (MUST be above early returns)
  const sortedAllDays = useMemo(() => {
    return [...byDay].sort((a: any, b: any) => (b.totalNetProfit ?? 0) - (a.totalNetProfit ?? 0));
  }, [byDay]);

  const best = sortedAllDays.length ? sortedAllDays[0] : null;
  const worst = sortedAllDays.length ? sortedAllDays[sortedAllDays.length - 1] : null;

  const map = useMemo(() => {
    const m = new Map<string, any>();
    for (const d of byDay) m.set(String(d.day), d);
    return m;
  }, [byDay]);

  const maxAbsPnl = useMemo(() => {
    if (!byDay.length) return 1;
    return Math.max(1, ...byDay.map((d: any) => Math.abs(d.totalNetProfit ?? 0)));
  }, [byDay]);

  // ✅ Default month: newest month with data
  useEffect(() => {
    if (!byDay.length) return;
    const newest = [...byDay].sort((a: any, b: any) => String(b.day).localeCompare(String(a.day)))[0];
    const dayStr = String(newest?.day ?? "");
    const [yy, mm] = dayStr.split("-").map((x) => parseInt(x, 10));
    if (!yy || !mm) return;

    const target = new Date(Date.UTC(yy, mm - 1, 1));
    const now = new Date();
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    setMonthOffset(monthDiffUTC(target, base));
  }, [byDay]);

  // current month = today + offset
  const now = new Date();
  const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));
  const currentMonthKey = monthLabelUTC(current); // YYYY-MM

  // calendar grid
  const start = startOfMonthUTC(current);
  const startWeekday = (start.getUTCDay() + 6) % 7; // Mon=0 ... Sun=6
  const gridStart = addDaysUTC(start, -startWeekday);

  const days: Date[] = [];
  for (let i = 0; i < 42; i++) days.push(addDaysUTC(gridStart, i));

  // ✅ Month KPIs
  const monthStats = useMemo(() => {
    const monthDays = byDay.filter((d: any) => String(d.day ?? "").startsWith(currentMonthKey));
    const tradingDays = monthDays.length;

    const monthNetPnl = monthDays.reduce((acc: number, d: any) => acc + (d.totalNetProfit ?? 0), 0);
    const avgDailyPnl = tradingDays > 0 ? monthNetPnl / tradingDays : 0;

    const positionsInMonth = positions.filter((p: any) => {
      const closedDay = p.closedAt ? dayKeyFromAnyTs(p.closedAt) : null;
      const openedDay = p.openedAt ? dayKeyFromAnyTs(p.openedAt) : null;

      const closedMonth = closedDay ? String(closedDay).slice(0, 7) : null;
      const openedMonth = openedDay ? String(openedDay).slice(0, 7) : null;

      if (closedMonth) return closedMonth === currentMonthKey;
      return openedMonth === currentMonthKey;
    });

    const closedPositions = positionsInMonth.length;
    const wins = positionsInMonth.filter((p: any) => (p.netProfit ?? 0) > 0).length;
    const winRate = closedPositions > 0 ? wins / closedPositions : 0;

    const monthTrades = trades.filter((t: any) => {
      const ts = String(t.timestamp ?? "");
      const statusOk = !t.status || String(t.status).toUpperCase() === "EXECUTED";
      return statusOk && ts.startsWith(currentMonthKey);
    });

    return {
      monthKey: currentMonthKey,
      tradesCount: monthTrades.length,
      closedPositions,
      tradingDays,
      monthNetPnl,
      avgDailyPnl,
      winRate,
    };
  }, [byDay, positions, trades, currentMonthKey]);

  function goToNewestMonth() {
    if (!byDay.length) return setMonthOffset(0);
    const newest = [...byDay].sort((a: any, b: any) => String(b.day).localeCompare(String(a.day)))[0];
    const [yy, mm] = String(newest.day).split("-").map((x) => parseInt(x, 10));
    if (!yy || !mm) return;

    const target = new Date(Date.UTC(yy, mm - 1, 1));
    const now = new Date();
    const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    setMonthOffset(monthDiffUTC(target, base));
  }

  // ✅ NOW early returns are safe (no hooks below this line)
  if (!data) {
    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
        <h1>Calendar</h1>
        <p>Keine Daten geladen. Bitte zuerst eine CSV hochladen.</p>
        <button onClick={() => router.push("/upload")} style={{ padding: "6px 12px" }}>
          Go to Upload
        </button>
      </main>
    );
  }

  if (byDay.length === 0 || !best || !worst) {
    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
        <h1>Calendar</h1>
        <p>Noch keine Tagesdaten vorhanden. Bitte CSV erneut hochladen.</p>
        <button onClick={() => router.push("/upload")} style={{ padding: "6px 12px" }}>
          Go to Upload
        </button>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      {/* Header */}
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div className="h1">Calendar</div>
        <div className="p-muted">
          Session: <b>{data.uploadedFileName}</b>
        </div>
      </div>

      {/* Highlights + Legend */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Best Day (overall)</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{best.day}</div>
            <div style={{ marginTop: 6 }}>
              Net Profit:{" "}
              <span className={pnlClass(best.totalNetProfit)} style={{ fontWeight: 900 }}>
                {fmt2(best.totalNetProfit)}
              </span>
            </div>
          </div>

          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12 }}>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 800 }}>Worst Day (overall)</div>
            <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>{worst.day}</div>
            <div style={{ marginTop: 6 }}>
              Net Profit:{" "}
              <span className={pnlClass(worst.totalNetProfit)} style={{ fontWeight: 900 }}>
                {fmt2(worst.totalNetProfit)}
              </span>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", flexWrap: "wrap" }}>
          <div style={{ fontSize: 12, fontWeight: 800 }}>Heatmap:</div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12 }}>Loss</span>
            <div
              style={{
                width: 220,
                height: 10,
                borderRadius: 999,
                border: "1px solid var(--border)",
                background:
                  "linear-gradient(90deg, rgba(251,113,133,0.30), rgba(255,255,255,0.02), rgba(54,211,153,0.30))",
              }}
            />
            <span style={{ fontSize: 12 }}>Profit</span>
          </div>

          <div style={{ marginLeft: "auto", fontSize: 12 }}>
            Scale max day |PnL|: <b style={{ color: "var(--text)" }}>{fmt2(maxAbsPnl)}</b>
          </div>
        </div>
      </div>

      {/* Month Header + KPIs */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Month View</div>
          <div className="p-muted">({currentMonthKey})</div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => setMonthOffset((o) => o - 1)} className="btn-secondary">
              Prev
            </button>
            <button onClick={goToNewestMonth} className="btn-secondary">
              This Month
            </button>
            <button onClick={() => setMonthOffset((o) => o + 1)} className="btn-secondary">
              Next
            </button>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginTop: 14,
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          <div>
            <div className="p-muted" style={{ fontSize: 11 }}>
              Trades
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{monthStats.tradesCount}</div>
            <div className="p-muted" style={{ fontSize: 11 }}>
              Positions: {monthStats.closedPositions}
            </div>
          </div>

          <div>
            <div className="p-muted" style={{ fontSize: 11 }}>
              Net PnL
            </div>
            <div className={pnlClass(monthStats.monthNetPnl)} style={{ fontSize: 20, fontWeight: 900 }}>
              {fmt2(monthStats.monthNetPnl)}
            </div>
            <div className="p-muted" style={{ fontSize: 11 }}>
              {monthStats.tradingDays} trading days
            </div>
          </div>

          <div>
            <div className="p-muted" style={{ fontSize: 11 }}>
              Avg Daily PnL
            </div>
            <div className={pnlClass(monthStats.avgDailyPnl)} style={{ fontSize: 20, fontWeight: 900 }}>
              {fmt2(monthStats.avgDailyPnl)}
            </div>
          </div>

          <div>
            <div className="p-muted" style={{ fontSize: 11 }}>
              Win Rate
            </div>
            <div style={{ fontSize: 20, fontWeight: 900 }}>{fmtPercent(monthStats.winRate)}</div>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
          {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => (
            <div key={w} style={{ fontWeight: 800, opacity: 0.8, fontSize: 12 }}>
              {w}
            </div>
          ))}

          {days.map((d) => {
            const key = toDateKey(d);
            const cell = map.get(key);
            const inMonth = d.getUTCMonth() === current.getUTCMonth();
            const clickable = !!cell;

            return (
              <div
                key={key}
                onClick={() => clickable && router.push(`/positions?day=${key}`)}
                style={{
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  padding: 10,
                  minHeight: 78,
                  opacity: inMonth ? 1 : 0.35,
                  cursor: clickable ? "pointer" : "default",
                  background: cell ? heatBg(cell.totalNetProfit ?? 0, maxAbsPnl) : "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <div style={{ fontWeight: 900 }}>{d.getUTCDate()}</div>
                  {clickable ? <div style={{ fontSize: 11, opacity: 0.75 }}>→</div> : null}
                </div>

                <div style={{ fontSize: 12, marginTop: 6 }}>
                  {cell ? (
                    <>
                      <div>
                        PnL:{" "}
                        <span className={pnlClass(cell.totalNetProfit ?? 0)} style={{ fontWeight: 900 }}>
                          {fmt2(cell.totalNetProfit ?? 0)}
                        </span>
                      </div>
                      <div style={{ opacity: 0.9 }}>Positions: {cell.positions ?? 0}</div>
                    </>
                  ) : (
                    <div style={{ opacity: 0.6 }}>—</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily list */}
      <div className="card" style={{ padding: 14 }}>
        <div
          onClick={() => setShowDailyList((s) => !s)}
          style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", userSelect: "none", flexWrap: "wrap" }}
        >
          <h2 style={{ margin: 0 }}>Daily PnL</h2>
          <div className="p-muted">({showDailyList ? "Hide" : "Show"})</div>
          <div style={{ marginLeft: "auto", opacity: 0.6 }}>{showDailyList ? "▲" : "▼"}</div>
        </div>

        {showDailyList && (
          <>
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Click a row to open Positions for that day
            </div>

            <div style={{ marginTop: 10, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    {["Day", "Positions", "Net Profit", "Realized P/L"].map((h) => (
                      <th
                        key={h}
                        style={{
                          textAlign: "left",
                          borderBottom: "1px solid var(--border)",
                          padding: 8,
                          fontSize: 12,
                          color: "var(--muted)",
                          fontWeight: 800,
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {[...byDay]
                    .filter((d: any) => String(d.day ?? "").startsWith(currentMonthKey))
                    .sort((a: any, b: any) => String(b.day).localeCompare(String(a.day)))
                    .map((d: any) => (
                      <tr key={d.day} style={{ cursor: "pointer" }} onClick={() => router.push(`/positions?day=${d.day}`)}>
                        <td style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
                          <b>{d.day}</b>
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>{d.positions ?? "-"}</td>
                        <td style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>
                          <span className={pnlClass(d.totalNetProfit ?? 0)} style={{ fontWeight: 900 }}>
                            {fmt2(d.totalNetProfit ?? 0)}
                          </span>
                        </td>
                        <td style={{ padding: 8, borderBottom: "1px solid var(--border)" }}>{fmt2(d.totalRealizedPnl ?? 0)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button onClick={() => router.push("/positions")} className="btn-secondary">
            Go to Positions
          </button>
          <button onClick={() => router.push("/dashboard")} className="btn-secondary">
            Back to Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}

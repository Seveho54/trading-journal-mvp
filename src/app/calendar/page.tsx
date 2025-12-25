"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTradeSession } from "../providers/TradeSessionProvider";

function fmt(n: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
}

function fmt2(n: number) {
    return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }
  
  function pnlClass(n: number) {
    return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
  }

  function heatBg(pnl: number, maxAbs: number) {
    if (!maxAbs || maxAbs <= 0) return "rgba(255,255,255,0.02)";
  
    const strength = Math.min(1, Math.abs(pnl) / maxAbs); // 0..1
    const alpha = 0.08 + strength * 0.22; // 0.08..0.30
  
    if (pnl > 0) return `rgba(54, 211, 153, ${alpha})`; // grün
    if (pnl < 0) return `rgba(251, 113, 133, ${alpha})`; // rot
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
  
  function endOfMonthUTC(d: Date) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); // letzter Tag
  }
  
  function addDaysUTC(d: Date, days: number) {
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days));
  }
  
  function monthLabelUTC(d: Date) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  }
  

export default function CalendarPage() {
  const router = useRouter();
  const { data } = useTradeSession();

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

  const byDay = (data as any).byDayPositions ?? [];
  const [monthOffset, setMonthOffset] = useState(0);

  const map = new Map<string, any>();
for (const d of byDay) map.set(d.day, d);
const maxAbsPnl = Math.max(1, ...byDay.map((d: any) => Math.abs(d.totalNetProfit ?? 0)));


// aktueller Monat = "heute" + offset
const now = new Date();
const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + monthOffset, 1));

const start = startOfMonthUTC(current);
const end = endOfMonthUTC(current);

// Kalender startet am Montag (0=Mo ... 6=So)
const startWeekday = (start.getUTCDay() + 6) % 7; // So(0)->6, Mo(1)->0
const gridStart = addDaysUTC(start, -startWeekday);

// 6 Wochen Grid (42 Zellen)
const days: Date[] = [];
for (let i = 0; i < 42; i++) days.push(addDaysUTC(gridStart, i));


  if (byDay.length === 0) {
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

  // Best/Worst Tage (nach NetProfit)
  const sorted = [...byDay].sort((a: any, b: any) => (b.totalNetProfit ?? 0) - (a.totalNetProfit ?? 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];

  return (
    <main style={{ maxWidth: 1000, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Calendar</h1>
      <div style={{ opacity: 0.8, marginBottom: 16 }}>
        Session: <b>{data.uploadedFileName}</b>
      </div>

      {/* Best/Worst Highlights */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
          <div style={{ opacity: 0.7 }}>Best Day</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{best.day}</div>
          <div style={{ marginTop: 6 }}>
          Net Profit:{" "}
<span className={pnlClass(best.totalNetProfit)}>{fmt2(best.totalNetProfit)}</span>
          </div>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
          <div style={{ opacity: 0.7 }}>Worst Day</div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{worst.day}</div>
          <div style={{ marginTop: 6 }}>
          Net Profit:{" "}
<span className={pnlClass(worst.totalNetProfit)}>{fmt2(worst.totalNetProfit)}</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10, color: "var(--muted)" }}>
  <div style={{ fontSize: 12, fontWeight: 700 }}>Heatmap:</div>

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
    Scale uses max day |PnL|: <b style={{ color: "var(--text)" }}>{fmt2(maxAbsPnl)}</b>
  </div>
</div>



      <h2 style={{ marginTop: 24 }}>Month View ({monthLabelUTC(current)})</h2>

<div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
  <button onClick={() => setMonthOffset((o) => o - 1)} style={{ padding: "6px 12px" }}>
    Prev Month
  </button>
  <button onClick={() => setMonthOffset(0)} style={{ padding: "6px 12px" }}>
    This Month
  </button>
  <button onClick={() => setMonthOffset((o) => o + 1)} style={{ padding: "6px 12px" }}>
    Next Month
  </button>
</div>

<div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
  {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((w) => (
    <div key={w} style={{ fontWeight: 700, opacity: 0.8 }}>
      {w}
    </div>
  ))}

  {days.map((d) => {
    const key = toDateKey(d);
    const stats = map.get(key);
    const inMonth = d.getUTCMonth() === current.getUTCMonth();

    return (
<div
  key={key}
  onClick={() => router.push(`/trades?day=${key}&sort=pnlAsc`)}
  style={{
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: 10,
    minHeight: 70,
    opacity: inMonth ? 1 : 0.35,
    cursor: "pointer",
    background: stats ? heatBg(stats.totalNetProfit ?? 0, maxAbsPnl) : "rgba(255,255,255,0.02)",
  }}
  
>

        <div style={{ fontWeight: 700 }}>{d.getUTCDate()}</div>
        <div style={{ fontSize: 12, marginTop: 6 }}>
          {stats ? (
            <>
<div>
  PnL:{" "}
  <span className={pnlClass(stats.totalNetProfit)}>
    {fmt2(stats.totalNetProfit)}
  </span>
</div>
<div>Positions: {stats.positions}</div>
            </>
          ) : (
            <div style={{ opacity: 0.6 }}>—</div>
          )}
        </div>
      </div>
    );
  })}
</div>




      <h2>Daily PnL (Liste)</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Day", "Trades", "Net Profit", "Realized P/L"].map((h) => (
              <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {byDay.map((d: any) => (
            <tr key={d.day}>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}><b>{d.day}</b></td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{d.trades}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{fmt(d.totalNetProfit)}</td>
              <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{fmt(d.totalRealizedPnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ marginTop: 20 }}>
        <button onClick={() => router.push("/dashboard")} style={{ padding: "6px 12px" }}>
          Back to Dashboard
        </button>
      </div>
    </main>
  );
}

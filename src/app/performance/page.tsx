"use client";

import { useMemo } from "react";
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
  

export default function PerformancePage() {
  const router = useRouter();
  const { data } = useTradeSession();

  // hooks always
  const positions = useMemo(() => (data?.positions ?? []) as any[], [data]);
  const byMonthPos = useMemo(() => (data as any)?.byMonthPositions ?? [], [data]);
  const bySymbolPos = useMemo(() => (data as any)?.bySymbolPositions ?? [], [data]);

  const summary = useMemo(() => buildTradeSummaryFromPositions(positions), [positions]);

  const byDayPos = useMemo(() => (data as any)?.byDayPositions ?? [], [data]);

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
  
    const bucketRows = Array.from(buckets.values()).sort((a, b) => {
      const order = ["0", "< 1", "1–5", "5–20", "20–50", "50+"];
      return order.indexOf(a.label) - order.indexOf(b.label);
    });
  
    return { winners, losers, breakeven, bucketRows };
  }, [positions]);
  

const dayLabels = useMemo(() => {
  const days = [...byDayPos].sort((a: any, b: any) => String(a.day).localeCompare(String(b.day)));
  return days.map((d: any) => d.day);
}, [byDayPos]);

const equityCurveDaily = useMemo(() => {
  const days = [...byDayPos].sort((a: any, b: any) => String(a.day).localeCompare(String(b.day)));
  let eq = 0;
  return days.map((d: any) => {
    eq += (d.totalNetProfit ?? 0);
    return eq;
  });
}, [byDayPos]);

const risk = useMemo(() => {
    const days = [...((data as any)?.byDayPositions ?? [])].sort((a: any, b: any) =>
      String(a.day).localeCompare(String(b.day))
    );
  
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
  
    // best/worst
    const sortedByPnl = [...days].sort((a: any, b: any) => (b.totalNetProfit ?? 0) - (a.totalNetProfit ?? 0));
    const best = sortedByPnl[0];
    const worst = sortedByPnl[sortedByPnl.length - 1];
  
    // volatility (std dev)
    const mean = avgDay;
    const variance = pnls.reduce((acc, x) => acc + Math.pow(x - mean, 2), 0) / Math.max(1, count - 1);
    const volatility = Math.sqrt(variance);
  
    // sharpe-lite: mean / std (no risk-free, daily)
    const sharpeLite = volatility > 0 ? mean / volatility : 0;
  
    return { count, profitableDays, profitableRate, avgDay, best, worst, volatility, sharpeLite };
  }, [data]);
  


  const equityCurve = useMemo(() => {
    // monthly equity curve from byMonthPositions (sorted)
    const months = [...byMonthPos].sort((a: any, b: any) => String(a.month).localeCompare(String(b.month)));
    let eq = 0;
    return months.map((m: any) => {
      eq += (m.totalNetProfit ?? 0);
      return eq;
    });
  }, [byMonthPos]);

  const monthLabels = useMemo(() => {
    const months = [...byMonthPos].sort((a: any, b: any) => String(a.month).localeCompare(String(b.month)));
    return months.map((m: any) => m.month);
  }, [byMonthPos]);

  const bySymbolTable = useMemo(() => {
    // positions-based symbol analytics kommt schon aus API: data.bySymbolPositions
    const list = ((data as any)?.bySymbolPositions ?? []) as any[];
  
    // sort by totalNetProfit desc
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

  return (
    <main>
      <div className="card" style={{ padding: 18, marginBottom: 12 }}>
        <div className="h1">Performance</div>
        <p className="p-muted">
          Session: <b>{data.uploadedFileName}</b> · Positions: <b>{positions.length}</b>
        </p>
      </div>

      {/* 1) TRADE SUMMARY */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Trade Summary (Positions)</div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Net PnL</div>
            <div className={pnlClass(summary.totalNetProfit)} style={{ fontSize: 22, fontWeight: 900 }}>
              {fmt2(summary.totalNetProfit)}
            </div>
            <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
              Expectancy: <b style={{ color: "var(--text)" }}>{fmt2(summary.expectancy)}</b> / position
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Winrate</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtPercent(summary.winRate)}</div>
            <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
              Wins: <b style={{ color: "var(--text)" }}>{summary.wins}</b> · Losses:{" "}
              <b style={{ color: "var(--text)" }}>{summary.losses}</b>
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Profit Factor</div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>
              {Number.isFinite(summary.profitFactor) ? summary.profitFactor.toFixed(2) : "∞"}
            </div>
            <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
              Gross Profit: <span className={pnlClass(summary.grossProfit)}>{fmt2(summary.grossProfit)}</span> · Gross
              Loss: <span className={pnlClass(summary.grossLoss)}>{fmt2(summary.grossLoss)}</span>
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Max Drawdown</div>
            <div className={pnlClass(summary.maxDrawdown)} style={{ fontSize: 22, fontWeight: 900 }}>
              {fmt2(summary.maxDrawdown)}
            </div>
            <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
              Max Win Streak: <b style={{ color: "var(--text)" }}>{summary.maxWinStreak}</b> · Max Loss Streak:{" "}
              <b style={{ color: "var(--text)" }}>{summary.maxLossStreak}</b>
            </div>
          </div>
        </div>

        {/* best / worst */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginTop: 12 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Best Position</div>
            {summary.bestPosition ? (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontWeight: 900 }}>{summary.bestPosition.symbol}</div>
                <div className={pnlClass(summary.bestPosition.netProfit)} style={{ fontWeight: 900 }}>
                  {fmt2(summary.bestPosition.netProfit)}
                </div>
                <button
                  className="btn-secondary"
                  style={{ marginTop: 10 }}
                  onClick={() => router.push(`/positions/${summary.bestPosition!.id}`)}
                >
                  View
                </button>
              </div>
            ) : (
              <div className="p-muted">–</div>
            )}
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Worst Position</div>
            {summary.worstPosition ? (
              <div style={{ marginTop: 6 }}>
                <div style={{ fontWeight: 900 }}>{summary.worstPosition.symbol}</div>
                <div className={pnlClass(summary.worstPosition.netProfit)} style={{ fontWeight: 900 }}>
                  {fmt2(summary.worstPosition.netProfit)}
                </div>
                <button
                  className="btn-secondary"
                  style={{ marginTop: 10 }}
                  onClick={() => router.push(`/positions/${summary.worstPosition!.id}`)}
                >
                  View
                </button>
              </div>
            ) : (
              <div className="p-muted">–</div>
            )}
          </div>
        </div>
      </div>

      {/* 2) PERFORMANCE HISTORY */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Performance History</div>

        {byMonthPos.length === 0 ? (
          <div className="p-muted">Noch keine Monatsdaten. Bitte CSV neu hochladen.</div>
        ) : (
          <>
            <div style={{ marginBottom: 10 }}>
              <Sparkline values={equityCurve} labels={monthLabels} />
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Month", "Positions", "Winrate", "Net PnL"].map((h) => (
                    <th
                      key={h}
                      style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...byMonthPos]
                  .sort((a: any, b: any) => String(a.month).localeCompare(String(b.month)))
                  .map((m: any) => (
                    <tr key={m.month} style={{ cursor: "pointer" }} onClick={() => router.push(`/positions?day=${m.month}-01`)}>
                      <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <b>{m.month}</b>
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{m.positions}</td>
                      <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        {fmtPercent(m.winRate ?? 0)}
                      </td>
                      <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                        <span className={pnlClass(m.totalNetProfit ?? 0)}>{fmt2(m.totalNetProfit ?? 0)}</span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* 2b) DAILY PERFORMANCE HISTORY */}
<div className="card" style={{ padding: 16, marginBottom: 12 }}>
  <div style={{ fontWeight: 900, marginBottom: 10 }}>Daily Performance (Positions)</div>

  {byDayPos.length === 0 ? (
    <div className="p-muted">Noch keine Tagesdaten. Bitte CSV neu hochladen.</div>
  ) : (
    <>
      <div style={{ marginBottom: 10 }}>
        <Sparkline values={equityCurveDaily} labels={dayLabels} />
      </div>

      <div style={{ maxHeight: 360, overflow: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["Day", "Positions", "Winrate", "Net PnL"].map((h) => (
                <th key={h} style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...byDayPos]
              .sort((a: any, b: any) => String(b.day).localeCompare(String(a.day))) // newest first
              .map((d: any) => (
                <tr
                  key={d.day}
                  style={{ cursor: "pointer" }}
                  onClick={() => router.push(`/positions?day=${d.day}`)}
                >
                  <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <b>{d.day}</b>
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{d.positions}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {fmtPercent(d.winRate ?? 0)}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <span className={pnlClass(d.totalNetProfit ?? 0)}>{fmt2(d.totalNetProfit ?? 0)}</span>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      <div className="p-muted" style={{ marginTop: 10 }}>
        Tip: Click a day → opens Positions filtered for that day.
      </div>
    </>
  )}
</div>

{/* 5) RISK ANALYTICS (MVP) */}
<div className="card" style={{ padding: 16, marginBottom: 12 }}>
  <div style={{ fontWeight: 900, marginBottom: 10 }}>Risk Analytics (Daily, Positions)</div>

  {risk.count === 0 ? (
    <div className="p-muted">Noch keine Tagesdaten vorhanden.</div>
  ) : (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>% Profitable Days</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtPercent(risk.profitableRate)}</div>
          <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
            {risk.profitableDays} / {risk.count} days
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Avg Day PnL</div>
          <div className={pnlClass(risk.avgDay)} style={{ fontSize: 22, fontWeight: 900 }}>
            {fmt2(risk.avgDay)}
          </div>
          <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
            Mean of daily net PnL
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Volatility (Daily σ)</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{fmt2(risk.volatility)}</div>
          <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
            Sharpe-lite: <b style={{ color: "var(--text)" }}>{risk.sharpeLite.toFixed(2)}</b>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Best Day</div>
          <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>{risk.best?.day ?? "-"}</div>
          <div style={{ marginTop: 6 }}>
            <span className={pnlClass(risk.best?.totalNetProfit ?? 0)}>{fmt2(risk.best?.totalNetProfit ?? 0)}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn-secondary" onClick={() => router.push(`/positions?day=${risk.best.day}`)}>
              View positions
            </button>
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Worst Day</div>
          <div style={{ fontSize: 16, fontWeight: 900, marginTop: 6 }}>{risk.worst?.day ?? "-"}</div>
          <div style={{ marginTop: 6 }}>
            <span className={pnlClass(risk.worst?.totalNetProfit ?? 0)}>{fmt2(risk.worst?.totalNetProfit ?? 0)}</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn-secondary" onClick={() => router.push(`/positions?day=${risk.worst.day}`)}>
              View positions
            </button>
          </div>
        </div>
      </div>

      <div className="p-muted" style={{ marginTop: 10 }}>
        Sharpe-lite ist nur eine grobe Orientierung (Mean/Std). Kein Risk-free, kein Annualizing.
      </div>
    </>
  )}
</div>

{/* 6) TICKER ANALYTICS (POSITIONS) */}
<div className="card" style={{ padding: 16, marginBottom: 12 }}>
  <div style={{ fontWeight: 900, marginBottom: 10 }}>Ticker Analytics (Positions)</div>

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
          {bySymbolTable.slice(0, 20).map((s: any) => (
            <tr
              key={s.symbol}
              style={{ cursor: "pointer" }}
              onClick={() => router.push(`/positions?symbol=${encodeURIComponent(s.symbol)}`)}
            >
              <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                <b>{s.symbol}</b>
              </td>
              <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>{s.positions ?? "-"}</td>
              <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                {fmtPercent(s.winRate ?? 0)}
              </td>
              <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                <span className={pnlClass(s.totalNetProfit ?? 0)}>{fmt2(s.totalNetProfit ?? 0)}</span>
              </td>
              <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                {Number.isFinite(s.profitFactor) ? s.profitFactor.toFixed(2) : "∞"}
              </td>
              <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                <span className={pnlClass(s.avgWin ?? 0)}>{fmt2(s.avgWin ?? 0)}</span>
              </td>
              <td style={{ padding: 10, borderBottom: "1px solid var(--border)" }}>
                <span className={pnlClass(s.avgLoss ?? 0)}>{fmt2(s.avgLoss ?? 0)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )}

  <div className="p-muted" style={{ marginTop: 10 }}>
    Tipp: Klick auf ein Symbol → Positions-Log gefiltert.
  </div>
</div>




      {/* 3) TICKER ANALYTICS */}
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Ticker Analytics (Positions)</div>

        {bySymbolPos.length === 0 ? (
          <div className="p-muted">Noch keine Symboldaten. Bitte CSV neu hochladen.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Symbol", "Positions", "Winrate", "Net PnL"].map((h) => (
                  <th key={h} style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...bySymbolPos]
                .slice(0, 15)
                .map((s: any) => (
                  <tr key={s.symbol} style={{ cursor: "pointer" }} onClick={() => router.push(`/positions?query=${s.symbol}`)}>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <b>{s.symbol}</b>
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{s.positions}</td>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      {fmtPercent(s.winRate ?? 0)}
                    </td>
                    <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                      <span className={pnlClass(s.totalNetProfit ?? 0)}>{fmt2(s.totalNetProfit ?? 0)}</span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 4) DISTRIBUTION */}
<div className="card" style={{ padding: 16, marginBottom: 12 }}>
  <div style={{ fontWeight: 900, marginBottom: 10 }}>Distribution</div>

  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 12 }}>
    <div className="card" style={{ padding: 14 }}>
      <div style={{ color: "var(--muted)", fontSize: 12 }}>Winners</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{dist.winners}</div>
    </div>
    <div className="card" style={{ padding: 14 }}>
      <div style={{ color: "var(--muted)", fontSize: 12 }}>Losers</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{dist.losers}</div>
    </div>
    <div className="card" style={{ padding: 14 }}>
      <div style={{ color: "var(--muted)", fontSize: 12 }}>Breakeven</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{dist.breakeven}</div>
    </div>
  </div>

  <table style={{ width: "100%", borderCollapse: "collapse" }}>
    <thead>
      <tr>
        {["Bucket (|PnL|)", "Positions", "Net PnL sum"].map((h) => (
          <th key={h} style={{ textAlign: "left", borderBottom: "1px solid var(--border)", padding: 8 }}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {dist.bucketRows.map((b) => (
        <tr key={b.label}>
          <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <b>{b.label}</b>
          </td>
          <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{b.count}</td>
          <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <span className={pnlClass(b.net)}>{fmt2(b.net)}</span>
          </td>
        </tr>
      ))}
    </tbody>
  </table>

  <div className="p-muted" style={{ marginTop: 10 }}>
    Purpose: See whether you make money with many small wins or few big wins (and how losses cluster).
  </div>
</div>


      {/* Actions */}
      <div className="card" style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => router.push("/dashboard")}>Back to Dashboard</button>
        <button onClick={() => router.push("/positions")}>Go to Positions</button>
        <button onClick={() => router.push("/calendar")}>Go to Calendar</button>
      </div>
    </main>
  );
}

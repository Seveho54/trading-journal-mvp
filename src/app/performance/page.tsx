"use client";

import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { Sparkline } from "../components/Sparkline";

function fmt2(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

export default function PerformancePage() {
  const router = useRouter();
  const { data } = useTradeSession();

  if (!data) {
    return (
      <main>
        <div className="card" style={{ padding: 18 }}>
          <div className="h1">Performance</div>
          <p className="p-muted">Keine Daten geladen. Bitte zuerst eine CSV hochladen.</p>
          <div style={{ marginTop: 14 }}>
            <button onClick={() => router.push("/upload")} className="btn-primary">
              Go to Upload
            </button>
          </div>
        </div>
      </main>
    );
  }

  const byMonth = (data as any).byMonth ?? [];
  const totalNetProfit = (data.summary?.totalNetProfit ?? 0) as number;

  const bestMonth = byMonth.length
    ? [...byMonth].sort((a: any, b: any) => (b.totalNetProfit ?? 0) - (a.totalNetProfit ?? 0))[0]
    : null;

  const worstMonth = byMonth.length
    ? [...byMonth].sort((a: any, b: any) => (a.totalNetProfit ?? 0) - (b.totalNetProfit ?? 0))[0]
    : null;

  // vereinfachter Drawdown aus kumulierter Monats-PnL
  let peak = 0;
  let equity = 0;
  let maxDrawdown = 0;
  for (const m of byMonth) {
    equity += m.totalNetProfit ?? 0;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak); // negativ
  }

  // Equity Curve
  let eq = 0;
  const equityCurve = byMonth.map((m: any) => {
    eq += m.totalNetProfit ?? 0;
    return eq;
  });
  const monthLabels = byMonth.map((m: any) => m.month);

  return (
    <main>
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div className="h1">Performance</div>
        <p className="p-muted">
          Session: <b>{data.uploadedFileName}</b>
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ opacity: 0.7 }}>Total Net Profit</div>
          <div className={pnlClass(totalNetProfit)} style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>
            {fmt2(totalNetProfit)}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ opacity: 0.7 }}>Max Drawdown (monthly)</div>
          <div className={pnlClass(maxDrawdown)} style={{ fontSize: 22, fontWeight: 900, marginTop: 6 }}>
            {fmt2(maxDrawdown)}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ opacity: 0.7 }}>Best / Worst Month</div>
          <div style={{ marginTop: 10, lineHeight: 1.5 }}>
            <div>
              Best: <b>{bestMonth?.month ?? "-"}</b>{" "}
              {bestMonth ? <span className={pnlClass(bestMonth.totalNetProfit)}>{fmt2(bestMonth.totalNetProfit)}</span> : "-"}
            </div>
            <div>
              Worst: <b>{worstMonth?.month ?? "-"}</b>{" "}
              {worstMonth ? (
                <span className={pnlClass(worstMonth.totalNetProfit)}>{fmt2(worstMonth.totalNetProfit)}</span>
              ) : (
                "-"
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Equity Curve (monthly)</div>
        <Sparkline values={equityCurve} labels={monthLabels} />
      </div>

      {/* Monthly Table */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Monthly PnL</div>

        {byMonth.length === 0 ? (
          <div style={{ opacity: 0.8 }}>Noch keine Monatsdaten vorhanden. (Upload neu ausführen)</div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                {["Month", "Trades", "Winrate", "Net Profit", "Realized P/L", "Notional"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byMonth.map((m: any) => (
                <tr key={m.month}>
                  <td>
                    <b>{m.month}</b>
                  </td>
                  <td>{m.trades}</td>
                  <td>
                    {new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(m.winRate)}
                  </td>
                  <td>
                    <span className={pnlClass(m.totalNetProfit)}>{fmt2(m.totalNetProfit)}</span>
                  </td>
                  <td>
                    <span className={pnlClass(m.totalRealizedPnl)}>{fmt2(m.totalRealizedPnl)}</span>
                  </td>
                  <td>{fmt2(m.totalNotional)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 14 }}>
          <button onClick={() => router.push("/dashboard")} className="btn-secondary">
            Back to Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}

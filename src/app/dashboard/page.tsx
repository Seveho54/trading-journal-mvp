"use client";

import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";

function fmt(n: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
}

export default function DashboardPage() {
  const router = useRouter();
  const { data } = useTradeSession();

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

  const summary = data.summary;
  const bySymbol = data.bySymbol ?? [];
  const best = bySymbol.length ? bySymbol[0] : null;
  const worst = bySymbol.length ? bySymbol[bySymbol.length - 1] : null;

  return (
    <main>
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div className="h1">Dashboard</div>
        <p className="p-muted">
          Session: <b>{data.uploadedFileName}</b> · Rows: <b>{data.rowsParsed}</b>
        </p>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Executed Trades</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{summary.executed}</div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Total Net Profit</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{fmt(summary.totalNetProfit)}</div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Symbols</div>
            <div style={{ fontSize: 26, fontWeight: 900 }}>{summary.symbols}</div>
          </div>
        </div>
      )}

      {/* Winner/Loser */}
      {best && worst && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 14 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Top Winner</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>{best.symbol}</div>
            <div style={{ marginTop: 8, color: "var(--muted)" }}>
            Net Profit:{" "}
<span className={best.totalNetProfit > 0 ? "pnl-positive" : best.totalNetProfit < 0 ? "pnl-negative" : "pnl-zero"}>
  {fmt(best.totalNetProfit)}
</span>
              <b style={{ color: "var(--text)" }}>{best.trades}</b>
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Worst Loser</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>{worst.symbol}</div>
            <div style={{ marginTop: 8, color: "var(--muted)" }}>
            Net Profit:{" "}
<span className={worst.totalNetProfit > 0 ? "pnl-positive" : worst.totalNetProfit < 0 ? "pnl-negative" : "pnl-zero"}>
  {fmt(worst.totalNetProfit)}
</span>
              <b style={{ color: "var(--text)" }}>{worst.trades}</b>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="card" style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => router.push("/trades")}>Go to Trade Log</button>
        <button onClick={() => router.push("/performance")}>Go to Performance</button>
        <button onClick={() => router.push("/calendar")}>Go to Calendar</button>
        <button onClick={() => router.push("/upload")}>Upload another file</button>
      </div>
    </main>
  );
}

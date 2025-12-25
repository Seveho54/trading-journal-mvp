"use client";

import { useState } from "react";
import { TradesTable } from "./TradesTable";

type ApiResult =
  | { status: number; body: string }
  | null;

function fmt(n: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
}

export default function TestUpload() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ApiResult>(null);
  const [loading, setLoading] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string>("ALL");
  const [page, setPage] = useState(1);
const pageSize = 10;
const [sortKey, setSortKey] = useState<"timeDesc" | "timeAsc" | "pnlDesc" | "pnlAsc">("timeDesc");




  // parsed JSON (wenn möglich)
  let json: any = null;
  try {
    json = result?.body ? JSON.parse(result.body) : null;
  } catch {
    json = null;
  }

  async function upload() {
    if (!file) return;

    setLoading(true);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/api/parse", { method: "POST", body: fd });
    const text = await res.text();

    setResult({ status: res.status, body: text });
    setLoading(false);
  }

  const summary = json?.summary;
  const bySymbol = json?.bySymbol ?? [];
const best = bySymbol.length ? bySymbol[0] : null;                 // bySymbol ist nach Profit sortiert
const worst = bySymbol.length ? bySymbol[bySymbol.length - 1] : null;
const previewTrades = json?.previewTrades ?? [];
const symbols = (json?.bySymbol ?? []).map((s: any) => s.symbol);

const filteredTrades =
  selectedSymbol === "ALL" ? previewTrades : previewTrades.filter((t: any) => t.symbol === selectedSymbol);

  
  const sortedTrades = [...filteredTrades].sort((a: any, b: any) => {
    if (sortKey === "timeDesc") return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    if (sortKey === "timeAsc") return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();

    const ap = a.netProfit ?? 0;
    const bp = b.netProfit ?? 0;

    if (sortKey === "pnlDesc") return bp - ap;
    return ap - bp; // pnlAsc
  });

  const totalPages = Math.max(1, Math.ceil(sortedTrades.length / pageSize));
  const start = (page - 1) * pageSize;
  const pageTrades = sortedTrades.slice(start, start + pageSize);

  

  return (
    <main style={{ maxWidth: 1000, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Test Upload</h1>

      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16 }}>
        <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <button onClick={upload} disabled={!file || loading} style={{ padding: "6px 12px" }}>
          {loading ? "Uploading..." : "Upload & Analyze"}
        </button>
        {result && <span>Status: <b>{result.status}</b></span>}
      </div>

      {symbols.length > 0 && (
  <div style={{ marginBottom: 16 }}>
    <label style={{ marginRight: 8 }}><b>Symbol Filter:</b></label>
    <select value={selectedSymbol} onChange={(e) => {
  setSelectedSymbol(e.target.value);
  setPage(1);
}}>
      <option value="ALL">ALL</option>
      {symbols.map((s: string) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  </div>
)}

<div style={{ marginBottom: 16 }}>
  <label style={{ marginRight: 8 }}><b>Sort:</b></label>
  <select
    value={sortKey}
    onChange={(e) => {
      setSortKey(e.target.value as any);
      setPage(1);
    }}
  >
    <option value="timeDesc">Timestamp (newest first)</option>
    <option value="timeAsc">Timestamp (oldest first)</option>
    <option value="pnlDesc">Net Profit (high → low)</option>
    <option value="pnlAsc">Net Profit (low → high)</option>
  </select>
</div>



      {/* Summary Cards */}
      {summary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <div style={{ opacity: 0.7 }}>Executed Trades</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.executed}</div>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <div style={{ opacity: 0.7 }}>Total Net Profit</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(summary.totalNetProfit)}</div>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <div style={{ opacity: 0.7 }}>Symbols</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{summary.symbols}</div>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <div style={{ opacity: 0.7 }}>Total Notional</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(summary.totalNotional)}</div>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <div style={{ opacity: 0.7 }}>Total Realized P/L</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{fmt(summary.totalRealizedPnl)}</div>
          </div>

          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <div style={{ opacity: 0.7 }}>Zeitraum</div>
            <div style={{ fontSize: 14 }}>
              <div><b>From:</b> {summary.from}</div>
              <div><b>To:</b> {summary.to}</div>
            </div>
          </div>
        </div>
      )}

      {/* Kleine Vorschau-Tabelle */}
      {sortedTrades.length > 0 && (

        <>
          <h2 style={{ marginTop: 10 }}>Preview (erste 50 Trades)</h2>
<TradesTable trades={pageTrades} />


<div style={{ display: "flex", gap: 12, alignItems: "center", margin: "10px 0" }}>
  <button
    onClick={() => setPage((p) => Math.max(1, p - 1))}
    disabled={page <= 1}
    style={{ padding: "6px 12px" }}
  >
    Prev
  </button>

  <div>
    Page <b>{page}</b> / <b>{totalPages}</b> (Rows: {filteredTrades.length})
  </div>

  <button
    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
    disabled={page >= totalPages}
    style={{ padding: "6px 12px" }}
  >
    Next
  </button>
</div>


        </>
      )}

      {/* Fallback: falls JSON nicht parsebar ist */}
      {result && !json && (
        <pre style={{ marginTop: 16, background: "#111", color: "#0f0", padding: 12, overflow: "auto" }}>
          {result.body}
        </pre>
      )}

{json?.bySymbol && json.bySymbol.length > 0 && (
  <>
    <h2 style={{ marginTop: 24 }}>Ticker Analytics (Top 10 nach Net Profit)</h2>

    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["Symbol", "Trades", "Winrate", "Net Profit", "Realized P/L", "Notional"].map((h) => (
            <th key={h} style={{ textAlign: "left", borderBottom: "1px solid #ddd", padding: 8 }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>

      <tbody>
        {json.bySymbol.slice(0, 10).map((s: any) => (
          <tr key={s.symbol}>
            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}><b>{s.symbol}</b></td>
            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{s.trades}</td>
            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
              {new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(s.winRate)}
            </td>
            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{fmt(s.totalNetProfit)}</td>
            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{fmt(s.totalRealizedPnl)}</td>
            <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>{fmt(s.totalNotional)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </>
)}

{/* Best/Worst Highlights */}
{best && worst && (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 16 }}>
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
      <div style={{ opacity: 0.7 }}>Top Winner</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{best.symbol}</div>
      <div style={{ marginTop: 6 }}>
        Net Profit: <b>{fmt(best.totalNetProfit)}</b> · Winrate:{" "}
        <b>{new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(best.winRate)}</b> · Trades: <b>{best.trades}</b>
      </div>
    </div>

    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
      <div style={{ opacity: 0.7 }}>Worst Loser</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{worst.symbol}</div>
      <div style={{ marginTop: 6 }}>
        Net Profit: <b>{fmt(worst.totalNetProfit)}</b> · Winrate:{" "}
        <b>{new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(worst.winRate)}</b> · Trades: <b>{worst.trades}</b>
      </div>
    </div>
  </div>
)}



    </main>
  );
}



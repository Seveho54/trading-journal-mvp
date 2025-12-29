"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { TradesTable } from "../test-upload/TradesTable";
import { TradeDetailsModal } from "../components/TradeDetailsModal";
import { fmtMoney, fmtQty, fmtPrice, fmtDateTime, asCurrency, DEFAULT_CCY } from "@/lib/format";


const FREE_TRADES_LIMIT = 200;

type QuickFilter = "ALL" | "WINNERS" | "LOSERS" | "OPEN" | "CLOSE" | "LONG" | "SHORT";
type SortKey = "timeDesc" | "timeAsc" | "pnlDesc" | "pnlAsc";

function fmt2(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

function csvEscape(v: any) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCSV(rows: Record<string, any>[]) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(","), ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(","))];
  return lines.join("\n");
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeNum(x: any) {
  return typeof x === "number" && Number.isFinite(x) ? x : null;
}

export default function TradesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const dayParam = searchParams.get("day"); // YYYY-MM-DD
  const sortParam = searchParams.get("sort") as SortKey | null;

  const { data, isPro } = useTradeSession();
  const sessionCcy = asCurrency((data as any)?.summary?.currency ?? DEFAULT_CCY);


  // ✅ State (always)
  const [quick, setQuick] = useState<QuickFilter>("ALL");
  const [selectedSymbol, setSelectedSymbol] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>(sortParam ?? "timeDesc");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [selectedTrade, setSelectedTrade] = useState<any | null>(null);

  // ✅ Guarded data
  const trades = useMemo(() => (data?.trades ?? []) as any[], [data]);
  const symbols = useMemo(() => (data?.bySymbol ?? []).map((s: any) => s.symbol) as string[], [data]);

  // ✅ Filter
  const filteredTrades = useMemo(() => {
    let base = trades;

    if (dayParam) base = base.filter((t: any) => String(t.timestamp ?? "").startsWith(dayParam));
    if (selectedSymbol !== "ALL") base = base.filter((t: any) => t.symbol === selectedSymbol);

    if (quick === "WINNERS") base = base.filter((t: any) => (t.netProfit ?? 0) > 0);
    if (quick === "LOSERS") base = base.filter((t: any) => (t.netProfit ?? 0) < 0);
    if (quick === "OPEN") base = base.filter((t: any) => String(t.action ?? "").toUpperCase() === "OPEN");
    if (quick === "CLOSE") base = base.filter((t: any) => String(t.action ?? "").toUpperCase() === "CLOSE");
    if (quick === "LONG") base = base.filter((t: any) => String(t.positionSide ?? "").toUpperCase() === "LONG");
    if (quick === "SHORT") base = base.filter((t: any) => String(t.positionSide ?? "").toUpperCase() === "SHORT");

    const q = query.trim().toLowerCase();
    if (!q) return base;

    return base.filter((t: any) => {
      const id = String(t.id ?? "").toLowerCase();
      const symbol = String(t.symbol ?? "").toLowerCase();
      const action = String(t.action ?? "").toLowerCase();
      const side = String(t.positionSide ?? "").toLowerCase();
      const dirRaw = String(t.raw?.Direction ?? "").toLowerCase();
      return id.includes(q) || symbol.includes(q) || action.includes(q) || side.includes(q) || dirRaw.includes(q);
    });
  }, [trades, dayParam, selectedSymbol, quick, query]);

  // ✅ Sort
  const sortedTrades = useMemo(() => {
    const list = [...filteredTrades];
    return list.sort((a: any, b: any) => {
      if (sortKey === "timeDesc") return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (sortKey === "timeAsc") return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();

      const ap = a.netProfit ?? 0;
      const bp = b.netProfit ?? 0;
      if (sortKey === "pnlDesc") return bp - ap;
      return ap - bp;
    });
  }, [filteredTrades, sortKey]);

  // ✅ Pro limit (after sorting)
  const limitedTrades = useMemo(() => {
    return isPro ? sortedTrades : sortedTrades.slice(0, FREE_TRADES_LIMIT);
  }, [sortedTrades, isPro]);

  // ✅ KPIs (based on current view: filtered+sorted+limited)
  const kpis = useMemo(() => {
    const netVals = limitedTrades
      .map((t: any) => safeNum(t.netProfit))
      .filter((x: any) => x !== null) as number[];

    const count = limitedTrades.length;
    const netCount = netVals.length;

    const sumNet = netVals.reduce((a, b) => a + b, 0);
    const avgNet = netCount ? sumNet / netCount : 0;

    const wins = netVals.filter((n) => n > 0).length;
    const losses = netVals.filter((n) => n < 0).length;
    const winRate = netCount ? wins / netCount : 0;

    return { count, sumNet, avgNet, wins, losses, winRate, netCount };
  }, [limitedTrades]);

  // ✅ Pagination
  const totalPages = useMemo(() => Math.max(1, Math.ceil(limitedTrades.length / pageSize)), [limitedTrades.length]);
  const pageTrades = useMemo(() => {
    const start = (page - 1) * pageSize;
    return limitedTrades.slice(start, start + pageSize);
  }, [limitedTrades, page]);

  // ✅ Reset page on filter changes
  useEffect(() => setPage(1), [dayParam, selectedSymbol, quick, query, sortKey]);

  // ✅ Clamp page when list shrinks
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  function exportTradesCSV() {
    if (!isPro) {
      router.push("/pricing");
      return;
    }

    const rows = limitedTrades.map((t: any) => ({
      id: t.id ?? "",
      timestamp: t.timestamp ?? "",
      symbol: t.symbol ?? "",
      action: t.action ?? "",
      positionSide: t.positionSide ?? "",
      quantity: t.quantity ?? "",
      price: t.price ?? "",
      netProfit: t.netProfit ?? "",
      realizedPnl: t.realizedPnl ?? "",
      status: t.status ?? "",
    }));

    const csv = toCSV(rows);
    const suffix = dayParam ? `-${dayParam}` : "";
    downloadTextFile(`trades${suffix}.csv`, csv);
  }

  // ✅ After hooks: early render
  if (!data) {
    return (
      <main style={{ maxWidth: 900, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
        <h1>Trade Log</h1>
        <p>Keine Daten geladen. Bitte zuerst eine CSV hochladen.</p>
        <button onClick={() => router.push("/upload")} style={{ padding: "6px 12px" }}>
          Go to Upload
        </button>
      </main>
    );
  }

  const hitsFreeLimit = !isPro && sortedTrades.length > FREE_TRADES_LIMIT;

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      {/* Header */}
      <div className="card" style={{ padding: 18, marginBottom: 12 }}>
        <div className="h1">Trade Log</div>
        <div className="p-muted">
          Session: <b>{data.uploadedFileName}</b>
          {hitsFreeLimit ? (
            <>
              {" "}
              · <span style={{ color: "var(--muted)" }}>FREE limit: showing first {FREE_TRADES_LIMIT}</span>
            </>
          ) : null}
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        {/* Quick filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(
              [
                ["ALL", "All"],
                ["WINNERS", "Winners"],
                ["LOSERS", "Losers"],
                ["OPEN", "OPEN"],
                ["CLOSE", "CLOSE"],
                ["LONG", "LONG"],
                ["SHORT", "SHORT"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                className={quick === k ? "btn-primary" : "btn-secondary"}
                onClick={() => setQuick(k)}
                style={{ padding: "6px 10px" }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={exportTradesCSV} className="btn-secondary" title={!isPro ? "Pro feature" : ""}>
              {isPro ? "Export CSV" : "🔒 Export CSV (PRO)"}
            </button>

            <button onClick={() => router.push("/dashboard")} className="btn-secondary">
              Back
            </button>
          </div>
        </div>

        {/* Inputs */}
        <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          {symbols.length > 0 && (
            <div>
              <label style={{ marginRight: 8 }}>
                <b>Symbol:</b>
              </label>
              <select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}>
                <option value="ALL">ALL</option>
                {symbols.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={{ marginRight: 8 }}>
              <b>Search:</b>
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Order ID, symbol, direction…"
              style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 10 }}
            />
          </div>

          <div>
            <label style={{ marginRight: 8 }}>
              <b>Sort:</b>
            </label>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="timeDesc">Timestamp (newest)</option>
              <option value="timeAsc">Timestamp (oldest)</option>
              <option value="pnlDesc">Net Profit (high → low)</option>
              <option value="pnlAsc">Net Profit (low → high)</option>
            </select>
          </div>

          {dayParam ? (
            <div style={{ display: "flex", gap: 10, alignItems: "center", opacity: 0.9 }}>
              <div>
                Day: <b>{dayParam}</b>
              </div>
              <button onClick={() => router.push("/trades")} className="btn-secondary">
                Clear
              </button>
            </div>
          ) : null}

          <div style={{ marginLeft: "auto", opacity: 0.8 }}>
            Rows: <b>{limitedTrades.length}</b>
          </div>
        </div>
      </div>

      {/* KPI Bar */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div className="p-muted" style={{ fontSize: 11 }}>
              Trades
            </div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{kpis.count}</div>
          </div>

          <div>
            <div className="p-muted" style={{ fontSize: 11 }}>
              Net PnL (sum)
            </div>
            <div className={pnlClass(kpis.sumNet)} style={{ fontWeight: 900, fontSize: 18 }}>
  {fmtMoney(kpis.sumNet, sessionCcy)}
</div>
          </div>

          <div>
            <div className="p-muted" style={{ fontSize: 11 }}>
              Avg Net / trade
            </div>
            <div className={pnlClass(kpis.avgNet)} style={{ fontWeight: 900, fontSize: 18 }}>
  {fmtMoney(kpis.avgNet, sessionCcy)}
</div>
          </div>

          <div>
            <div className="p-muted" style={{ fontSize: 11 }}>
              Winrate
            </div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {kpis.netCount ? `${Math.round(kpis.winRate * 100)}%` : "–"}
              <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 8 }}>
                ({kpis.wins}W / {kpis.losses}L)
              </span>
            </div>
          </div>

          <div style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12 }}>
            (based on current filter)
          </div>
        </div>
      </div>

      {/* Table */}
      {pageTrades.length > 0 ? (
        <>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ maxHeight: "65vh", overflow: "auto", borderRadius: 12 }}>
            <TradesTable
  trades={pageTrades}
  onRowClick={(t) => setSelectedTrade(t)}
  selectedId={selectedTrade?.id}
  ccy={sessionCcy}
/>

            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={{ padding: "6px 12px" }}
              >
                Prev
              </button>

              <div>
                Page <b>{page}</b> / <b>{totalPages}</b>
              </div>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={{ padding: "6px 12px" }}
              >
                Next
              </button>
            </div>
          </div>

          <TradeDetailsModal
            open={!!selectedTrade}
            onClose={() => setSelectedTrade(null)}
            title={selectedTrade ? `${selectedTrade.symbol} • ${selectedTrade.id ?? ""}` : "Trade Details"}
            trade={selectedTrade ?? undefined}
          >
            {selectedTrade && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
  <b>Timestamp:</b> {fmtDateTime(selectedTrade.timestamp)}
</div>
<div>
  <b>Qty:</b> {fmtQty(selectedTrade.quantity)}
</div>
<div>
  <b>Price:</b> {fmtPrice(selectedTrade.price, 6)}
</div>
<div>
  <b>Net Profit:</b>{" "}
  {selectedTrade.netProfit === undefined ? (
    "-"
  ) : (
    <span className={pnlClass(selectedTrade.netProfit)} style={{ fontWeight: 900 }}>
      {fmtMoney(selectedTrade.netProfit, sessionCcy)}
    </span>
  )}
</div>

                </div>

                <h3 style={{ marginTop: 16 }}>Raw</h3>
                <pre
                  style={{
                    background: "rgba(0,0,0,0.55)",
                    padding: 12,
                    overflow: "auto",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    color: "var(--text)",
                  }}
                >
                  {JSON.stringify(selectedTrade.raw ?? selectedTrade, null, 2)}
                </pre>
              </>
            )}
          </TradeDetailsModal>
        </>
      ) : (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900 }}>No trades for this filter</div>
          <div className="p-muted" style={{ marginTop: 6 }}>
            Try another filter or clear it.
          </div>
        </div>
      )}
    </main>
  );
}

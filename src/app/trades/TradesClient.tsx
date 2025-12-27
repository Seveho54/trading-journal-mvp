"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { TradesTable } from "../test-upload/TradesTable";
import { TradeDetailsModal } from "../components/TradeDetailsModal";

const FREE_TRADES_LIMIT = 200;

type QuickFilter =
  | "ALL"
  | "WINNERS"
  | "LOSERS"
  | "OPEN"
  | "CLOSE"
  | "LONG"
  | "SHORT";

function fmt2(n: number) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

function csvEscape(v: any) {
  const s = String(v ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
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

export default function TradesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const dayParam = searchParams.get("day"); // "YYYY-MM-DD"
  const sortParam = searchParams.get("sort"); // "pnlAsc" | ...

  const { data, isPro } = useTradeSession();

  // ✅ Hooks/state ALWAYS run
  const [selectedSymbol, setSelectedSymbol] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<"timeDesc" | "timeAsc" | "pnlDesc" | "pnlAsc">(
    (sortParam as any) || "timeDesc"
  );
  const [page, setPage] = useState(1);
  const pageSize = 20;

  const [selectedTrade, setSelectedTrade] = useState<any | null>(null);
  const [query, setQuery] = useState("");
  const [quick, setQuick] = useState<QuickFilter>("ALL");

  // ✅ guarded
  const bySymbol = data?.bySymbol ?? [];
  const symbols = bySymbol.map((s: any) => s.symbol);
  const trades = data?.trades ?? [];

  // 1) Filter base
  const filteredTrades = useMemo(() => {
    let base = trades;

    // URL day filter
    if (dayParam) {
      base = base.filter((t: any) => String(t.timestamp ?? "").startsWith(dayParam));
    }

    // Symbol filter
    base = selectedSymbol === "ALL" ? base : base.filter((t: any) => t.symbol === selectedSymbol);

    // Quick filters
    if (quick === "WINNERS") base = base.filter((t: any) => (t.netProfit ?? 0) > 0);
    if (quick === "LOSERS") base = base.filter((t: any) => (t.netProfit ?? 0) < 0);
    if (quick === "OPEN") base = base.filter((t: any) => String(t.action ?? "").toUpperCase() === "OPEN");
    if (quick === "CLOSE") base = base.filter((t: any) => String(t.action ?? "").toUpperCase() === "CLOSE");
    if (quick === "LONG") base = base.filter((t: any) => String(t.positionSide ?? "").toUpperCase() === "LONG");
    if (quick === "SHORT") base = base.filter((t: any) => String(t.positionSide ?? "").toUpperCase() === "SHORT");

    // Search filter
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
  }, [trades, dayParam, selectedSymbol, query, quick]);

  // 2) Sort
  const sortedTrades = useMemo(() => {
    return [...filteredTrades].sort((a: any, b: any) => {
      if (sortKey === "timeDesc") return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (sortKey === "timeAsc") return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();

      const ap = a.netProfit ?? 0;
      const bp = b.netProfit ?? 0;

      if (sortKey === "pnlDesc") return bp - ap;
      return ap - bp;
    });
  }, [filteredTrades, sortKey]);

  // 3) Free limit (after filtering/sorting)
  const limitedTrades = useMemo(() => {
    return isPro ? sortedTrades : sortedTrades.slice(0, FREE_TRADES_LIMIT);
  }, [sortedTrades, isPro]);

  // 4) KPIs for current view (limited)
  const kpis = useMemo(() => {
    const list = limitedTrades;
    const count = list.length;

    const netVals = list
      .map((t: any) => t.netProfit)
      .filter((x: any) => typeof x === "number" && Number.isFinite(x)) as number[];

    const sumNet = netVals.reduce((a, b) => a + b, 0);
    const avgNet = netVals.length ? sumNet / netVals.length : 0;

    const wins = netVals.filter((n) => n > 0).length;
    const losses = netVals.filter((n) => n < 0).length;
    const winRate = netVals.length ? wins / netVals.length : 0;

    return { count, sumNet, avgNet, wins, losses, winRate, netCount: netVals.length };
  }, [limitedTrades]);

  // 5) Pagination (on limited)
  const totalPages = Math.max(1, Math.ceil(limitedTrades.length / pageSize));
  const start = (page - 1) * pageSize;
  const pageTrades = limitedTrades.slice(start, start + pageSize);

  // reset page when list changes
  // (keine useEffect nötig; wir setzen page bei onChange. Optional: wenn Filter drastisch schrumpft)
  if (page > totalPages) {
    // safe sync clamp
    // eslint-disable-next-line react-hooks/rules-of-hooks
    // (kein Hook, normaler Code)
    // @ts-ignore
    setPage(totalPages);
  }

  function exportTradesCSV() {
    if (!data) return;

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

  // ✅ After all hooks: early render
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

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      <h1>Trade Log</h1>
      <div style={{ opacity: 0.8, marginBottom: 12 }}>
        Session: <b>{data.uploadedFileName}</b>
        {!isPro && sortedTrades.length > FREE_TRADES_LIMIT && (
          <>
            {" "}
            · <span style={{ color: "var(--muted)" }}>FREE limit: showing first {FREE_TRADES_LIMIT} trades</span>
          </>
        )}
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {/* Quick filters */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
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
                onClick={() => {
                  setQuick(k);
                  setPage(1);
                }}
                style={{ padding: "6px 10px" }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={exportTradesCSV} className={isPro ? "btn-secondary" : "btn-secondary"} title={!isPro ? "Pro feature" : ""}>
              {isPro ? "Export CSV" : "🔒 Export CSV (PRO)"}
            </button>

            <button onClick={() => router.push("/dashboard")} className="btn-secondary">
              Back
            </button>
          </div>
        </div>

        <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          {symbols.length > 0 && (
            <div>
              <label style={{ marginRight: 8 }}>
                <b>Symbol:</b>
              </label>
              <select
                value={selectedSymbol}
                onChange={(e) => {
                  setSelectedSymbol(e.target.value);
                  setPage(1);
                }}
              >
                <option value="ALL">ALL</option>
                {symbols.map((s: string) => (
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
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder="Order ID, symbol, direction..."
              style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8 }}
            />
          </div>

          <div>
            <label style={{ marginRight: 8 }}>
              <b>Sort:</b>
            </label>
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

          {dayParam && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", opacity: 0.9 }}>
              <div>
                Day filter: <b>{dayParam}</b>
              </div>
              <button
                onClick={() => {
                  router.push("/trades");
                  setPage(1);
                }}
                className="btn-secondary"
                style={{ padding: "6px 10px" }}
              >
                Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPI Bar */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Rows</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{kpis.count}</div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Net PnL (sum)</div>
            <div className={pnlClass(kpis.sumNet)} style={{ fontWeight: 900, fontSize: 18 }}>
              {fmt2(kpis.sumNet)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Avg Net / trade</div>
            <div className={pnlClass(kpis.avgNet)} style={{ fontWeight: 900, fontSize: 18 }}>
              {fmt2(kpis.avgNet)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Winrate</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {kpis.netCount ? `${Math.round(kpis.winRate * 100)}%` : "–"}
              <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 8 }}>
                ({kpis.wins}W / {kpis.losses}L)
              </span>
            </div>
          </div>

          <div style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12 }}>
            (KPIs based on current filter{!isPro && sortedTrades.length > FREE_TRADES_LIMIT ? ` · free cap ${FREE_TRADES_LIMIT}` : ""})
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
            // ✅ pass the trade so modal can do PRO copy safely (see modal fix)
            trade={selectedTrade ?? undefined}
          >
            {selectedTrade && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <b>Timestamp:</b> {selectedTrade.timestamp}
                  </div>
                  <div>
                    <b>Status:</b> {selectedTrade.status}
                  </div>

                  <div>
                    <b>Symbol:</b> {selectedTrade.symbol}
                  </div>
                  <div>
                    <b>Action:</b> {selectedTrade.action}
                  </div>

                  <div>
                    <b>PositionSide:</b> {selectedTrade.positionSide}
                  </div>
                  <div>
                    <b>Quantity:</b> {selectedTrade.quantity}
                  </div>

                  <div>
                    <b>Price:</b> {selectedTrade.price}
                  </div>

                  <div>
                    <b>Net Profit:</b>{" "}
                    {selectedTrade.netProfit === undefined ? (
                      "-"
                    ) : (
                      <span className={pnlClass(selectedTrade.netProfit)}>{fmt2(selectedTrade.netProfit)}</span>
                    )}
                  </div>

                  <div>
                    <b>Realized P/L:</b>{" "}
                    {selectedTrade.realizedPnl === undefined ? (
                      "-"
                    ) : (
                      <span className={pnlClass(selectedTrade.realizedPnl)}>{fmt2(selectedTrade.realizedPnl)}</span>
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
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>
          Keine Trades für diesen Filter.
        </div>
      )}
    </main>
  );
}

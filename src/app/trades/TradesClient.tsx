"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { TradesTable } from "../test-upload/TradesTable";
import { TradeDetailsModal } from "../components/TradeDetailsModal";

function fmt(n: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
}

function fmt2(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

export default function TradesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const dayParam = searchParams.get("day");   // "2025-12-21"
  const sortParam = searchParams.get("sort"); // "pnlAsc" | ...

  const { data } = useTradeSession();

  // ✅ Hooks/State IMMER ausführen (auch wenn data null ist)
  const [selectedSymbol, setSelectedSymbol] = useState<string>("ALL");
  const [sortKey, setSortKey] = useState<"timeDesc" | "timeAsc" | "pnlDesc" | "pnlAsc">(
    (sortParam as any) || "timeDesc"
  );
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [selectedTrade, setSelectedTrade] = useState<any | null>(null);
  const [query, setQuery] = useState("");

  // ✅ Nie mehr data.bySymbol / data.trades ohne Guard:
  const bySymbol = data?.bySymbol ?? [];
  const symbols = bySymbol.map((s: any) => s.symbol);
  const trades = data?.trades ?? [];

  const filteredTrades = useMemo(() => {
    let base = trades;

    if (dayParam) {
      base = base.filter((t: any) => String(t.timestamp ?? "").startsWith(dayParam));
    }

    base = selectedSymbol === "ALL" ? base : base.filter((t: any) => t.symbol === selectedSymbol);

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
  }, [trades, dayParam, selectedSymbol, query]);

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

  const totalPages = Math.max(1, Math.ceil(sortedTrades.length / pageSize));
  const start = (page - 1) * pageSize;
  const pageTrades = sortedTrades.slice(start, start + pageSize);

  const daySummary = useMemo(() => {
    if (!dayParam) return null;

    const list = sortedTrades;
    const totalNet = list.reduce((acc: number, t: any) => acc + (t.netProfit ?? 0), 0);
    const totalReal = list.reduce((acc: number, t: any) => acc + (t.realizedPnl ?? 0), 0);

    const byPnl = [...list].sort((a: any, b: any) => (a.netProfit ?? 0) - (b.netProfit ?? 0));
    const worst = byPnl[0] ?? null;
    const best = byPnl[byPnl.length - 1] ?? null;

    return { totalNet, totalReal, best, worst, count: list.length };
  }, [dayParam, sortedTrades]);

  // ✅ ERST NACH allen Hooks darfst du early-return rendern:
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
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
          {symbols.length > 0 && (
            <div>
              <label style={{ marginRight: 8 }}><b>Symbol:</b></label>
              <select
                value={selectedSymbol}
                onChange={(e) => { setSelectedSymbol(e.target.value); setPage(1); }}
              >
                <option value="ALL">ALL</option>
                {symbols.map((s: string) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={{ marginRight: 8 }}><b>Search:</b></label>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              placeholder="Order ID, symbol, direction..."
              style={{ padding: "6px 10px", border: "1px solid #ddd", borderRadius: 8 }}
            />
          </div>

          <div>
            <label style={{ marginRight: 8 }}><b>Sort:</b></label>
            <select
              value={sortKey}
              onChange={(e) => { setSortKey(e.target.value as any); setPage(1); }}
            >
              <option value="timeDesc">Timestamp (newest first)</option>
              <option value="timeAsc">Timestamp (oldest first)</option>
              <option value="pnlDesc">Net Profit (high → low)</option>
              <option value="pnlAsc">Net Profit (low → high)</option>
            </select>
          </div>

          <div style={{ opacity: 0.8 }}>Rows: <b>{sortedTrades.length}</b></div>

          {dayParam && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", opacity: 0.9 }}>
              <div>Day filter: <b>{dayParam}</b></div>
              <button onClick={() => router.push("/trades")} style={{ padding: "6px 10px" }}>Clear</button>
            </div>
          )}

          <button onClick={() => router.push("/dashboard")} style={{ padding: "6px 12px" }}>
            Back to Dashboard
          </button>
        </div>
      </div>

      {daySummary && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <div style={{ opacity: 0.7 }}>Day Trades</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{daySummary.count}</div>
          </div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <div style={{ opacity: 0.7 }}>Day Net Profit</div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{fmt(daySummary.totalNet)}</div>
          </div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <div style={{ opacity: 0.7 }}>Best Trade (Net)</div>
            <div style={{ fontWeight: 800 }}>{daySummary.best?.symbol ?? "-"}</div>
            <div style={{ opacity: 0.8 }}>{daySummary.best ? fmt(daySummary.best.netProfit ?? 0) : "-"}</div>
          </div>
          <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
            <div style={{ opacity: 0.7 }}>Worst Trade (Net)</div>
            <div style={{ fontWeight: 800 }}>{daySummary.worst?.symbol ?? "-"}</div>
            <div style={{ opacity: 0.8 }}>{daySummary.worst ? fmt(daySummary.worst.netProfit ?? 0) : "-"}</div>
          </div>
        </div>
      )}

      {/* Table */}
      {pageTrades.length > 0 ? (
        <>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ maxHeight: "65vh", overflow: "auto", borderRadius: 12 }}>
              <TradesTable trades={pageTrades} onRowClick={(t) => setSelectedTrade(t)} selectedId={selectedTrade?.id} />
            </div>

            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ padding: "6px 12px" }}>
                Prev
              </button>
              <div>Page <b>{page}</b> / <b>{totalPages}</b></div>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ padding: "6px 12px" }}>
                Next
              </button>
            </div>
          </div>

          <TradeDetailsModal
            open={!!selectedTrade}
            onClose={() => setSelectedTrade(null)}
            title={selectedTrade ? `${selectedTrade.symbol} • ${selectedTrade.id ?? ""}` : "Trade Details"}
          >
            {selectedTrade && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div><b>Timestamp:</b> {selectedTrade.timestamp}</div>
                  <div><b>Status:</b> {selectedTrade.status}</div>
                  <div><b>Symbol:</b> {selectedTrade.symbol}</div>
                  <div><b>Action:</b> {selectedTrade.action}</div>
                  <div><b>PositionSide:</b> {selectedTrade.positionSide}</div>
                  <div><b>Quantity:</b> {selectedTrade.quantity}</div>
                  <div><b>Price:</b> {selectedTrade.price}</div>
                  <div>
                    <b>Net Profit:</b>{" "}
                    {selectedTrade.netProfit === undefined ? "-" : (
                      <span className={pnlClass(selectedTrade.netProfit)}>{fmt2(selectedTrade.netProfit)}</span>
                    )}
                  </div>
                </div>

                <h3 style={{ marginTop: 16 }}>Raw</h3>
                <pre style={{ background: "rgba(0,0,0,0.55)", padding: 12, overflow: "auto", borderRadius: 12 }}>
                  {JSON.stringify(selectedTrade.raw ?? selectedTrade, null, 2)}
                </pre>
              </>
            )}
          </TradeDetailsModal>
        </>
      ) : (
        <div style={{ padding: 12, border: "1px solid #ddd", borderRadius: 8 }}>Keine Trades für diesen Filter.</div>
      )}
    </main>
  );
}

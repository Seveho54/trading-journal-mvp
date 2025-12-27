"use client";

import { useMemo, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { buildPositionStats } from "@/core/analytics/positionStats";

const FREE_POSITIONS_LIMIT = 200;

type QuickFilter = "ALL" | "WINNERS" | "LOSERS" | "LONG" | "SHORT";
type SortKey = "closeDesc" | "closeAsc" | "pnlDesc" | "pnlAsc";

function fmt2(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtPercent(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(n);
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

function toDayKey(ts: any): string {
  return String(ts ?? "").slice(0, 10);
}
function timeOf(p: any): number {
  const t = p.closedAt ?? p.openedAt;
  const ms = new Date(String(t)).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function statusOf(p: any): "WIN" | "LOSS" | "EVEN" {
  const n = Number(p?.netProfit ?? 0);
  if (n > 0) return "WIN";
  if (n < 0) return "LOSS";
  return "EVEN";
}

function badgeStyle(kind: "WIN" | "LOSS" | "EVEN" | "LONG" | "SHORT") {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 900,
    border: "1px solid var(--border)",
    lineHeight: 1.3,
    userSelect: "none",
    whiteSpace: "nowrap",
  };

  if (kind === "WIN") return { ...base, background: "rgba(54, 211, 153, 0.16)", color: "var(--text)" };
  if (kind === "LOSS") return { ...base, background: "rgba(251, 113, 133, 0.16)", color: "var(--text)" };
  if (kind === "EVEN") return { ...base, background: "rgba(255,255,255,0.06)", color: "var(--text)" };

  if (kind === "LONG") return { ...base, background: "rgba(54, 211, 153, 0.10)", color: "var(--text)" };
  return { ...base, background: "rgba(251, 113, 133, 0.10)", color: "var(--text)" };
}

export default function PositionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const dayParam = searchParams.get("day"); // YYYY-MM-DD
  const symbolParam = searchParams.get("symbol"); // e.g. "BTCUSDT"

  const { data, isPro } = useTradeSession();

  // ✅ state always
  const [quick, setQuick] = useState<QuickFilter>("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("closeDesc");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const allPositions = useMemo(() => (data?.positions ?? []) as any[], [data]);

  const filtered = useMemo(() => {
    let base = allPositions;

    if (dayParam) {
      base = base.filter((p: any) => {
        const closed = p.closedAt ? toDayKey(p.closedAt) : null;
        const opened = p.openedAt ? toDayKey(p.openedAt) : null;
        return closed === dayParam || (!closed && opened === dayParam);
      });
    }

    if (symbolParam) {
      base = base.filter((p: any) => String(p.symbol ?? "") === symbolParam);
    }

    if (quick === "WINNERS") base = base.filter((p: any) => (p.netProfit ?? 0) > 0);
    if (quick === "LOSERS") base = base.filter((p: any) => (p.netProfit ?? 0) < 0);
    if (quick === "LONG") base = base.filter((p: any) => String(p.positionSide ?? "").toUpperCase() === "LONG");
    if (quick === "SHORT") base = base.filter((p: any) => String(p.positionSide ?? "").toUpperCase() === "SHORT");

    const q = query.trim().toLowerCase();
    if (!q) return base;

    return base.filter((p: any) => {
      const id = String(p.id ?? "").toLowerCase();
      const symbol = String(p.symbol ?? "").toLowerCase();
      const side = String(p.positionSide ?? "").toLowerCase();
      return id.includes(q) || symbol.includes(q) || side.includes(q);
    });
  }, [allPositions, dayParam, symbolParam, quick, query]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a: any, b: any) => {
      if (sortKey === "closeDesc") return timeOf(b) - timeOf(a);
      if (sortKey === "closeAsc") return timeOf(a) - timeOf(b);

      const ap = a.netProfit ?? 0;
      const bp = b.netProfit ?? 0;

      if (sortKey === "pnlDesc") return bp - ap;
      return ap - bp;
    });
  }, [filtered, sortKey]);

  const limited = useMemo(() => (isPro ? sorted : sorted.slice(0, FREE_POSITIONS_LIMIT)), [sorted, isPro]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(limited.length / pageSize)), [limited.length, pageSize]);

  const pageRows = useMemo(() => {
    const clampedPage = Math.min(Math.max(1, page), totalPages);
    const start = (clampedPage - 1) * pageSize;
    return limited.slice(start, start + pageSize);
  }, [limited, page, pageSize, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [dayParam, symbolParam, quick, sortKey, query]);

  useEffect(() => {
    setPage((p) => Math.min(p, totalPages));
  }, [totalPages]);

  const stats = useMemo(() => buildPositionStats(limited as any), [limited]);

  function exportPositionsCSV() {
    if (!isPro) {
      router.push("/pricing");
      return;
    }

    const rows = limited.map((p: any) => ({
      id: p.id,
      status: statusOf(p),
      symbol: p.symbol,
      side: p.positionSide,
      openedAt: p.openedAt,
      closedAt: p.closedAt ?? "",
      quantity: p.quantity,
      entryPrice: p.entryPrice,
      exitPrice: p.exitPrice,
      realizedPnl: p.realizedPnl ?? "",
      netProfit: p.netProfit,
      tradesCount: Array.isArray(p.trades) ? p.trades.length : "",
    }));

    const csv = toCSV(rows);

    const suffixParts = [dayParam ? `day-${dayParam}` : null, symbolParam ? `sym-${symbolParam}` : null].filter(Boolean);
    const suffix = suffixParts.length ? `-${suffixParts.join("-")}` : "";
    downloadTextFile(`positions${suffix}.csv`, csv);
  }

  // ✅ guards
  if (!data) {
    return (
      <main>
        <div className="card" style={{ padding: 18 }}>
          <h1>Positions</h1>
          <p className="p-muted">Keine Daten geladen.</p>
          <button onClick={() => router.push("/upload")}>Go to Upload</button>
        </div>
      </main>
    );
  }

  if (allPositions.length === 0) {
    return (
      <main>
        <div className="card" style={{ padding: 18 }}>
          <h1>Positions</h1>
          <p>Keine geschlossenen Positionen vorhanden.</p>
          <button onClick={() => router.push("/upload")}>Upload another file</button>
        </div>
      </main>
    );
  }

  function goClearDay() {
    if (symbolParam) router.push(`/positions?symbol=${encodeURIComponent(symbolParam)}`);
    else router.push("/positions");
  }

  function goClearSymbol() {
    if (dayParam) router.push(`/positions?day=${encodeURIComponent(dayParam)}`);
    else router.push("/positions");
  }

  const headerNote = [
    dayParam ? `Day: ${dayParam}` : null,
    symbolParam ? `Symbol: ${symbolParam}` : null,
    !isPro && sorted.length > FREE_POSITIONS_LIMIT ? `FREE limit: first ${FREE_POSITIONS_LIMIT}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      {/* Header */}
      <div className="card" style={{ padding: 18, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <div className="h1">Positions</div>
          <div className="p-muted">
            Session: <b>{data.uploadedFileName}</b> · Showing: <b>{limited.length}</b>
          </div>
        </div>

        {headerNote ? (
          <div className="p-muted" style={{ marginTop: 6 }}>
            {headerNote}
          </div>
        ) : null}
      </div>

      {/* Controls */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          {/* Quick chips */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(
              [
                ["ALL", "All"],
                ["WINNERS", "Winners"],
                ["LOSERS", "Losers"],
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

          {/* Right actions */}
          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={exportPositionsCSV} className="btn-secondary" title={!isPro ? "Pro feature" : ""}>
              {isPro ? "Export CSV" : "🔒 Export CSV (PRO)"}
            </button>

            {symbolParam ? (
              <button onClick={goClearSymbol} className="btn-secondary">
                Clear Symbol
              </button>
            ) : null}

            {dayParam ? (
              <>
                <button onClick={goClearDay} className="btn-secondary">
                  Clear Day
                </button>
                <button onClick={() => router.push("/calendar")} className="btn-secondary">
                  Back to Calendar
                </button>
              </>
            ) : null}

            <button onClick={() => router.push("/dashboard")} className="btn-secondary">
              Back
            </button>
          </div>
        </div>

        {/* Search + Sort */}
        <div style={{ marginTop: 12, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <label style={{ marginRight: 8 }}>
              <b>Search:</b>
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="symbol, id, side…"
              style={{ padding: "6px 10px", border: "1px solid var(--border)", borderRadius: 10, minWidth: 220 }}
            />
          </div>

          <div>
            <label style={{ marginRight: 8 }}>
              <b>Sort:</b>
            </label>
            <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
              <option value="closeDesc">Closed (newest first)</option>
              <option value="closeAsc">Closed (oldest first)</option>
              <option value="pnlDesc">Net Profit (high → low)</option>
              <option value="pnlAsc">Net Profit (low → high)</option>
            </select>
          </div>

          <div style={{ opacity: 0.8 }}>
            Rows: <b>{limited.length}</b>
          </div>
        </div>
      </div>

      {/* KPIs (compact + trader-like) */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Positions</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{stats.positions}</div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Winrate</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{fmtPercent(stats.winRate)}</div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Net PnL</div>
            <div className={pnlClass(stats.totalNetProfit)} style={{ fontWeight: 900, fontSize: 18 }}>
              {fmt2(stats.totalNetProfit)}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Profit Factor</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>
              {Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"}
            </div>
          </div>

          <div style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12 }}>
            (based on current filter)
          </div>
        </div>
      </div>

      {/* Table */}
      {pageRows.length === 0 ? (
        <div className="card" style={{ padding: 18 }}>
          <h2 style={{ margin: 0 }}>No positions for this filter</h2>
          <p className="p-muted" style={{ marginTop: 8 }}>
            Try another filter or clear it.
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <button onClick={() => setQuick("ALL")} className="btn-secondary">
              Reset quick filter
            </button>
            {symbolParam ? (
              <button onClick={goClearSymbol} className="btn-secondary">
                Clear symbol
              </button>
            ) : null}
            {dayParam ? (
              <button onClick={goClearDay} className="btn-secondary">
                Clear day
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Status", "Symbol", "Side", "Opened", "Closed", "Qty", "Entry", "Exit", "Net PnL"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        borderBottom: "1px solid var(--border)",
                        padding: "10px 8px",
                        fontSize: 12,
                        color: "var(--muted)",
                        fontWeight: 900,
                        letterSpacing: 0.2,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {pageRows.map((p: any) => {
                  const st = statusOf(p);
                  const side = String(p.positionSide ?? "").toUpperCase() === "SHORT" ? "SHORT" : "LONG";
                  return (
                    <tr
                      key={p.id}
                      onClick={() => router.push(`/positions/${p.id}`)}
                      style={{
                        cursor: "pointer",
                        borderBottom: "1px solid var(--border)",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as any).style.background = "rgba(255,255,255,0.03)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as any).style.background = "transparent";
                      }}
                      title="Open position details"
                    >
                      <td style={{ padding: "10px 8px" }}>
                        <span style={badgeStyle(st)}>
                          {st === "WIN" ? "" : st === "LOSS" ? "" : "•"} {st}
                        </span>
                      </td>

                      <td style={{ padding: "10px 8px" }}>
                        <div style={{ fontWeight: 900 }}>{p.symbol}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>{String(p.id ?? "").slice(0, 10)}</div>
                      </td>

                      <td style={{ padding: "10px 8px" }}>
                        <span style={badgeStyle(side as any)}>{side}</span>
                      </td>

                      <td style={{ padding: "10px 8px", fontSize: 13 }}>{p.openedAt}</td>
                      <td style={{ padding: "10px 8px", fontSize: 13 }}>{p.closedAt ?? "-"}</td>

                      <td style={{ padding: "10px 8px", fontVariantNumeric: "tabular-nums" }}>{p.quantity}</td>
                      <td style={{ padding: "10px 8px", fontVariantNumeric: "tabular-nums" }}>{fmt2(p.entryPrice)}</td>
                      <td style={{ padding: "10px 8px", fontVariantNumeric: "tabular-nums" }}>{fmt2(p.exitPrice)}</td>

                      <td style={{ padding: "10px 8px", fontVariantNumeric: "tabular-nums" }}>
                        <span className={pnlClass(p.netProfit)} style={{ fontWeight: 900 }}>
                          {fmt2(p.netProfit)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn-secondary"
              style={{ padding: "6px 12px" }}
            >
              Prev
            </button>

            <div style={{ color: "var(--muted)" }}>
              Page <b style={{ color: "var(--text)" }}>{page}</b> / <b style={{ color: "var(--text)" }}>{totalPages}</b>
            </div>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="btn-secondary"
              style={{ padding: "6px 12px" }}
            >
              Next
            </button>

            <div style={{ marginLeft: "auto", color: "var(--muted)", fontSize: 12 }}>
              Tip: click a row to open full details.
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTradeSession } from "../../providers/TradeSessionProvider";

function fmt2(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmt6(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(n);
}
function fmtPercent(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 2 }).format(n);
}
function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

function minutesBetween(a?: any, b?: any) {
  const t1 = new Date(String(a ?? "")).getTime();
  const t2 = new Date(String(b ?? "")).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2) || t2 <= t1) return null;
  return (t2 - t1) / 60000;
}
function fmtHoldMinutes(mins: number | null) {
  if (!mins || !Number.isFinite(mins) || mins <= 0) return "–";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = mins / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  const d = h / 24;
  return `${d.toFixed(1)}d`;
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

function statusOfPnl(n: any): "WIN" | "LOSS" | "EVEN" {
  const v = Number(n ?? 0);
  if (v > 0) return "WIN";
  if (v < 0) return "LOSS";
  return "EVEN";
}

function badgeStyle(kind: "WIN" | "LOSS" | "EVEN" | "LONG" | "SHORT" | "OPEN" | "CLOSE") {
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
  if (kind === "SHORT") return { ...base, background: "rgba(251, 113, 133, 0.10)", color: "var(--text)" };

  if (kind === "OPEN") return { ...base, background: "rgba(255,255,255,0.06)", color: "var(--text)" };
  return { ...base, background: "rgba(255,255,255,0.06)", color: "var(--text)" };
}

function dayKeyFromAnyTs(ts: any) {
  return String(ts ?? "").slice(0, 10);
}

export default function PositionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String((params as any)?.id ?? "");

  const { data, isPro } = useTradeSession();

  const [copied, setCopied] = useState(false);

  const position = useMemo(() => {
    const list = (data?.positions ?? []) as any[];
    return list.find((p) => String(p.id) === id) ?? null;
  }, [data, id]);

  const trades = useMemo(() => {
    const t = (position?.trades ?? []) as any[];
    return [...t].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [position]);

  // guards (after hooks)
  if (!data) {
    return (
      <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="h1">Position</div>
          <p className="p-muted">Keine Daten geladen. Bitte zuerst eine CSV hochladen.</p>
          <button onClick={() => router.push("/upload")} className="btn-secondary">
            Go to Upload
          </button>
        </div>
      </main>
    );
  }

  if (!position) {
    return (
      <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="h1">Position not found</div>
          <p className="p-muted">Diese Position existiert nicht in der aktuellen Session.</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <button onClick={() => router.push("/positions")} className="btn-secondary">
              Back to Positions
            </button>
            <button onClick={() => router.push("/dashboard")} className="btn-secondary">
              Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  const holdMins = minutesBetween(position.openedAt, position.closedAt);
  const retPct =
    position.entryPrice && position.quantity
      ? (position.netProfit ?? 0) / (position.entryPrice * position.quantity)
      : null;

  const posSide = String(position.positionSide ?? "").toUpperCase() === "SHORT" ? "SHORT" : "LONG";
  const posStatus = statusOfPnl(position.netProfit);

  function exportPositionCSV() {
    if (!isPro) {
      router.push("/pricing");
      return;
    }
    const rows = trades.map((t: any) => ({
      timestamp: t.timestamp,
      symbol: t.symbol,
      action: t.action,
      positionSide: t.positionSide,
      quantity: t.quantity,
      price: t.price,
      realizedPnl: t.realizedPnl ?? "",
      netProfit: t.netProfit ?? "",
      status: t.status ?? "",
      id: t.id ?? "",
    }));
    downloadTextFile(`position-${position.id}.csv`, toCSV(rows));
  }

  async function copyRaw() {
    if (!isPro) {
      router.push("/pricing");
      return;
    }
    const raw = JSON.stringify(position, null, 2);
    await navigator.clipboard.writeText(raw);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const openDay = dayKeyFromAnyTs(position.openedAt);
  const closeDay = dayKeyFromAnyTs(position.closedAt ?? position.openedAt);

  return (
    <main style={{ maxWidth: 1100, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      {/* Header */}
      <div className="card" style={{ padding: 18, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 260 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div className="h1" style={{ margin: 0 }}>
                {position.symbol}
              </div>
              <span style={badgeStyle(posStatus)}>
                {posStatus === "WIN" ? "" : posStatus === "LOSS" ? "" : "•"} {posStatus}
              </span>
              <span style={badgeStyle(posSide as any)}>{posSide}</span>
            </div>

            <div className="p-muted" style={{ marginTop: 6 }}>
              ID: <b>{position.id}</b>
            </div>

            <div className="p-muted" style={{ marginTop: 4 }}>
              Open: <b>{openDay}</b> · Close: <b>{closeDay}</b>
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => router.push("/positions")} className="btn-secondary">
              Back
            </button>

            <button
              onClick={() => router.push(`/trades?sort=timeAsc&day=${encodeURIComponent(closeDay)}`)}
              className="btn-secondary"
              title="Open this day in Trade Log"
            >
              Open in Trades
            </button>

            <button onClick={exportPositionCSV} className="btn-secondary" title={!isPro ? "Pro feature" : ""}>
              {isPro ? "Export CSV" : "🔒 Export CSV (PRO)"}
            </button>

            <button onClick={copyRaw} className="btn-secondary" title={!isPro ? "Pro feature" : ""}>
              {isPro ? (copied ? "✅ Copied" : "Copy Raw") : "🔒 Copy Raw (PRO)"}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>Net PnL</div>
          <div className={pnlClass(position.netProfit ?? 0)} style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
            {fmt2(position.netProfit ?? 0)}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
            Realized:{" "}
            <span className={pnlClass(position.realizedPnl ?? 0)} style={{ fontWeight: 900 }}>
              {fmt2(position.realizedPnl ?? 0)}
            </span>
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>Return %</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>
            {retPct === null ? "–" : <span className={pnlClass(retPct)}>{fmtPercent(retPct)}</span>}
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>vs. entry notionals</div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>Hold Time</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{fmtHoldMinutes(holdMins)}</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
            Open → Close
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>Trade Events</div>
          <div style={{ fontSize: 22, fontWeight: 900, marginTop: 4 }}>{trades.length}</div>
          <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 6 }}>
            within this position
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>Position Details</div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>Opened</div>
            <div style={{ fontWeight: 900, marginTop: 4 }}>{position.openedAt}</div>
          </div>

          <div>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>Closed</div>
            <div style={{ fontWeight: 900, marginTop: 4 }}>{position.closedAt ?? "–"}</div>
          </div>

          <div>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>Quantity</div>
            <div style={{ fontWeight: 900, marginTop: 4 }}>{position.quantity}</div>
          </div>

          <div>
            <div style={{ color: "var(--muted)", fontSize: 12, fontWeight: 900 }}>Entry → Exit</div>
            <div style={{ fontWeight: 900, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
              {fmt6(position.entryPrice)} → {fmt6(position.exitPrice)}
            </div>
          </div>
        </div>
      </div>

      {/* Trades Table */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Trade Events in this Position</div>
          {!isPro ? (
            <div className="p-muted" style={{ fontSize: 12 }}>
              Pro unlocks Export & Raw Copy
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 10, overflow: "auto", borderRadius: 12, border: "1px solid var(--border)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Timestamp", "Action", "Side", "Qty", "Price", "Net PnL", "Status"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid var(--border)",
                      padding: "10px 8px",
                      fontSize: 12,
                      color: "var(--muted)",
                      fontWeight: 900,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {trades.map((t: any, i: number) => {
                const action = String(t.action ?? "").toUpperCase();
                const side = String(t.positionSide ?? "").toUpperCase() === "SHORT" ? "SHORT" : "LONG";
                return (
                  <tr
                    key={i}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as any).style.background = "rgba(255,255,255,0.03)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as any).style.background = "transparent";
                    }}
                  >
                    <td style={{ padding: "10px 8px", whiteSpace: "nowrap" }}>{t.timestamp}</td>

                    <td style={{ padding: "10px 8px" }}>
                      <span style={badgeStyle(action === "OPEN" ? "OPEN" : "CLOSE")}>{action || "—"}</span>
                    </td>

                    <td style={{ padding: "10px 8px" }}>
                      <span style={badgeStyle(side as any)}>{side}</span>
                    </td>

                    <td style={{ padding: "10px 8px", fontVariantNumeric: "tabular-nums" }}>{t.quantity}</td>
                    <td style={{ padding: "10px 8px", fontVariantNumeric: "tabular-nums" }}>{fmt6(t.price ?? 0)}</td>

                    <td style={{ padding: "10px 8px", fontVariantNumeric: "tabular-nums" }}>
                      {t.netProfit === undefined ? (
                        "–"
                      ) : (
                        <span className={pnlClass(t.netProfit)} style={{ fontWeight: 900 }}>
                          {fmt2(t.netProfit)}
                        </span>
                      )}
                    </td>

                    <td style={{ padding: "10px 8px" }}>{t.status ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Optional raw (kept minimal) */}
        <div style={{ marginTop: 12, color: "var(--muted)", fontSize: 12 }}>
          Tip: “Open in Trades” jumps to the day in your Trade Log.
        </div>
      </div>
    </main>
  );
}

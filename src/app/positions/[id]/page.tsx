"use client";

import { useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { useTradeSession } from "../../providers/TradeSessionProvider";

function fmt2(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmt6(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(n);
}
function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}
function fmtPercent(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 2 }).format(n);
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

export default function PositionDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = String((params as any)?.id ?? "");

  const { data, isPro } = useTradeSession();

  const position = useMemo(() => {
    const list = (data?.positions ?? []) as any[];
    return list.find((p) => String(p.id) === id) ?? null;
  }, [data, id]);

  const trades = useMemo(() => {
    const t = (position?.trades ?? []) as any[];
    return [...t].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [position]);

  if (!data) {
    return (
      <main>
        <div className="card" style={{ padding: 18 }}>
          <div className="h1">Position</div>
          <p className="p-muted">Keine Daten geladen. Bitte zuerst eine CSV hochladen.</p>
          <button onClick={() => router.push("/upload")}>Go to Upload</button>
        </div>
      </main>
    );
  }

  if (!position) {
    return (
      <main>
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
  }

  return (
    <main>
      <div className="card" style={{ padding: 18, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div className="h1" style={{ marginBottom: 6 }}>
              {position.symbol} · {position.positionSide}
            </div>
            <div className="p-muted">
              ID: <b>{position.id}</b>
            </div>
          </div>

          <div style={{ marginLeft: "auto", display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => router.push("/positions")} className="btn-secondary">
              Back
            </button>

            <button
              onClick={() => router.push(`/trades?sort=timeAsc&day=${String(position.closedAt ?? position.openedAt).slice(0, 10)}`)}
              className="btn-secondary"
              title="Open day in Trade Log"
            >
              Open in Trades
            </button>

            <button onClick={exportPositionCSV} className="btn-secondary" title={!isPro ? "Pro feature" : ""}>
              {isPro ? "Export CSV" : "🔒 Export CSV (PRO)"}
            </button>

            <button onClick={copyRaw} className="btn-secondary" title={!isPro ? "Pro feature" : ""}>
              {isPro ? "Copy Raw" : "🔒 Copy Raw (PRO)"}
            </button>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Net PnL</div>
          <div className={pnlClass(position.netProfit ?? 0)} style={{ fontSize: 22, fontWeight: 900 }}>
            {fmt2(position.netProfit ?? 0)}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Return %</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>
            {retPct === null ? "–" : <span className={pnlClass(retPct)}>{fmtPercent(retPct)}</span>}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Hold Time</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtHoldMinutes(holdMins)}</div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Trades in Position</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{trades.length}</div>
        </div>
      </div>

      {/* Details */}
      <div className="card" style={{ padding: 14, marginBottom: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Opened</div>
            <div style={{ fontWeight: 900 }}>{position.openedAt}</div>
          </div>
          <div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Closed</div>
            <div style={{ fontWeight: 900 }}>{position.closedAt ?? "–"}</div>
          </div>
          <div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Quantity</div>
            <div style={{ fontWeight: 900 }}>{position.quantity}</div>
          </div>
          <div>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Entry / Exit</div>
            <div style={{ fontWeight: 900 }}>
              {fmt6(position.entryPrice)} → {fmt6(position.exitPrice)}
            </div>
          </div>
        </div>
      </div>

      {/* Trades Table */}
      <div className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>Trade Events in this Position</div>
          {!isPro ? (
            <div className="p-muted" style={{ fontSize: 12 }}>
              Pro unlocks Export & Raw Copy
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 10, overflow: "auto", borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                {["Timestamp", "Action", "Side", "Qty", "Price", "Net PnL", "Status"].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      borderBottom: "1px solid var(--border)",
                      padding: 8,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {trades.map((t: any, i: number) => (
                <tr key={i}>
                  <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{t.timestamp}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    <b>{t.action}</b>
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{t.positionSide}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{t.quantity}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{fmt6(t.price ?? 0)}</td>
                  <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                    {t.netProfit === undefined ? "–" : (
                      <span className={pnlClass(t.netProfit)}>{fmt2(t.netProfit)}</span>
                    )}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{t.status ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

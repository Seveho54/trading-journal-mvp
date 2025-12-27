"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { buildPositionStats } from "@/core/analytics/positionStats";

function fmt2(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPercent(n: number) {
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(n);
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

function fmtHoldMinutes(mins: number) {
  if (!Number.isFinite(mins) || mins <= 0) return "–";
  if (mins < 60) return `${Math.round(mins)}m`;
  const h = mins / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  const d = h / 24;
  return `${d.toFixed(1)}d`;
}

export default function DashboardPage() {
  const router = useRouter();
  const { data, isPro, setIsPro } = useTradeSession();

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

  // ✅ positions + stats
  const positions = useMemo(() => (data?.positions ?? []) as any[], [data]);
  const stats = useMemo(() => buildPositionStats(positions as any), [positions]);

  // ✅ best/worst symbol by POSITIONS (already precomputed on API)
  const bySymbolPos = useMemo(() => (data?.bySymbolPositions ?? []) as any[], [data]);
  const bestPos = bySymbolPos.length ? bySymbolPos[0] : null;
  const worstPos = bySymbolPos.length ? bySymbolPos[bySymbolPos.length - 1] : null;

  // ✅ “What went wrong?” (biggest losing position)
  const worstPosition = useMemo(() => {
    const losing = positions.filter((p: any) => (p?.netProfit ?? 0) < 0);
    if (!losing.length) return null;
    return [...losing].sort((a: any, b: any) => (a?.netProfit ?? 0) - (b?.netProfit ?? 0))[0];
  }, [positions]);

  const lossImpactPct = useMemo(() => {
    if (!worstPosition) return null;
    const total = stats?.totalNetProfit ?? 0;
    if (!Number.isFinite(total) || total === 0) return null;
    const ratio = Math.abs((worstPosition.netProfit ?? 0) / total);
    if (!Number.isFinite(ratio)) return null;
    return Math.round(ratio * 100);
  }, [worstPosition, stats]);

  const summary = data?.summary ?? null;

  return (
    <main>
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div className="h1">Dashboard</div>
        <p className="p-muted">
          Session: <b>{data.uploadedFileName}</b> · Rows: <b>{data.rowsParsed}</b> · Positions:{" "}
          <b>{positions.length}</b>
        </p>
      </div>

      {/* KPI Cards (POSITIONS) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Closed Positions</div>
          <div style={{ fontSize: 26, fontWeight: 900 }}>{stats.positions}</div>
          <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
            Wins: <b style={{ color: "var(--text)" }}>{stats.wins}</b> · Losses:{" "}
            <b style={{ color: "var(--text)" }}>{stats.losses}</b>
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Total Net Profit (Positions)</div>
          <div className={pnlClass(stats.totalNetProfit)} style={{ fontSize: 26, fontWeight: 900 }}>
            {fmt2(stats.totalNetProfit)}
          </div>
          <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
            Max DD: <span className={pnlClass(stats.maxDrawdown)}>{fmt2(stats.maxDrawdown)}</span>
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Winrate / Profit Factor</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{fmtPercent(stats.winRate)}</div>
          <div style={{ marginTop: 6, color: "var(--muted)", fontSize: 12 }}>
            PF:{" "}
            <b style={{ color: "var(--text)" }}>
              {Number.isFinite(stats.profitFactor) ? stats.profitFactor.toFixed(2) : "∞"}
            </b>
          </div>
        </div>
      </div>

      {/* Secondary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Avg Win</div>
          <div className={pnlClass(stats.avgWin)} style={{ fontSize: 20, fontWeight: 900 }}>
            {fmt2(stats.avgWin)}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Avg Loss</div>
          <div className={pnlClass(stats.avgLoss)} style={{ fontSize: 20, fontWeight: 900 }}>
            {fmt2(stats.avgLoss)}
          </div>
        </div>

        <div className="card" style={{ padding: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>Avg Hold Time</div>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{fmtHoldMinutes(stats.avgHoldMinutes)}</div>
        </div>
      </div>

      {/* ✅ What went wrong? */}
      {worstPosition && (
        <div className="card" style={{ padding: 16, marginBottom: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12 }}>❌ What went wrong?</div>

          <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>Biggest Losing Position</div>

          <div style={{ marginTop: 10 }}>
            <b>{worstPosition.symbol}</b> · {worstPosition.positionSide}
          </div>

          <div style={{ marginTop: 6 }}>
            Loss:{" "}
            <span className="pnl-negative" style={{ fontWeight: 900 }}>
              {fmt2(worstPosition.netProfit ?? 0)}
            </span>
          </div>

          {lossImpactPct !== null && (
            <div style={{ marginTop: 8, color: "var(--muted)", fontSize: 13 }}>
              👉 This single position wiped out <b style={{ color: "var(--text)" }}>{lossImpactPct}%</b> of your total
              net profit.
            </div>
          )}

          <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button onClick={() => router.push(`/positions/${worstPosition.id}`)}>View Position</button>

            {!isPro && (
              <button className="btn-primary" onClick={() => router.push("/pricing")}>
                Unlock PRO (Export/Details)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Top/Worst Symbol by POSITIONS */}
      {bestPos && worstPos && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12, marginBottom: 14 }}>
          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Top Symbol (Positions)</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>{bestPos.symbol}</div>
            <div style={{ marginTop: 8, color: "var(--muted)" }}>
              Net Profit:{" "}
              <span className={pnlClass(bestPos.totalNetProfit ?? 0)}>{fmt2(bestPos.totalNetProfit ?? 0)}</span>
              {" · "}
              Winrate: <b style={{ color: "var(--text)" }}>{fmtPercent(bestPos.winRate ?? 0)}</b>
              {" · "}
              Positions: <b style={{ color: "var(--text)" }}>{bestPos.positions ?? "-"}</b>
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div style={{ color: "var(--muted)", fontSize: 12 }}>Worst Symbol (Positions)</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>{worstPos.symbol}</div>
            <div style={{ marginTop: 8, color: "var(--muted)" }}>
              Net Profit:{" "}
              <span className={pnlClass(worstPos.totalNetProfit ?? 0)}>{fmt2(worstPos.totalNetProfit ?? 0)}</span>
              {" · "}
              Winrate: <b style={{ color: "var(--text)" }}>{fmtPercent(worstPos.winRate ?? 0)}</b>
              {" · "}
              Positions: <b style={{ color: "var(--text)" }}>{worstPos.positions ?? "-"}</b>
            </div>
          </div>
        </div>
      )}

      {/* Optional: Trades summary */}
      {summary && (
        <div className="card" style={{ padding: 14, marginBottom: 14 }}>
          <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Trades (raw events)</div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", color: "var(--muted)" }}>
            <div>
              Executed: <b style={{ color: "var(--text)" }}>{summary.executed}</b>
            </div>
            <div>
              Total Net:{" "}
              <span className={pnlClass(summary.totalNetProfit ?? 0)}>{fmt2(summary.totalNetProfit ?? 0)}</span>
            </div>
            <div>
              Symbols: <b style={{ color: "var(--text)" }}>{summary.symbols}</b>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="card" style={{ padding: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => router.push("/trades")}>Go to Trade Log</button>
        <button onClick={() => router.push("/positions")}>Go to Positions</button>
        <button onClick={() => router.push("/performance")}>Go to Performance</button>
        <button onClick={() => router.push("/calendar")}>Go to Calendar</button>
        <button onClick={() => router.push("/upload")}>Upload another file</button>
        <button onClick={() => router.push("/pricing")}>Pricing</button>
      </div>

      {/* Fake Door / Dev Toggle */}
      <div className="card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 900 }}>Plan:</div>
          <div className="p-muted">
            {isPro ? <b style={{ color: "var(--text)" }}>PRO</b> : <b style={{ color: "var(--text)" }}>FREE</b>}
          </div>

          <button onClick={() => setIsPro(!isPro)} style={{ marginLeft: "auto" }}>
            Toggle (Dev)
          </button>
        </div>

        <div className="p-muted" style={{ marginTop: 8 }}>
          MVP-Fake Door: Free hat Limits. Pro ist unlocked.
        </div>
      </div>
    </main>
  );
}

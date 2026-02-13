"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { computeRiskSummary } from "@/lib/risk";

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div
        className="p-muted"
        style={{ fontSize: 12, fontWeight: 900, opacity: 0.9 }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 22,
          fontWeight: 1000,
          letterSpacing: 0.2,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function MiniEquityChart({
  points,
}: {
  points: { t: string; equity: number }[];
}) {
  // tiny svg chart (no deps)
  const w = 520;
  const h = 120;
  const pad = 10;

  const data = points.slice(-120); // last N points
  if (data.length < 2) return null;

  const ys = data.map((p) => p.equity);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const range = maxY - minY || 1;

  const toX = (i: number) => pad + (i * (w - pad * 2)) / (data.length - 1);
  const toY = (y: number) => h - pad - ((y - minY) * (h - pad * 2)) / range;

  let d = "";
  data.forEach((p, i) => {
    const x = toX(i);
    const y = toY(p.equity);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });

  const last = data[data.length - 1]?.equity ?? 0;
  const first = data[0]?.equity ?? 0;
  const up = last >= first;

  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 1000 }}>Equity (daily)</div>
        <div className="p-muted" style={{ fontSize: 12 }}>
          {up ? "↗ trend up" : "↘ trend down"} • last {data.length} days
        </div>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        style={{ marginTop: 10, display: "block" }}
      >
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity={0.95}
        />
        {/* baseline */}
        <line
          x1={pad}
          x2={w - pad}
          y1={toY(first)}
          y2={toY(first)}
          stroke="currentColor"
          opacity={0.08}
        />
      </svg>

      <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
        min <b>{minY.toFixed(2)}</b> • max <b>{maxY.toFixed(2)}</b>
      </div>
    </div>
  );
}

function fmtPct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function fmtNum(x: number) {
  // keep simple
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(2)}`;
}

export default function RiskPage() {
  const router = useRouter();
  const { data } = useTradeSession();

  const hasSession = !!data?.rowsParsed && (data.rowsParsed ?? 0) > 0;

  const risk = useMemo(() => {
    if (!hasSession) return null;

    // Prefer positions because they reflect completed positions (usually cleaner than raw fills)
    const positions = (data as any)?.positions ?? [];
    const trades = (data as any)?.trades ?? [];

    const byDayPositions = (data as any)?.byDayPositions ?? [];

    console.log("[risk] byDayPositions length:", byDayPositions?.length);
    console.log("[risk] sample byDayPositions:", byDayPositions?.[0]);

    return computeRiskSummary(
      { positions, trades, byDayPositions },
      { startEquity: 0 },
    );
  }, [hasSession, data]);

  return (
    <main style={{ maxWidth: 1100, margin: "30px auto", padding: 16 }}>
      {/* Header */}
      <div
        className="card"
        style={{ padding: 16, borderRadius: 16, marginBottom: 14 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ lineHeight: 1.05 }}>
            <div style={{ fontSize: 18, fontWeight: 1000 }}>Risk</div>
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Risk Engine v1 (drawdown, win/loss, streaks, stability)
            </div>
          </div>

          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {!hasSession ? (
              <button
                className="btn-primary"
                onClick={() => router.push("/upload")}
              >
                Upload CSV
              </button>
            ) : (
              <>
                <button
                  className="btn-secondary"
                  onClick={() => router.push("/dashboard")}
                >
                  Dashboard
                </button>
                <button
                  className="btn-secondary"
                  onClick={() => router.push("/performance")}
                >
                  Performance
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {!hasSession ? (
        <div className="card" style={{ padding: 16, borderRadius: 16 }}>
          <div style={{ fontWeight: 1000 }}>No session loaded</div>
          <div className="p-muted" style={{ marginTop: 8 }}>
            Upload a Bitget CSV first. Then this page will compute your risk
            metrics automatically.
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              className="btn-primary"
              onClick={() => router.push("/upload")}
            >
              Go to Upload
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Top stats grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              gap: 12,
            }}
          >
            <div style={{ gridColumn: "span 4" }}>
              <StatCard
                title="Max Drawdown"
                value={
                  <span
                    style={{
                      color:
                        (risk?.maxDrawdown ?? 0) < 0
                          ? "#ff6b6b"
                          : "var(--text)",
                    }}
                  >
                    {fmtNum(risk?.maxDrawdown ?? 0)}
                  </span>
                }
                sub={
                  risk?.maxDrawdownPct == null ? (
                    "pct not available"
                  ) : (
                    <>≈ {fmtPct(risk.maxDrawdownPct)} of peak</>
                  )
                }
              />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <StatCard
                title="Win Rate"
                value={fmtPct(risk?.winRate ?? 0)}
                sub={
                  <>
                    Avg win <b>{fmtNum(risk?.avgWin ?? 0)}</b> • Avg loss{" "}
                    <b style={{ color: "#ff6b6b" }}>
                      {fmtNum(risk?.avgLoss ?? 0)}
                    </b>
                  </>
                }
              />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <StatCard
                title="Stability Score (v1)"
                value={<span>{risk?.stabilityScore ?? 0}/100</span>}
                sub={
                  <>
                    Current DD{" "}
                    <b
                      style={{
                        color:
                          (risk?.currentDrawdown ?? 0) < 0
                            ? "#ff6b6b"
                            : "var(--text)",
                      }}
                    >
                      {fmtNum(risk?.currentDrawdown ?? 0)}
                    </b>
                  </>
                }
              />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <StatCard
                title="Win/Loss Ratio"
                value={
                  risk?.winLossRatio == null
                    ? "—"
                    : risk.winLossRatio.toFixed(2)
                }
                sub="avg win ÷ avg loss"
              />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <StatCard
                title="Loss Streak (max)"
                value={risk?.maxLossStreak ?? 0}
                sub={
                  <>
                    current streak <b>{risk?.currentLossStreak ?? 0}</b>
                  </>
                }
              />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <StatCard
                title="Total PnL"
                value={
                  <span
                    style={{
                      color: (risk?.totalPnl ?? 0) >= 0 ? "#36d399" : "#ff6b6b",
                    }}
                  >
                    {fmtNum(risk?.totalPnl ?? 0)}
                  </span>
                }
                sub="sum of positions/trades"
              />
            </div>
          </div>

          {/* Equity chart */}
          <div style={{ marginTop: 12 }}>
            <MiniEquityChart points={risk?.equity ?? []} />
          </div>

          {/* Next actions (v1 guidance) */}
          <div
            className="card"
            style={{ padding: 16, borderRadius: 16, marginTop: 12 }}
          >
            <div style={{ fontWeight: 1000 }}>Next actions (v1)</div>
            <div className="p-muted" style={{ marginTop: 8, lineHeight: 1.4 }}>
              This is the first “Risk OS” layer. Next we’ll add:
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                <li>Drawdown period detection (start/end, recovery time)</li>
                <li>Overtrading & “loss-streak escalation” signals</li>
                <li>Rules: max daily loss / max trades per day</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

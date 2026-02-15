"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { computeRiskSummary } from "@/lib/risk";
import { DEFAULT_CCY, fmtMoney, fmtPercent } from "@/lib/format";

function fmtMoney2(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
function fmtPct1(x: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(x);
}

function fmtDays(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n} day${n === 1 ? "" : "s"}`;
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

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

function fmtMoneyLike(x: number, ccy?: string) {
  const sign = x > 0 ? "+" : "";
  const v = `${sign}${x.toFixed(2)}`;
  return ccy ? `${v} ${ccy}` : v;
}

function fmtPctOrDash(x: number | null | undefined) {
  if (x == null || !Number.isFinite(x)) return "—";
  return fmtPct(x);
}

function fmtNum(x: number) {
  // keep simple
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(2)}`;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function DrawdownMiniChart({
  equity,
  height = 140,
}: {
  equity: { t: string; equity: number }[];
  height?: number;
}) {
  const width = 920; // viewBox width (responsive via 100% width)

  const vals = (equity ?? [])
    .map((p) => Number(p.equity))
    .filter((n) => Number.isFinite(n));
  if (vals.length < 2) {
    return (
      <div className="card" style={{ padding: 14 }}>
        <div className="p-muted">Not enough data for drawdown chart.</div>
      </div>
    );
  }

  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const span = Math.max(1e-9, maxV - minV);

  // build equity line path
  const stepX = width / (vals.length - 1);
  const pts = vals.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - minV) / span) * height;
    return { x, y };
  });

  const equityPath =
    "M " + pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ");

  // compute running peak for drawdown fill
  let peak = -Infinity;
  const peakVals: number[] = [];
  for (const v of vals) {
    if (v > peak) peak = v;
    peakVals.push(peak);
  }

  const peakPts = peakVals.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - minV) / span) * height;
    return { x, y };
  });

  const peakPath =
    "M " +
    peakPts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ");

  // drawdown area between equity and peak (only where equity < peak)
  // we do a simple closed path: peak line forward + equity line backward
  const areaPath =
    "M " +
    peakPts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ") +
    " L " +
    pts
      .slice()
      .reverse()
      .map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
      .join(" L ") +
    " Z";

  // find max drawdown point index (lowest equity vs peak)
  let maxDD = 0;
  let maxIdx = 0;
  for (let i = 0; i < vals.length; i++) {
    const dd = vals[i] - peakVals[i]; // <= 0
    if (dd < maxDD) {
      maxDD = dd;
      maxIdx = i;
    }
  }

  const marker = pts[maxIdx];
  const markerPeak = peakPts[maxIdx];

  return (
    <div
      className="card"
      style={{
        padding: 14,
        border: "1px solid var(--border)",
        borderRadius: 14,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 900 }}>Drawdown Overview</div>
        <div className="p-muted" style={{ fontSize: 12 }}>
          Equity vs Peak (visual)
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{ width: "100%", height: "auto", display: "block" }}
        >
          {/* background */}
          <rect
            x="0"
            y="0"
            width={width}
            height={height}
            fill="rgba(255,255,255,0.01)"
          />

          {/* drawdown fill */}
          <path d={areaPath} fill="rgba(251,113,133,0.10)" stroke="none" />

          {/* peak line */}
          <path
            d={peakPath}
            fill="none"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="2"
          />

          {/* equity line */}
          <path
            d={equityPath}
            fill="none"
            stroke="rgba(54,211,153,0.85)"
            strokeWidth="3"
          />

          {/* marker line (peak -> equity) */}
          <line
            x1={marker.x}
            y1={markerPeak.y}
            x2={marker.x}
            y2={marker.y}
            stroke="rgba(251,113,133,0.85)"
            strokeWidth="2"
            strokeDasharray="6 6"
          />

          {/* marker dot */}
          <circle
            cx={marker.x}
            cy={marker.y}
            r="5"
            fill="rgba(251,113,133,0.95)"
          />
        </svg>
      </div>

      <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
        Green = equity · White = peak · Red area = drawdown
      </div>
    </div>
  );
}

function MiniDrawdownChart({
  points,
}: {
  points: { t: string; equity: number }[];
}) {
  const w = 520;
  const h = 120;
  const pad = 10;

  const data = points.slice(-120);
  if (data.length < 2) return null;

  // build drawdown series (negative or 0)
  let peak = -Infinity;
  const dd = data.map((p) => {
    if (p.equity > peak) peak = p.equity;
    return p.equity - peak; // <= 0
  });

  const minY = Math.min(...dd); // most negative
  const maxY = 0; // always baseline at 0
  const range = maxY - minY || 1;

  const toX = (i: number) => pad + (i * (w - pad * 2)) / (data.length - 1);
  const toY = (y: number) => h - pad - ((y - minY) * (h - pad * 2)) / range;

  let path = "";
  dd.forEach((v, i) => {
    const x = toX(i);
    const y = toY(v);
    path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });

  const worst = minY; // negative
  const last = dd[dd.length - 1] ?? 0;

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
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 1000 }}>Drawdown (daily)</div>
        <div className="p-muted" style={{ fontSize: 12 }}>
          worst {worst.toFixed(2)} • current {last.toFixed(2)}
        </div>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        style={{ marginTop: 10, display: "block" }}
      >
        {/* 0 baseline */}
        <line
          x1={pad}
          x2={w - pad}
          y1={toY(0)}
          y2={toY(0)}
          stroke="currentColor"
          opacity={0.12}
        />

        {/* area fill (subtle) */}
        <path
          d={`${path} L ${toX(dd.length - 1)} ${toY(0)} L ${toX(0)} ${toY(0)} Z`}
          fill="currentColor"
          opacity={0.06}
        />

        {/* dd line */}
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity={0.95}
        />
      </svg>

      <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
        Drawdown is ≤ 0. Closer to 0 = healthier.
      </div>
    </div>
  );
}

function scoreTone(score: number) {
  if (score >= 75) return "GOOD";
  if (score >= 50) return "OK";
  return "BAD";
}

function ScoreBadge({ score }: { score: number }) {
  const tone = scoreTone(score);

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    fontWeight: 1000,
    fontSize: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      tone === "GOOD"
        ? "rgba(54,211,153,0.14)"
        : tone === "OK"
          ? "rgba(250,204,21,0.14)"
          : "rgba(251,113,133,0.14)",
  };

  const dotStyle: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: 999,
    background:
      tone === "GOOD"
        ? "rgba(54,211,153,0.95)"
        : tone === "OK"
          ? "rgba(250,204,21,0.95)"
          : "rgba(251,113,133,0.95)",
    boxShadow: "0 0 0 3px rgba(255,255,255,0.06)",
  };

  const label =
    tone === "GOOD" ? "Healthy" : tone === "OK" ? "Needs work" : "High risk";

  return (
    <span
      style={style}
      title="Rule-based score v1 (drawdown, streaks, win/loss)"
    >
      <span style={dotStyle} />
      <span>Stability Score:</span>
      <span style={{ fontSize: 13 }}>{score}/100</span>
      <span style={{ opacity: 0.8 }}>· {label}</span>
    </span>
  );
}

function sevPill(sev: "LOW" | "MED" | "HIGH") {
  const bg =
    sev === "HIGH"
      ? "rgba(251,113,133,0.14)"
      : sev === "MED"
        ? "rgba(250,204,21,0.14)"
        : "rgba(54,211,153,0.14)";
  const border =
    sev === "HIGH"
      ? "rgba(251,113,133,0.28)"
      : sev === "MED"
        ? "rgba(250,204,21,0.28)"
        : "rgba(54,211,153,0.28)";

  return (
    <span
      style={{
        display: "inline-flex",
        padding: "6px 10px",
        borderRadius: 999,
        fontWeight: 1000,
        fontSize: 11,
        border: `1px solid ${border}`,
        background: bg,
        whiteSpace: "nowrap",
      }}
    >
      {sev}
    </span>
  );
}

export default function RiskPage() {
  const router = useRouter();
  const { data } = useTradeSession();
  const ccy = (data as any)?.ccy ?? "USDT";

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

  const periods = risk?.drawdownPeriods ?? [];
  const active = risk?.currentDrawdownPeriod ?? null;

  const last3 = periods.slice(-3).reverse(); // show newest first

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
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            {hasSession && risk ? (
              <ScoreBadge score={risk.stabilityScore ?? 0} />
            ) : null}

            <span
              className="badge"
              style={{
                borderColor:
                  risk?.riskMode === "CRITICAL"
                    ? "rgba(251,113,133,0.35)"
                    : risk?.riskMode === "RECOVERY"
                      ? "rgba(251,191,36,0.35)"
                      : "rgba(54,211,153,0.25)",
                background:
                  risk?.riskMode === "CRITICAL"
                    ? "rgba(251,113,133,0.12)"
                    : risk?.riskMode === "RECOVERY"
                      ? "rgba(251,191,36,0.10)"
                      : "rgba(54,211,153,0.10)",
              }}
            >
              Mode: <b>{risk?.riskMode ?? "—"}</b> · Trading{" "}
              <b>{risk?.tradingAllowed ?? "—"}</b>
            </span>

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
                    {fmtMoney(risk?.maxDrawdown ?? 0)}
                  </span>
                }
                sub={
                  risk?.maxDrawdownPct != null ? (
                    <>≈ {fmtPct(risk.maxDrawdownPct)} of peak</>
                  ) : risk?.currentDrawdownPct != null ? (
                    <>current DD ≈ {fmtPct(risk.currentDrawdownPct)}</>
                  ) : (
                    "—"
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
                    Avg win <b>{fmtMoney(risk?.avgWin ?? 0)}</b> • Avg loss{" "}
                    <b style={{ color: "#ff6b6b" }}>
                      {fmtMoney(risk?.avgLoss ?? 0)}
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
                      {fmtMoney(risk?.currentDrawdown ?? 0)}
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
                    {fmtMoney(risk?.totalPnl ?? 0)}
                  </span>
                }
                sub="sum of positions/trades"
              />
            </div>

            <div style={{ gridColumn: "span 4" }}>
              <StatCard
                title="Distance to Break-even"
                value={fmtMoneyLike(risk?.distanceToBreakeven ?? 0, ccy)}
                sub={
                  <>
                    Required return{" "}
                    <b>{fmtPctOrDash(risk?.requiredReturnPct ?? null)}</b>
                  </>
                }
              />
            </div>
          </div>

          {risk?.drivers?.length ? (
            <div
              className="card"
              style={{ padding: 16, borderRadius: 16, marginTop: 12 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontWeight: 1000 }}>Top Risk Drivers</div>
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Why your Stability Score looks like this
                </div>
              </div>

              <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                {risk.drivers.slice(0, 3).map((d: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.02)",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 1000 }}>{d.label}</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 4, fontSize: 12 }}
                      >
                        {d.detail}
                      </div>
                    </div>
                    {sevPill(d.severity)}
                  </div>
                ))}
              </div>

              <div className="p-muted" style={{ marginTop: 12, fontSize: 12 }}>
                Next: we can add “1 recommended rule” (e.g. stop after X losses
                / max daily loss).
              </div>
            </div>
          ) : null}

          {/* Risk Score v1 */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(12, 1fr)",
              gap: 12,
              marginTop: 12,
            }}
          >
            <div style={{ gridColumn: "span 5" }}>
              <div
                className="card"
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div
                  className="p-muted"
                  style={{ fontSize: 12, fontWeight: 900 }}
                >
                  Tradevion Risk Score (v1)
                </div>

                <div
                  style={{
                    marginTop: 8,
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                  }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: 18,
                      display: "grid",
                      placeItems: "center",
                      fontWeight: 1000,
                      fontSize: 22,
                      border: "1px solid rgba(255,255,255,0.10)",
                      background:
                        risk?.riskBand === "stable"
                          ? "rgba(54,211,153,0.14)"
                          : risk?.riskBand === "risky"
                            ? "rgba(255,193,7,0.12)"
                            : "rgba(255,107,107,0.12)",
                      color:
                        risk?.riskBand === "stable"
                          ? "#36d399"
                          : risk?.riskBand === "risky"
                            ? "#f5c542"
                            : "#ff6b6b",
                    }}
                  >
                    {risk?.riskScore ?? 0}
                  </div>

                  <div style={{ lineHeight: 1.2 }}>
                    <div style={{ fontWeight: 1000, fontSize: 14 }}>
                      {risk?.riskBand === "stable"
                        ? "Stable"
                        : risk?.riskBand === "risky"
                          ? "Risky"
                          : "Dangerous"}
                    </div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      Rule-based score from drawdown, streaks, inconsistency,
                      overtrading.
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <div
                    className="p-muted"
                    style={{ fontSize: 12, fontWeight: 900 }}
                  >
                    Top penalties
                  </div>

                  {risk?.breakdown?.length ? (
                    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                      {risk.breakdown.slice(0, 4).map((b: any) => (
                        <div
                          key={b.key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 10,
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.03)",
                          }}
                        >
                          <div
                            style={{ display: "flex", flexDirection: "column" }}
                          >
                            <div style={{ fontWeight: 900, fontSize: 12 }}>
                              {b.label}
                            </div>
                            <div className="p-muted" style={{ fontSize: 12 }}>
                              {b.value}
                            </div>
                          </div>
                          <div style={{ fontWeight: 1000, color: "#ff6b6b" }}>
                            -{b.penalty}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="p-muted"
                      style={{ marginTop: 8, fontSize: 12 }}
                    >
                      No penalties detected. Nice.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div style={{ gridColumn: "span 7" }}>
              <div
                className="card"
                style={{
                  padding: 16,
                  borderRadius: 16,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ fontWeight: 1000 }}>What to do next (v1)</div>
                <div
                  className="p-muted"
                  style={{ marginTop: 8, lineHeight: 1.45 }}
                >
                  Based on your score, these are the fastest fixes:
                  <ul style={{ marginTop: 10, paddingLeft: 18 }}>
                    <li>
                      <b>Drawdown control:</b> reduce size when DD grows (DD
                      &gt; 10% ⇒ cut risk).
                    </li>
                    <li>
                      <b>Streak rule:</b> stop after 3 consecutive losses
                      (cooldown).
                    </li>
                    <li>
                      <b>Consistency:</b> keep trade size stable (avoid big size
                      jumps).
                    </li>
                    <li>
                      <b>Overtrading:</b> cap trades/day (e.g. max 5–10).
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div
            className="card"
            style={{ padding: 16, borderRadius: 16, marginTop: 12 }}
          >
            <div style={{ fontWeight: 1000 }}>Why this score</div>
            <div className="p-muted" style={{ marginTop: 8 }}>
              {(risk as any)?.reasons?.length ? (
                <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                  {(risk as any).reasons.map((r: string, i: number) => (
                    <li key={i}>{r}</li>
                  ))}
                </ul>
              ) : (
                "—"
              )}
            </div>

            <div
              style={{
                height: 1,
                background: "var(--border)",
                margin: "12px 0",
              }}
            />

            <div style={{ fontWeight: 1000 }}>3 rules to improve</div>
            <div className="p-muted" style={{ marginTop: 8 }}>
              {(risk as any)?.actions?.length ? (
                <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                  {(risk as any).actions.map((a: string, i: number) => (
                    <li key={i}>{a}</li>
                  ))}
                </ol>
              ) : (
                "—"
              )}
            </div>
          </div>

          <div
            className="card"
            style={{ padding: 16, borderRadius: 16, marginTop: 12 }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <div style={{ fontWeight: 1000 }}>Drawdown Phases</div>
              <div className="p-muted" style={{ fontSize: 12 }}>
                {periods.length} total
              </div>
            </div>

            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              A drawdown phase starts at a new peak → ends when equity recovers
              to that peak.
            </div>

            {/* Active phase */}
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                {active ? "Current drawdown" : "No active drawdown"}
              </div>

              {active ? (
                <div
                  className="p-muted"
                  style={{ fontSize: 12, lineHeight: 1.5 }}
                >
                  Started: <b>{active.start}</b> • Trough:{" "}
                  <b>{active.trough}</b> • Depth:{" "}
                  <b style={{ color: "#ff6b6b" }}>{fmtMoney(active.depth)}</b>{" "}
                  {active.depthPct != null ? (
                    <>
                      (≈{" "}
                      <b style={{ color: "#ff6b6b" }}>
                        {fmtPct(active.depthPct)}
                      </b>
                      )
                    </>
                  ) : null}
                  <br />
                  Days in DD: <b>{fmtDays(active.durationDays)}</b>
                  <br />
                  Days to trough: <b>{fmtDays(active.timeToTroughDays)}</b>
                  <br />
                  Recovery days:{" "}
                  <b>
                    {active.recoveryDays == null
                      ? "—"
                      : fmtDays(active.recoveryDays)}
                  </b>
                </div>
              ) : (
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Your equity is currently at (or above) its last peak.
                </div>
              )}
            </div>

            {/* Last phases */}
            {last3.length ? (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {last3.map((p, idx) => (
                  <div
                    key={`${p.start}-${idx}`}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid var(--border)",
                      background: "rgba(255,255,255,0.02)",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                      <div style={{ fontWeight: 900 }}>
                        {p.start} → {p.recovery ?? "not recovered"}
                      </div>
                      <div className="p-muted">
                        Trough: <b>{p.trough}</b> • Depth:{" "}
                        <b style={{ color: "#ff6b6b" }}>{fmtMoney(p.depth)}</b>{" "}
                        {p.depthPct != null ? (
                          <>
                            (≈{" "}
                            <b style={{ color: "#ff6b6b" }}>
                              {fmtPct(p.depthPct)}
                            </b>
                            )
                          </>
                        ) : null}
                      </div>
                    </div>

                    <div
                      className="p-muted"
                      style={{ fontSize: 12, textAlign: "right" }}
                    >
                      DD days: <b>{fmtDays(p.daysInDrawdown)}</b>
                      <br />
                      Recovery: <b>{fmtDays(p.daysToRecover)}</b>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-muted" style={{ marginTop: 12, fontSize: 12 }}>
                Not enough history yet to detect drawdown phases.
              </div>
            )}
          </div>

          {/* Equity chart */}
          {/* Charts (under KPIs) */}
          <div
            style={{
              marginTop: 12,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <MiniDrawdownChart points={risk?.equity ?? []} />
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

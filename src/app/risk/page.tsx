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

function Section({
  title,
  right,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
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
        <div style={{ fontWeight: 1000 }}>{title}</div>
        {right ? <div>{right}</div> : null}
      </div>

      {subtitle ? (
        <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
          {subtitle}
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Disclosure({
  title,
  subtitle,
  right,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="card"
      style={{ padding: 0, borderRadius: 16, marginTop: 12 }}
    >
      <summary
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: 16,
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 1000 }}>{title}</div>
          {subtitle ? (
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {right ? <div>{right}</div> : null}
          <span className="p-muted" style={{ fontSize: 12, opacity: 0.8 }}>
            toggle
          </span>
        </div>
      </summary>

      <div style={{ padding: "0 16px 16px" }}>{children}</div>
    </details>
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
  const alerts = (risk as any)?.alerts ?? [];
  const modeExplanation = (risk as any)?.modeExplanation ?? null;

  return (
    <main style={{ maxWidth: 1100, margin: "30px auto", padding: 16 }}>
      {/* ===== Header ===== */}
      {/*
      <div
        className="card"
        style={{ padding: 16, borderRadius: 16, marginBottom: 14 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
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
              justifyContent: "flex-end",
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

      */}

      {/* ===== Empty State ===== */}
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
          {/* ===== 1) Current State (Hero) ===== */}
          <Section
            title="Current State"
            subtitle="Your status right now — the minimum you need to make the next decision."
            right={
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
            }
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(12, 1fr)",
                gap: 12,
              }}
            >
              <div style={{ gridColumn: "span 3" }}>
                <StatCard
                  title="Stability Score"
                  value={<span>{risk?.stabilityScore ?? 0}/100</span>}
                  sub={
                    <span className="p-muted">
                      {scoreTone(risk?.stabilityScore ?? 0) === "GOOD"
                        ? "Healthy"
                        : scoreTone(risk?.stabilityScore ?? 0) === "OK"
                          ? "Needs work"
                          : "High risk"}
                    </span>
                  }
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
                <StatCard
                  title="Current Drawdown"
                  value={
                    <span
                      style={{
                        color:
                          (risk?.currentDrawdown ?? 0) < 0
                            ? "#ff6b6b"
                            : "var(--text)",
                      }}
                    >
                      {fmtMoney(risk?.currentDrawdown ?? 0)}
                    </span>
                  }
                  sub={
                    <>
                      from peak{" "}
                      <b>
                        {risk?.currentDrawdownPct != null
                          ? fmtPct(risk.currentDrawdownPct)
                          : "—"}
                      </b>
                    </>
                  }
                />
              </div>

              <div style={{ gridColumn: "span 3" }}>
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

              <div style={{ gridColumn: "span 3" }}>
                <StatCard
                  title="Max Daily Loss (guide)"
                  value={
                    <span
                      className={pnlClass(
                        (risk as any)?.daily?.maxDailyLoss ?? 0,
                      )}
                    >
                      {fmtMoney((risk as any)?.daily?.maxDailyLoss ?? 0)}
                    </span>
                  }
                  sub="Worst day in dataset"
                />
              </div>
            </div>
          </Section>

          {/* ===== 2) Why (Diagnosis) ===== */}
          <Section
            title="Why (Diagnosis)"
            subtitle="The 3 biggest reasons behind your current mode — so you know what to fix first."
          >
            {/* Row 1: Alerts + Why this mode */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(12, 1fr)",
                gap: 12,
              }}
            >
              {/* Alerts */}
              <div style={{ gridColumn: "span 6" }}>
                <div
                  className="card"
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.02)",
                    height: "100%",
                  }}
                >
                  <div style={{ fontWeight: 1000 }}>Top signals</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    The biggest current risk signals
                  </div>

                  {alerts.length ? (
                    <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                      {alerts.slice(0, 3).map((a: any) => (
                        <div
                          key={a.key}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.02)",
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900, fontSize: 13 }}>
                              {a.title}
                            </div>
                            <div
                              className="p-muted"
                              style={{
                                marginTop: 4,
                                fontSize: 12,
                                lineHeight: 1.4,
                              }}
                            >
                              {a.detail}
                            </div>
                          </div>

                          <span
                            className="badge"
                            style={{
                              borderColor:
                                a.severity === "CRITICAL"
                                  ? "rgba(251,113,133,0.35)"
                                  : a.severity === "WARN"
                                    ? "rgba(250,204,21,0.35)"
                                    : "rgba(96,165,250,0.30)",
                              background:
                                a.severity === "CRITICAL"
                                  ? "rgba(251,113,133,0.12)"
                                  : a.severity === "WARN"
                                    ? "rgba(250,204,21,0.10)"
                                    : "rgba(96,165,250,0.10)",
                              whiteSpace: "nowrap",
                              flexShrink: 0,
                            }}
                          >
                            {a.severity}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="p-muted"
                      style={{ marginTop: 12, fontSize: 12 }}
                    >
                      No alerts. You’re in a clean state.
                    </div>
                  )}
                </div>
              </div>

              {/* Why this mode */}
              <div style={{ gridColumn: "span 6" }}>
                <div
                  className="card"
                  style={{
                    padding: 16,
                    borderRadius: 16,
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.02)",
                    height: "100%",
                  }}
                >
                  <div style={{ fontWeight: 1000 }}>Why this mode</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Explanation of your current Risk Mode decision
                  </div>

                  {modeExplanation ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 900, fontSize: 13 }}>
                        {modeExplanation.title}
                      </div>

                      {modeExplanation.bullets?.length ? (
                        <ul
                          style={{
                            marginTop: 10,
                            paddingLeft: 18,
                            lineHeight: 1.5,
                          }}
                        >
                          {modeExplanation.bullets
                            .slice(0, 4)
                            .map((b: string, i: number) => (
                              <li
                                key={i}
                                className="p-muted"
                                style={{ fontSize: 12 }}
                              >
                                {b}
                              </li>
                            ))}
                        </ul>
                      ) : (
                        <div
                          className="p-muted"
                          style={{ marginTop: 10, fontSize: 12 }}
                        >
                          —
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      className="p-muted"
                      style={{ marginTop: 12, fontSize: 12 }}
                    >
                      —
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Row 2: Root causes */}
            {((risk as any)?.rootCauses ?? []).length ? (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                  Root causes
                </div>

                <div style={{ display: "grid", gap: 10 }}>
                  {((risk as any)?.rootCauses ?? [])
                    .slice(0, 3)
                    .map((c: any) => (
                      <div
                        key={c.key}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.02)",
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 900 }}>{c.title}</div>
                          <div
                            className="p-muted"
                            style={{
                              marginTop: 6,
                              fontSize: 12,
                              lineHeight: 1.45,
                            }}
                          >
                            <div>
                              <b>Evidence:</b> {c.evidence}
                            </div>
                            <div style={{ marginTop: 4 }}>
                              <b>Impact:</b> {c.impactHint}
                            </div>
                          </div>
                        </div>
                        <div style={{ flexShrink: 0 }}>
                          {sevPill(c.severity)}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </Section>

          {/* ===== 2) At a glance (moved down) ===== */}
          <Section
            title="At a glance"
            subtitle="Core stability + drawdown + edge metrics. Same values as before — just organized."
          >
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
                        color:
                          (risk?.totalPnl ?? 0) >= 0 ? "#36d399" : "#ff6b6b",
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

            {/* Charts directly under KPIs (same charts, better placement) */}
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
          </Section>

          {/* ===== 4) Plan ===== */}
          <Section
            title="Plan"
            subtitle="Concrete actions for your next session — rules, limits and recovery steps."
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(12, 1fr)",
                gap: 12,
              }}
            >
              {/* Best Move + Rules now */}
              <div style={{ gridColumn: "span 6" }}>
                <div className="card" style={{ padding: 16, borderRadius: 16 }}>
                  <div style={{ fontWeight: 1000 }}>Best Move</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Highest-impact fix based on your data
                  </div>

                  {(risk as any)?.bestMove ? (
                    <div style={{ marginTop: 12 }}>
                      <div style={{ fontWeight: 900 }}>
                        {(risk as any).bestMove.title}
                      </div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12, lineHeight: 1.45 }}
                      >
                        {(risk as any).bestMove.detail}
                      </div>
                    </div>
                  ) : (
                    <div
                      className="p-muted"
                      style={{ marginTop: 12, fontSize: 12 }}
                    >
                      —
                    </div>
                  )}

                  <div
                    style={{
                      height: 1,
                      background: "var(--border)",
                      margin: "14px 0",
                    }}
                  />

                  <div style={{ fontWeight: 1000 }}>Rules now</div>
                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    {((risk as any)?.rulesNow ?? [])
                      .slice(0, 4)
                      .map((r: any) => (
                        <div
                          key={r.key}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <div style={{ fontWeight: 900, fontSize: 13 }}>
                              {r.label}
                            </div>
                            <div style={{ fontWeight: 1000 }}>{r.value}</div>
                          </div>
                          <div
                            className="p-muted"
                            style={{
                              marginTop: 6,
                              fontSize: 12,
                              lineHeight: 1.4,
                            }}
                          >
                            {r.why}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>

              {/* Next Session Plan */}
              <div style={{ gridColumn: "span 6" }}>
                <div className="card" style={{ padding: 16, borderRadius: 16 }}>
                  <div style={{ fontWeight: 1000 }}>Next Session Plan</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    A simple 3-step operating plan
                  </div>

                  <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                    {((risk as any)?.planNextSession ?? [])
                      .slice(0, 3)
                      .map((s: any, idx: number) => (
                        <div
                          key={s.key ?? idx}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "baseline",
                              gap: 10,
                            }}
                          >
                            <div
                              className="badge"
                              style={{ background: "rgba(255,255,255,0.05)" }}
                            >
                              Step {idx + 1}
                            </div>
                            <div style={{ fontWeight: 900 }}>{s.title}</div>
                          </div>
                          <div
                            className="p-muted"
                            style={{
                              marginTop: 6,
                              fontSize: 12,
                              lineHeight: 1.45,
                            }}
                          >
                            {s.detail}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Countermeasures (full width) */}
            {((risk as any)?.countermeasures ?? []).length ? (
              <div
                className="card"
                style={{ padding: 16, borderRadius: 16, marginTop: 12 }}
              >
                <div style={{ fontWeight: 1000 }}>Countermeasures</div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Concrete actions tailored to your causes
                </div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {((risk as any)?.countermeasures ?? [])
                    .slice(0, 3)
                    .map((m: any) => (
                      <div
                        key={m.key}
                        style={{
                          padding: "12px 12px",
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.02)",
                        }}
                      >
                        <div style={{ fontWeight: 900 }}>{m.title}</div>
                        <ul
                          style={{
                            marginTop: 8,
                            paddingLeft: 18,
                            lineHeight: 1.5,
                          }}
                        >
                          {(m.steps ?? []).map((s: string, i: number) => (
                            <li
                              key={i}
                              className="p-muted"
                              style={{ fontSize: 12 }}
                            >
                              {s}
                            </li>
                          ))}
                        </ul>
                        <div
                          className="p-muted"
                          style={{ marginTop: 8, fontSize: 12 }}
                        >
                          <b>Watch:</b> {m.metricToWatch}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            ) : null}

            {/* Trading Policy + Checklist (optional, collapsed later in Step 4) */}
            {risk?.policy ? (
              <div
                className="card"
                style={{ padding: 16, borderRadius: 16, marginTop: 12 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontWeight: 1000 }}>Today’s Trading Policy</div>
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    Mode: <b>{risk.policy.mode}</b> · Allowed:{" "}
                    <b>{risk.policy.allowed}</b>
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "repeat(12, 1fr)",
                    gap: 12,
                  }}
                >
                  <div style={{ gridColumn: "span 3" }}>
                    <StatCard
                      title="Max Trades Today"
                      value={<span>{risk.policy.maxTradesToday}</span>}
                    />
                  </div>
                  <div style={{ gridColumn: "span 3" }}>
                    <StatCard
                      title="Max Daily Loss"
                      value={
                        <span className={pnlClass(risk.policy.maxDailyLoss)}>
                          {fmtMoney(risk.policy.maxDailyLoss)}
                        </span>
                      }
                      sub="Hard stop"
                    />
                  </div>
                  <div style={{ gridColumn: "span 3" }}>
                    <StatCard
                      title="Size Multiplier"
                      value={
                        <span>
                          {Math.round(risk.policy.sizeMultiplier * 100)}%
                        </span>
                      }
                      sub="relative to normal"
                    />
                  </div>
                  <div style={{ gridColumn: "span 3" }}>
                    <StatCard
                      title="Cooldown"
                      value={<span>{risk.policy.cooldownMinutes}m</span>}
                      sub={`after ${risk.policy.cooldownAfterLosses} losses`}
                    />
                  </div>
                </div>

                <div
                  className="p-muted"
                  style={{ marginTop: 10, fontSize: 12 }}
                >
                  <b>Focus:</b>
                  <ul
                    style={{ marginTop: 6, paddingLeft: 18, lineHeight: 1.5 }}
                  >
                    {(risk.policy.focus ?? []).map((x: string, i: number) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}

            {risk?.checklist ? (
              <div
                className="card"
                style={{ padding: 16, borderRadius: 16, marginTop: 12 }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ fontWeight: 1000 }}>Next Session Checklist</div>
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    {risk.checklist.headline}
                  </div>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gridTemplateColumns: "repeat(12, 1fr)",
                    gap: 12,
                  }}
                >
                  <div style={{ gridColumn: "span 4" }}>
                    <div
                      style={{ fontWeight: 900, fontSize: 12, opacity: 0.9 }}
                    >
                      DO
                    </div>
                    <ul
                      className="p-muted"
                      style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.6 }}
                    >
                      {risk.checklist.do.map((x: string, i: number) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ gridColumn: "span 4" }}>
                    <div
                      style={{ fontWeight: 900, fontSize: 12, opacity: 0.9 }}
                    >
                      DON’T
                    </div>
                    <ul
                      className="p-muted"
                      style={{ marginTop: 8, paddingLeft: 18, lineHeight: 1.6 }}
                    >
                      {risk.checklist.dont.map((x: string, i: number) => (
                        <li key={i}>{x}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ gridColumn: "span 4" }}>
                    <div
                      style={{ fontWeight: 900, fontSize: 12, opacity: 0.9 }}
                    >
                      IF / THEN
                    </div>
                    <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
                      {risk.checklist.ifThen.map((r: any, i: number) => (
                        <div
                          key={i}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div
                            className="p-muted"
                            style={{ fontSize: 12, lineHeight: 1.5 }}
                          >
                            <b>IF</b> {r.if}
                            <br />
                            <b>THEN</b> {r.then}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </Section>

          {/* ===== Details (deep dive) ===== */}
          <Section
            title="Details"
            subtitle="More analytics and explanations — open only what you need."
          >
            {/* 1) Drivers */}
            {risk?.drivers?.length ? (
              <Disclosure
                title="Top Risk Drivers"
                subtitle="Why your Stability Score looks like this"
                defaultOpen={false}
              >
                <div style={{ display: "grid", gap: 10 }}>
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
              </Disclosure>
            ) : null}

            {/* 2) Risk Score */}
            <Disclosure
              title="Tradevion Risk Score (v1)"
              subtitle="Penalties and score calculation overview"
              defaultOpen={false}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(12, 1fr)",
                  gap: 12,
                }}
              >
                <div style={{ gridColumn: "span 5" }}>
                  {/* paste your existing Risk Score card here */}
                </div>

                <div style={{ gridColumn: "span 7" }}>
                  {/* paste your existing What to do next (v1) card here */}
                </div>
              </div>
            </Disclosure>

            {/* 3) Explanation */}
            <Disclosure
              title="Why this score"
              subtitle="Reasons + 3 rules to improve"
              defaultOpen={false}
            >
              {/* paste your existing 'Why this score' Section content here */}
            </Disclosure>

            {/* 4) Drawdown phases */}
            <Disclosure
              title="Drawdown Phases"
              subtitle="Peak → trough → recovery timeline"
              right={
                <span className="p-muted" style={{ fontSize: 12 }}>
                  {periods.length} total
                </span>
              }
              defaultOpen={false}
            >
              {/* paste your existing Drawdown Phases Section content here */}
            </Disclosure>

            {/* 5) Roadmap */}
            <Disclosure
              title="Next actions (v1)"
              subtitle="Roadmap of what comes next"
              defaultOpen={false}
            >
              {/* paste your existing Roadmap block here */}
            </Disclosure>
          </Section>

          {/* ===== 3) Scoring + Guidance ===== */}
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

          {/* ===== 4) Explanation ===== */}
          <Section title="Why this score">
            <div className="p-muted" style={{ lineHeight: 1.5 }}>
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
          </Section>

          {/* ===== 5) Drawdown phases ===== */}
          <Section
            title="Drawdown Phases"
            right={
              <div className="p-muted" style={{ fontSize: 12 }}>
                {periods.length} total
              </div>
            }
            subtitle="A drawdown phase starts at a new peak → ends when equity recovers to that peak."
          >
            {/* Active phase */}
            <div
              style={{
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
                      DD days: <b>{fmtDays(p.durationDays)}</b>
                      <br />
                      Recovery:{" "}
                      <b>
                        {p.recoveryDays == null ? "—" : fmtDays(p.recoveryDays)}
                      </b>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-muted" style={{ marginTop: 12, fontSize: 12 }}>
                Not enough history yet to detect drawdown phases.
              </div>
            )}
          </Section>

          {/* ===== 6) Roadmap block (unchanged content) ===== */}
          <Section title="Next actions (v1)">
            <div className="p-muted" style={{ lineHeight: 1.4 }}>
              This is the first “Risk OS” layer. Next we’ll add:
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                <li>Drawdown period detection (start/end, recovery time)</li>
                <li>Overtrading & “loss-streak escalation” signals</li>
                <li>Rules: max daily loss / max trades per day</li>
              </ul>
            </div>
          </Section>
        </>
      )}
    </main>
  );
}

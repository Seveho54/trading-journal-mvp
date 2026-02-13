"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "./providers/TradeSessionProvider";

function StepCard({
  step,
  title,
  desc,
  actions,
  done,
}: {
  step: number;
  title: string;
  desc: React.ReactNode;
  actions?: React.ReactNode;
  done?: boolean;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 16,
        border: "1px solid var(--border)",
        borderRadius: 14,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            fontWeight: 900,
            border: "1px solid var(--border)",
            background: done
              ? "rgba(54,211,153,0.12)"
              : "rgba(255,255,255,0.03)",
          }}
        >
          {done ? "✓" : step}
        </div>
        <div style={{ fontWeight: 1000 }}>{title}</div>
      </div>

      <div className="p-muted" style={{ marginTop: 8, lineHeight: 1.4 }}>
        {desc}
      </div>

      {actions ? (
        <div
          style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li style={{ margin: "6px 0" }}>
      <span style={{ color: "var(--text)" }}>{children}</span>
    </li>
  );
}

function CodePath({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily:
          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        fontSize: 12,
        padding: "2px 6px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.03)",
        color: "var(--text)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.03)",
        minWidth: 140,
      }}
    >
      <div className="p-muted" style={{ fontSize: 11 }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontWeight: 1000 }}>{value}</div>
    </div>
  );
}

export default function HomeTutorialPage() {
  const router = useRouter();
  const { data, isPro } = useTradeSession();

  const hasData = !!data?.rowsParsed && (data.rowsParsed ?? 0) > 0;
  const hasPositions = (data?.positions?.length ?? 0) > 0;
  const hasByDay = ((data as any)?.byDayPositions?.length ?? 0) > 0;

  const nextBestRoute = useMemo(() => {
    // First-time user: start with upload.
    if (!hasData) return "/upload";
    // If parsed + daily data exists, Overview/Dashboard is best.
    if (hasByDay) return "/overview";
    // Otherwise: Trades list is safe.
    return "/trades";
  }, [hasData, hasByDay]);

  const sessionSummary = useMemo(() => {
    if (!hasData) return null;
    return {
      file: data?.uploadedFileName ?? "-",
      rows: data?.rowsParsed ?? 0,
      positions: data?.positions?.length ?? 0,
    };
  }, [hasData, data]);

  return (
    <main
      style={{
        maxWidth: 980,
        margin: "40px auto",
        padding: 16,
        fontFamily: "system-ui",
      }}
    >
      {/* HERO / POSITIONING */}
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
          }}
        >
          <div style={{ flex: "1 1 520px" }}>
            <div className="h1" style={{ marginBottom: 6 }}>
              Tradevion — Risk Operating System
            </div>
            <div className="p-muted" style={{ lineHeight: 1.45 }}>
              Import your trades → get a clear picture of <b>risk</b>,{" "}
              <b>drawdowns</b>, and <b>behavioral leaks</b>.
              <br />
              This page is your <b>quick start</b>. The real analysis lives in{" "}
              <b>Overview</b>, <b>Performance</b>, and <b>Risk</b>.
            </div>

            <div
              style={{
                marginTop: 14,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <button
                className="btn-primary"
                onClick={() => router.push(nextBestRoute)}
              >
                {hasData ? "Continue → Overview" : "Start Free → Upload CSV"}
              </button>

              <button
                className="btn-secondary"
                onClick={() => router.push("/upload")}
              >
                Upload
              </button>

              <button
                className="btn-secondary"
                onClick={() => router.push("/overview")}
                disabled={!hasData}
              >
                Overview
              </button>

              <button
                className="btn-secondary"
                onClick={() => router.push("/performance")}
                disabled={!hasData}
              >
                Performance
              </button>

              <button
                className="btn-secondary"
                onClick={() => router.push("/risk")}
                disabled={!hasData}
              >
                Risk
              </button>
            </div>
          </div>

          <div
            style={{
              flex: "0 0 auto",
              marginLeft: "auto",
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <MiniStat label="Plan" value={isPro ? "PRO" : "FREE"} />
            <MiniStat label="Session" value={hasData ? "Loaded" : "None"} />
            {hasData ? (
              <>
                <MiniStat label="Rows" value={sessionSummary?.rows ?? 0} />
                <MiniStat
                  label="Positions"
                  value={sessionSummary?.positions ?? 0}
                />
              </>
            ) : null}
          </div>
        </div>

        {hasData ? (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid rgba(255,255,255,0.08)",
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              alignItems: "center",
            }}
          >
            <div className="p-muted" style={{ fontSize: 12 }}>
              Loaded file:{" "}
              <b style={{ color: "var(--text)" }}>{sessionSummary?.file}</b>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <button
                className="btn-secondary"
                onClick={() => router.push("/upload")}
              >
                Re-upload
              </button>
            </div>
          </div>
        ) : (
          <div
            style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
            className="p-muted"
          >
            No session yet. Upload a CSV to unlock Overview / Performance /
            Risk.
          </div>
        )}
      </div>

      {/* QUICK START STEPS */}
      <div style={{ display: "grid", gap: 12 }}>
        {/* STEP 1: WHAT THIS IS + HOW TO USE */}
        <StepCard
          step={1}
          title="How Tradevion works (the 60-second flow)"
          done={false}
          desc={
            <div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <Bullet>
                  <b>Upload</b> your trade history CSV (executed fills / trade
                  history).
                </Bullet>
                <Bullet>
                  Go to <b>Overview</b> to confirm everything looks correct
                  (PnL, equity curve, basic stats).
                </Bullet>
                <Bullet>
                  Use <b>Performance</b> to find what makes / loses money
                  (symbols, distributions, time patterns).
                </Bullet>
                <Bullet>
                  Use <b>Risk</b> to control drawdowns (risk consistency, streak
                  behavior, risk limits).
                </Bullet>
              </ul>
              <div className="p-muted" style={{ marginTop: 10 }}>
                Tradevion is not a “journal for notes”. It’s a{" "}
                <b>risk control layer</b> on top of your trading history.
              </div>
            </div>
          }
          actions={
            <button
              className="btn-primary"
              onClick={() => router.push(hasData ? "/overview" : "/upload")}
            >
              {hasData ? "Open Overview" : "Go to Upload"}
            </button>
          }
        />

        {/* STEP 2: CSV EXPORT GUIDE (keep short + correct) */}
        <StepCard
          step={2}
          title="Get the right CSV (important)"
          done={false}
          desc={
            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                What you need
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <Bullet>
                  Export <b>executed trades</b> (often called{" "}
                  <b>Trade History</b> / <b>Fills</b>).
                </Bullet>
                <Bullet>
                  Make sure the file includes <b>timestamps</b> (otherwise
                  calendar/time analysis will be incomplete).
                </Bullet>
                <Bullet>
                  If your exchange offers multiple exports, prefer the one with{" "}
                  <b>fills</b> (not just orders).
                </Bullet>
              </ul>

              <div style={{ marginTop: 10, fontWeight: 900 }}>
                Bitget quick hint (optional)
              </div>
              <div className="p-muted" style={{ marginTop: 6 }}>
                In Bitget (web), you typically find exports under{" "}
                <CodePath>Orders</CodePath> / <CodePath>Assets</CodePath>. For
                Futures/Perp, export{" "}
                <CodePath>Futures → Trade History</CodePath> if available.
              </div>

              <div style={{ marginTop: 10, fontWeight: 900 }}>
                Common issues
              </div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <Bullet>
                  Decimal/comma issues: export with an “English” locale if
                  available.
                </Bullet>
                <Bullet>
                  If Bitget splits Spot/Futures, export the account you actually
                  trade (often Futures).
                </Bullet>
              </ul>
            </div>
          }
          actions={
            <button
              className="btn-secondary"
              onClick={() => router.push("/upload")}
            >
              I have the CSV → Upload
            </button>
          }
        />

        {/* STEP 3: UPLOAD */}
        <StepCard
          step={3}
          title="Upload CSV"
          desc={
            <>
              Upload your trade history CSV. Tradevion will compute positions,
              daily PnL, symbol stats and build your dashboards automatically.
            </>
          }
          done={hasData}
          actions={
            <button
              className="btn-primary"
              onClick={() => router.push("/upload")}
            >
              Go to Upload
            </button>
          }
        />

        {/* STEP 4: OVERVIEW */}
        <StepCard
          step={4}
          title="Overview (sanity-check your data)"
          desc={
            <>
              Your first stop after upload. Confirm PnL, equity curve, trade
              count, and whether the import looks correct.
            </>
          }
          done={hasData && hasByDay}
          actions={
            <button
              className="btn-secondary"
              onClick={() => router.push("/overview")}
              disabled={!hasData}
            >
              Open Overview
            </button>
          }
        />

        {/* STEP 5: PERFORMANCE */}
        <StepCard
          step={5}
          title="Performance (find what drives results)"
          desc={
            <>
              Identify which symbols/time windows/distributions create your wins
              and losses. Use this to remove weak spots.
            </>
          }
          done={hasData}
          actions={
            <button
              className="btn-secondary"
              onClick={() => router.push("/performance")}
              disabled={!hasData}
            >
              Open Performance
            </button>
          }
        />

        {/* STEP 6: RISK */}
        <StepCard
          step={6}
          title="Risk (control drawdowns)"
          desc={
            <>
              The risk layer turns “analytics” into “control”: consistency,
              streak behavior, overtrading patterns, and risk guardrails.
            </>
          }
          done={hasData}
          actions={
            <button
              className="btn-secondary"
              onClick={() => router.push("/risk")}
              disabled={!hasData}
            >
              Open Risk
            </button>
          }
        />

        {/* Optional: journal drilldown kept, but not a main CTA */}
        <StepCard
          step={7}
          title="Journal (drill down into positions / trades / calendar)"
          desc={
            <>
              Use Journal to inspect details: individual trades, positions, and
              daily heatmaps. This is where you verify specific events behind
              your stats.
            </>
          }
          done={hasData && (hasPositions || hasByDay)}
          actions={
            <>
              <button
                className="btn-secondary"
                onClick={() => router.push("/positions")}
                disabled={!hasData}
              >
                Positions
              </button>
              <button
                className="btn-secondary"
                onClick={() => router.push("/trades")}
                disabled={!hasData}
              >
                Trades
              </button>
              <button
                className="btn-secondary"
                onClick={() => router.push("/calendar")}
                disabled={!hasData}
              >
                Calendar
              </button>
            </>
          }
        />

        {/* PRO */}
        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontWeight: 1000 }}>PRO (optional)</div>
          <div className="p-muted" style={{ marginTop: 6 }}>
            More analytics, higher limits, and premium risk features. Current
            plan: {isPro ? "✅ PRO active" : "🔒 FREE"}
          </div>
          {!isPro ? (
            <div style={{ marginTop: 12 }}>
              <button
                className="btn-primary"
                onClick={() => router.push("/pricing")}
              >
                See PRO
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div
        className="p-muted"
        style={{ marginTop: 16, fontSize: 12, opacity: 0.85 }}
      >
        Tip: If your export is missing fields, export{" "}
        <b>Trade History / Fills</b> instead of <b>Order History</b>.
      </div>
    </main>
  );
}

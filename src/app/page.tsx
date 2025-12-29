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
            background: done ? "rgba(54,211,153,0.12)" : "rgba(255,255,255,0.03)",
          }}
        >
          {done ? "✓" : step}
        </div>
        <div style={{ fontWeight: 900 }}>{title}</div>
      </div>

      <div className="p-muted" style={{ marginTop: 8, lineHeight: 1.35 }}>
        {desc}
      </div>

      {actions ? (
        <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>{actions}</div>
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
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
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

export default function HomeTutorialPage() {
  const router = useRouter();
  const { data, isPro } = useTradeSession();

  const hasData = !!data?.rowsParsed && (data.rowsParsed ?? 0) > 0;
  const hasPositions = (data?.positions?.length ?? 0) > 0;
  const hasByDay = ((data as any)?.byDayPositions?.length ?? 0) > 0;

  const nextBestRoute = useMemo(() => {
    if (!hasData) return "/upload";
    if (hasByDay) return "/dashboard";
    return "/trades";
  }, [hasData, hasByDay]);

  return (
    <main style={{ maxWidth: 980, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      {/* HERO */}
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div className="h1">Trading Platform</div>
        <div className="p-muted" style={{ marginTop: 6 }}>
          Upload → Analyze → Improve. This onboarding shows you exactly what to do.
        </div>

        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <button className="btn-primary" onClick={() => router.push(nextBestRoute)}>
            {hasData ? "Open Dashboard" : "Start: Upload CSV"}
          </button>

          <button className="btn-secondary" onClick={() => router.push("/upload")}>
            Upload
          </button>

          {hasData ? (
            <>
              <button className="btn-secondary" onClick={() => router.push("/dashboard")}>
                Dashboard
              </button>
              <button className="btn-secondary" onClick={() => router.push("/calendar")}>
                Calendar
              </button>
              <button className="btn-secondary" onClick={() => router.push("/positions")}>
                Positions
              </button>
              <button className="btn-secondary" onClick={() => router.push("/trades")}>
                Trades
              </button>
              <button className="btn-secondary" onClick={() => router.push("/performance")}>
                Performance
              </button>
            </>
          ) : null}

          <div style={{ marginLeft: "auto", opacity: 0.85, fontSize: 12 }}>
            {hasData ? (
              <>
                Loaded: <b>{data?.uploadedFileName}</b> · Rows: <b>{data?.rowsParsed}</b> · Positions:{" "}
                <b>{data?.positions?.length ?? 0}</b>
              </>
            ) : (
              <>No session loaded</>
            )}
          </div>
        </div>
      </div>

      {/* STEPS */}
      <div style={{ display: "grid", gap: 12 }}>
        {/* STEP 1: BITGET CSV GUIDE */}
        <StepCard
          step={1}
          title="Get your CSV from Bitget"
          done={false}
          desc={
            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Bitget export (quick guide)</div>

              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <Bullet>
                  Open Bitget (web) → go to <CodePath>Assets</CodePath> / <CodePath>Orders</CodePath> (depends on
                  interface)
                </Bullet>
                <Bullet>
                  For Futures/Perp trading, you usually want:{" "}
                  <CodePath>Futures → Order History</CodePath> and/or <CodePath>Futures → Trade History</CodePath>
                </Bullet>
                <Bullet>
                  Look for an <CodePath>Export</CodePath> button (top-right area) and export as <CodePath>CSV</CodePath>
                </Bullet>
                <Bullet>
                  Select a date range (e.g. last 30/90 days) → export/download
                </Bullet>
              </ul>

              <div style={{ marginTop: 10, fontWeight: 900 }}>What to export for THIS app</div>
              <div className="p-muted" style={{ marginTop: 6 }}>
                Use the file that contains executed trade events (fills). In Bitget this is most often called{" "}
                <b>Trade History</b> or <b>Fills</b>. If you only export <b>Order History</b>, you may miss partial fills.
              </div>

              <div style={{ marginTop: 10, fontWeight: 900 }}>Common issues</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                <Bullet>
                  If your export contains commas and your system uses commas as decimals: try exporting with “English”
                  locale (if Bitget offers it).
                </Bullet>
                <Bullet>
                  Make sure the export includes timestamps. Without timestamps, Calendar/Performance will be incomplete.
                </Bullet>
                <Bullet>
                  If Bitget splits exports per account (Spot/Futures), export the one you trade with (usually Futures).
                </Bullet>
              </ul>

              <div style={{ marginTop: 10 }}>
                <button className="btn-secondary" onClick={() => router.push("/upload")}>
                  I have the CSV → Go to Upload
                </button>
              </div>
            </div>
          }
        />

        {/* STEP 2: UPLOAD */}
        <StepCard
          step={2}
          title="Upload CSV"
          desc={
            <>
              Upload your exported Bitget CSV. After upload we automatically compute positions, daily PnL, symbol stats,
              and all dashboards.
            </>
          }
          done={hasData}
          actions={
            <button className="btn-primary" onClick={() => router.push("/upload")}>
              Go to Upload
            </button>
          }
        />

        {/* STEP 3: DASHBOARD */}
        <StepCard
          step={3}
          title="Check Dashboard"
          desc={
            <>
              See your Total PnL, Win Rate, Profit Factor, Equity Curve, and Biggest Win/Loss at a glance.
            </>
          }
          done={hasData && hasByDay}
          actions={
            <button className="btn-secondary" onClick={() => router.push("/dashboard")} disabled={!hasData}>
              Open Dashboard
            </button>
          }
        />


        {/* STEP 5: POSITIONS */}
        <StepCard
          step={5}
          title="Drill Down: Positions"
          desc={
            <>
              Filter by symbol/day. Review hold time, trades per position, and net PnL per position.
            </>
          }
          done={hasData && hasPositions}
          actions={
            <button className="btn-secondary" onClick={() => router.push("/positions")} disabled={!hasData}>
              Open Positions
            </button>
          }
        />

        {/* STEP 6: PERFORMANCE */}
        <StepCard
          step={6}
          title="Deep Dive: Performance"
          desc={
            <>
              Ticker analytics, risk analytics, distribution, and monthly/daily equity curves — perfect to spot weaknesses.
            </>
          }
          done={hasData}
          actions={
            <button className="btn-secondary" onClick={() => router.push("/performance")} disabled={!hasData}>
              Open Performance
            </button>
          }
        />

                {/* STEP 4: CALENDAR */}
                <StepCard
          step={4}
          title="Use Calendar (Daily Heatmap)"
          desc={
            <>
              Find your best/worst days. Click a day to open positions for that date.
            </>
          }
          done={hasData && hasByDay}
          actions={
            <button className="btn-secondary" onClick={() => router.push("/calendar")} disabled={!hasData}>
              Open Calendar
            </button>
          }
        />

        {/* PRO */}
        <div className="card" style={{ padding: 16, borderRadius: 14 }}>
          <div style={{ fontWeight: 900 }}>PRO (optional)</div>
          <div className="p-muted" style={{ marginTop: 6 }}>
            Export, higher limits, more analytics. Current plan: {isPro ? "✅ PRO active" : "🔒 FREE"}
          </div>
          {!isPro ? (
            <div style={{ marginTop: 12 }}>
              <button className="btn-primary" onClick={() => router.push("/pricing")}>
                Unlock PRO
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="p-muted" style={{ marginTop: 16, fontSize: 12, opacity: 0.85 }}>
        Tip: If your Bitget export is missing fields, export “Trade History / Fills” instead of “Order History”.
      </div>
    </main>
  );
}

"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { DEFAULT_CCY, fmtMoney, fmtPercent } from "@/lib/format";
import { mapTradesToRiskEvents } from "@/core/risk/mappers/mapTradesToRiskEvents";
import type { RiskEvent } from "@/core/risk/types";
// ✅ Risk OS Orchestrator (dein Kernel)
import { computeRiskOS } from "@/core/risk/riskOS";

function cardInner(): React.CSSProperties {
  return {
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 14,
    background: "rgba(255,255,255,0.02)",
  };
}

function badge(sev: string) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "4px 10px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 900,
    border: "1px solid rgba(255,255,255,0.10)",
  };
  const map: Record<string, React.CSSProperties> = {
    CRITICAL: { background: "rgba(255,72,72,0.14)" },
    HIGH: { background: "rgba(255,160,72,0.14)" },
    MEDIUM: { background: "rgba(255,255,72,0.10)" },
    LOW: { background: "rgba(0,212,255,0.10)" },
  };
  return { ...base, ...(map[sev] ?? { background: "rgba(255,255,255,0.06)" }) };
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

export default function ControlCenterPage() {
  const router = useRouter();
  const { data } = useTradeSession();

  const events = useMemo(() => {
    return mapTradesToRiskEvents(data?.trades ?? []);
  }, [data]);

  const hasData = events.length > 0;

  const os = useMemo(() => {
    if (!hasData) return null;
    return computeRiskOS({ events });
  }, [hasData, events]);

  const topAlerts = useMemo(() => {
    if (!os) return [];
    const devs = (os.deviations?.deviations ?? os.deviations ?? []) as any[];
    const weight = (s: string) =>
      s === "CRITICAL"
        ? 4
        : s === "HIGH"
          ? 3
          : s === "MEDIUM"
            ? 2
            : s === "LOW"
              ? 1
              : 0;

    return [...devs]
      .sort((a, b) => weight(String(b.severity)) - weight(String(a.severity)))
      .slice(0, 3);
  }, [os]);

  const topActions = useMemo(() => {
    if (!os) return [];
    const acts = (os.actions?.actions ?? os.actions ?? []) as any[];
    return acts.slice(0, 3);
  }, [os]);

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: 12,
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontWeight: 1000, fontSize: 18 }}>Control Center</div>
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Educational analytics only. Deterministic Risk OS (v1).
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn-secondary"
              onClick={() => router.push("/upload")}
            >
              Upload
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/mentor")}
            >
              Mentor
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/intel")}
            >
              Intel
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/positions")}
            >
              Positions
            </button>
          </div>
        </div>
      </div>

      {!hasData ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 1000 }}>No events loaded</div>
          <div className="p-muted" style={{ marginTop: 8 }}>
            Upload first so Risk OS can compute Equity / Exposure / Behavior.
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
      ) : !os ? null : (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 0.8fr",
              gap: 12,
              alignItems: "start",
            }}
          >
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 1000 }}>Capital Survival Score</div>
              <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                One number. Explained. No “AI said”.
              </div>

              <div style={{ marginTop: 12, ...cardInner() }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div
                      className="p-muted"
                      style={{ fontSize: 12, fontWeight: 900 }}
                    >
                      SCORE
                    </div>
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 34,
                        fontWeight: 1000,
                        lineHeight: 1,
                      }}
                    >
                      {os.survival?.score ?? "—"}
                      <span
                        className="p-muted"
                        style={{ fontSize: 14, marginLeft: 8 }}
                      >
                        / 100
                      </span>
                    </div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 8, fontSize: 12 }}
                    >
                      Grade:{" "}
                      <b style={{ color: "var(--text)" }}>
                        {os.survival?.grade ?? "—"}
                      </b>
                    </div>
                  </div>

                  <div style={{ minWidth: 240 }}>
                    <div
                      className="p-muted"
                      style={{ fontSize: 12, fontWeight: 900 }}
                    >
                      BREAKDOWN
                    </div>
                    <div
                      style={{
                        marginTop: 8,
                        display: "grid",
                        gap: 6,
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span className="p-muted">Drawdown</span>
                        <b>{os.survival?.breakdown?.drawdownScore ?? "—"}</b>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span className="p-muted">Exposure</span>
                        <b>{os.survival?.breakdown?.exposureScore ?? "—"}</b>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span className="p-muted">Daily loss</span>
                        <b>{os.survival?.breakdown?.dailyLossScore ?? "—"}</b>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span className="p-muted">Behavior</span>
                        <b>{os.survival?.breakdown?.behaviorScore ?? "—"}</b>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 1000 }}>Live Risk Summary</div>
              <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                What matters right now.
              </div>

              <div
                style={{
                  marginTop: 12,
                  ...cardInner(),
                  display: "grid",
                  gap: 10,
                  fontSize: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span className="p-muted">Current Equity</span>
                  <b>
                    {fmtMoney(
                      Number(os.equity?.currentEquity ?? 0),
                      DEFAULT_CCY,
                    )}
                  </b>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span className="p-muted">Current Drawdown</span>
                  <b
                    className={pnlClass(
                      -Number(os.equity?.currentDrawdownPct ?? 0),
                    )}
                  >
                    {fmtPercent(Number(os.equity?.currentDrawdownPct ?? 0))}
                  </b>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span className="p-muted">Effective Leverage</span>
                  <b>
                    {Number(os.exposure?.effectiveLeverage ?? 0).toFixed(2)}x
                  </b>
                </div>

                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <span className="p-muted">Daily PnL</span>
                  <b className={pnlClass(Number(os.daily?.dailyPnl ?? 0))}>
                    {fmtMoney(Number(os.daily?.dailyPnl ?? 0), DEFAULT_CCY)}
                  </b>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 1000 }}>Behavior Alerts</div>
              <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                Top deviations from your baseline.
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {topAlerts.length ? (
                  topAlerts.map((a: any, idx: number) => (
                    <div key={a.id ?? idx} style={cardInner()}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <span style={badge(String(a.severity))}>
                          {String(a.severity ?? "—")}
                        </span>
                        <span className="p-muted" style={{ fontSize: 12 }}>
                          {a.metric ?? a.type ?? a.id ?? "Deviation"}
                        </span>
                      </div>
                      <div style={{ marginTop: 8, fontWeight: 1000 }}>
                        {a.title ?? a.message ?? "Deviation detected"}
                      </div>
                      {a.explain ? (
                        <div
                          className="p-muted"
                          style={{
                            marginTop: 6,
                            fontSize: 12,
                            lineHeight: 1.4,
                          }}
                        >
                          {a.explain}
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div style={cardInner()}>
                    <div style={{ fontWeight: 1000 }}>No major alerts</div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      Good. Stay consistent.
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 1000 }}>Top Actions</div>
              <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                What to do now (mapped from alerts).
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {topActions.length ? (
                  topActions.map((a: any, idx: number) => (
                    <div key={a.id ?? idx} style={cardInner()}>
                      <div style={{ fontWeight: 1000 }}>
                        {a.title ?? a.action ?? "Action"}
                      </div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4 }}
                      >
                        {a.text ??
                          a.reason ??
                          "Apply this action to reduce risk."}
                      </div>

                      {!!a.cta ? (
                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            gap: 10,
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            className="btn-secondary"
                            onClick={() => router.push("/mentor")}
                          >
                            Open Mentor
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))
                ) : (
                  <div style={cardInner()}>
                    <div style={{ fontWeight: 1000 }}>No actions</div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      Once patterns trigger, actions appear here.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

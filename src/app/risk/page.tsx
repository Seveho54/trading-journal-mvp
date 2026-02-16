"use client";

import React, { useMemo, useState } from "react";
import { RiskOS, RiskTabKey } from "./RiskOS";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { computeRiskSummary } from "@/lib/risk";
import { DEFAULT_CCY, fmtMoney, fmtPercent } from "@/lib/format";

import {
  StatCard,
  Section,
  Disclosure,
  ScoreBadge,
  scoreTone,
  sevPill,
  pnlClass,
  fmtDays,
  fmtPct,
  fmtPctOrDash,
  fmtMoneyLike,
  MiniEquityChart,
  MiniDrawdownChart,
} from "./RiskUI";

function MiniKPI({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.02)",
        minWidth: 0,
      }}
    >
      <div className="p-muted" style={{ fontSize: 11, fontWeight: 900 }}>
        {label}
      </div>
      <div style={{ marginTop: 4, fontWeight: 1000, fontSize: 14 }}>
        {value}
      </div>
      {hint ? (
        <div className="p-muted" style={{ marginTop: 3, fontSize: 11 }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function ScenarioSelector({
  scenarios,
  ccy,
}: {
  scenarios: any[];
  ccy: string;
}) {
  const [selectedKey, setSelectedKey] = React.useState(scenarios[0]?.key);

  const selected = scenarios.find((s) => s.key === selectedKey) ?? scenarios[0];

  const scored = scenarios.map((s) => {
    const delta = s.delta ?? 0;
    const dd = Math.abs(s.maxDrawdown ?? 0);
    const score = delta - 0.5 * dd;

    return { ...s, _score: score };
  });

  const bestScenario =
    scored.length > 0
      ? scored.sort((a, b) => (b._score ?? 0) - (a._score ?? 0))[0]
      : null;

  const baseline = scenarios.find((s) => s.key === "baseline") ?? scenarios[0];
  const deltaVsBaseline =
    baseline && selected ? (selected.delta ?? 0) - (baseline.delta ?? 0) : 0;

  const deltaClass =
    (selected?.delta ?? 0) >= 0 ? "pnl-positive" : "pnl-negative";
  const deltaVsBaseClass =
    deltaVsBaseline >= 0 ? "pnl-positive" : "pnl-negative";

  const deltaCls = pnlClass(selected?.delta ?? 0);
  const deltaVsBaseCls = pnlClass(deltaVsBaseline);

  if (!selected) return null;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {/* Mini Menu */}
      <div
        style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        {scenarios.map((s) => (
          <button
            key={s.key}
            onClick={() => setSelectedKey(s.key)}
            style={{
              padding: "6px 10px",
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.08)",
              background:
                selectedKey === s.key
                  ? "rgba(54,211,153,0.15)"
                  : "rgba(255,255,255,0.05)",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Scenario Result */}
      <div
        style={{
          padding: 12,
          borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div style={{ fontWeight: 900 }}>{selected.label}</div>
        <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
          {selected.why}
        </div>

        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(12, 1fr)",
            gap: 10,
          }}
        >
          <div style={{ gridColumn: "span 4" }}>
            <MiniKPI
              label="End Equity"
              value={fmtMoneyLike(selected.endEquity ?? 0, ccy)}
              hint={`Start: ${fmtMoneyLike(selected.startEquity ?? 0, ccy)}`}
            />
          </div>

          <div style={{ gridColumn: "span 4" }}>
            <MiniKPI
              label="Δ from now"
              value={
                <span className={pnlClass(selected.delta ?? 0)}>
                  {fmtMoneyLike(selected.delta ?? 0, ccy)}
                </span>
              }
              hint={
                baseline ? (
                  <span className={pnlClass(deltaVsBaseline)}>
                    vs baseline: {fmtMoneyLike(deltaVsBaseline, ccy)}
                  </span>
                ) : null
              }
            />
          </div>

          <div style={{ gridColumn: "span 4" }}>
            <MiniKPI
              label="Max Drawdown"
              value={
                <span className={pnlClass(selected.maxDrawdown ?? 0)}>
                  {fmtMoneyLike(selected.maxDrawdown ?? 0, ccy)}
                </span>
              }
              hint={
                selected.maxDrawdownPct != null
                  ? `≈ ${(selected.maxDrawdownPct * 100).toFixed(1)}%`
                  : null
              }
            />
          </div>
        </div>

        {/* Equity Curve */}
        <div style={{ marginTop: 14 }}>
          <MiniEquityChart points={selected.curve ?? []} />
        </div>

        {/* Top scenarios (compact) */}
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <div className="p-muted" style={{ fontSize: 12, fontWeight: 900 }}>
            Best scenarios (by Δ)
          </div>

          {[...scenarios]
            .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0))
            .slice(0, 3)
            .map((s) => (
              <div
                key={s.key}
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  cursor: "pointer",
                }}
                onClick={() => setSelectedKey(s.key)}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 900, fontSize: 12 }}>{s.label}</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 4, fontSize: 12 }}
                  >
                    {s.why}
                  </div>
                </div>

                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div
                    className={pnlClass(s.delta ?? 0)}
                    style={{ fontWeight: 1000 }}
                  >
                    {fmtMoneyLike(s.delta ?? 0, ccy)}
                  </div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 2, fontSize: 12 }}
                  >
                    DD:{" "}
                    <span className={pnlClass(s.maxDrawdown ?? 0)}>
                      {fmtMoneyLike(s.maxDrawdown ?? 0, ccy)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

export default function RiskPage() {
  const router = useRouter();
  const { data } = useTradeSession();
  const ccy = (data as any)?.ccy ?? "USDT";

  const hasSession = !!data?.rowsParsed && (data.rowsParsed ?? 0) > 0;
  const [horizon, setHorizon] = useState(30);

  const risk = useMemo(() => {
    if (!hasSession) return null;

    const positions = (data as any)?.positions ?? [];
    const trades = (data as any)?.trades ?? [];
    const byDayPositions = (data as any)?.byDayPositions ?? [];

    return computeRiskSummary(
      { positions, trades, byDayPositions },
      { startEquity: 0, forecastHorizonTrades: horizon, recentK: 10 },
    );
  }, [hasSession, data, horizon]);

  const periods = risk?.drawdownPeriods ?? [];
  const active = risk?.currentDrawdownPeriod ?? null;
  const last3 = periods.slice(-3).reverse(); // show newest first
  const alerts = (risk as any)?.alerts ?? [];
  const modeExplanation = (risk as any)?.modeExplanation ?? null;
  const rootCauses = (risk as any)?.rootCauses ?? [];
  const topSignals = alerts.slice(0, 3);
  const topCauses = rootCauses.slice(0, 3);

  const layer3 = (risk as any)?.layer3 ?? null;

  const behavior = layer3?.behavior ?? null;
  const outliers = layer3?.outliers ?? null;
  const consistency = layer3?.consistency ?? null;
  const [tab, setTab] = useState<RiskTabKey>("diagnosis");
  const rce = (risk as any)?.rootCauseEngine ?? null;
  const proj = (risk as any)?.projection ?? null;

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

          <RiskOS tab={tab} onTabChange={setTab}>
            {tab === "diagnosis" ? (
              <div style={{ display: "grid", gap: 12 }}>
                {/* Headline */}
                <div>
                  <div style={{ fontWeight: 1000, fontSize: 16 }}>
                    Diagnosis
                  </div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Dein aktueller Zustand + die wichtigsten Signale (aus deinen
                    Daten).
                  </div>
                </div>

                {/* Row: Top signals + Why this mode */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(12, 1fr)",
                    gap: 12,
                  }}
                >
                  <div style={{ gridColumn: "span 6" }}>
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        height: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 1000 }}>Top signals</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        Die größten aktuellen Risiko-Signale
                      </div>

                      {topSignals.length ? (
                        <div
                          style={{ marginTop: 10, display: "grid", gap: 10 }}
                        >
                          {topSignals.map((a: any) => (
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
                          style={{ marginTop: 10, fontSize: 12 }}
                        >
                          Keine Alerts – aktuell sieht es clean aus.
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ gridColumn: "span 6" }}>
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        height: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 1000 }}>Why this mode</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        Erklärung, warum dein Risk Mode so entschieden wurde
                      </div>

                      {modeExplanation ? (
                        <div style={{ marginTop: 10 }}>
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
                                .slice(0, 3)
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
                          style={{ marginTop: 10, fontSize: 12 }}
                        >
                          —
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Root causes mini list */}
                {/* Root causes (top) — compact (no duplicates) */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ fontWeight: 1000 }}>Root causes (top)</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Nur die wichtigsten Ursachen (Details im Tab <b>Why</b>)
                  </div>

                  {topCauses.length ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                      {topCauses.map((c: any) => (
                        <div
                          key={c.key}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.02)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 900, fontSize: 13 }}>
                              {c.title}
                            </div>
                          </div>

                          <div style={{ flexShrink: 0 }}>
                            {sevPill(c.severity)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div
                      className="p-muted"
                      style={{ marginTop: 10, fontSize: 12 }}
                    >
                      Keine Root Causes erkannt (oder nicht genug Daten).
                    </div>
                  )}
                </div>

                {/* CTA hint */}
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Weiter: <b>Why</b> zeigt Evidence/Impact + Details.{" "}
                  <b>Action</b> zeigt Regeln & Plan.
                </div>
              </div>
            ) : null}

            {tab === "why" ? (
              <div style={{ display: "grid", gap: 12 }}>
                {/* Headline */}
                <div>
                  <div style={{ fontWeight: 1000, fontSize: 16 }}>Why</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Beweise aus deinen Daten: Root causes + Verhalten + Outlier
                    + Konsistenz.
                  </div>
                </div>

                {/* Root causes with evidence/impact (full) */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ fontWeight: 1000 }}>Root causes (evidence)</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Details, die in Diagnosis bewusst weggelassen wurden.
                  </div>

                  {((risk as any)?.rootCauses ?? []).length ? (
                    <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                      {((risk as any).rootCauses ?? [])
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
                            }}
                          >
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontWeight: 900, fontSize: 13 }}>
                                {c.title}
                              </div>
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
                  ) : (
                    <div
                      className="p-muted"
                      style={{ marginTop: 10, fontSize: 12 }}
                    >
                      Keine Root Causes erkannt (oder nicht genug Daten).
                    </div>
                  )}
                </div>

                {/* Layer 3 — Compact grid */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(12, 1fr)",
                    gap: 12,
                  }}
                >
                  {/* Behavior */}
                  <div style={{ gridColumn: "span 4" }}>
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        height: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 1000 }}>Behavior</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        Trading frequency + spiral days
                      </div>

                      {behavior ? (
                        <div
                          style={{ marginTop: 10, display: "grid", gap: 10 }}
                        >
                          <StatCard
                            title="Trades/day (avg)"
                            value={(behavior.tradesPerDayAvg ?? 0).toFixed(1)}
                            sub={`Max/day: ${behavior.tradesPerDayMax ?? 0} • Active days: ${
                              behavior.activeDays ?? 0
                            }`}
                          />
                          <div
                            className="p-muted"
                            style={{ fontSize: 12, lineHeight: 1.45 }}
                          >
                            {behavior.overtradingFlag ? (
                              <div>
                                <b>Flag:</b> Overtrading risk (zu viele
                                Trades/Tag)
                              </div>
                            ) : (
                              <div>
                                <b>Status:</b> Kein Overtrading-Flag
                              </div>
                            )}
                          </div>

                          {(behavior.spiralDays ?? []).length ? (
                            <div style={{ display: "grid", gap: 6 }}>
                              <div className="p-muted" style={{ fontSize: 12 }}>
                                Spiral days (last):
                              </div>
                              {(behavior.spiralDays ?? [])
                                .slice(-4)
                                .map((x: any) => (
                                  <div
                                    key={x.day}
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: 10,
                                      padding: "8px 10px",
                                      borderRadius: 12,
                                      border:
                                        "1px solid rgba(255,255,255,0.08)",
                                      background: "rgba(255,255,255,0.03)",
                                      fontSize: 12,
                                    }}
                                  >
                                    <b>{x.day}</b>
                                    <span className="p-muted">
                                      {x.count} trades
                                    </span>
                                  </div>
                                ))}
                            </div>
                          ) : (
                            <div className="p-muted" style={{ fontSize: 12 }}>
                              Keine Spiral Days erkannt.
                            </div>
                          )}
                        </div>
                      ) : (
                        <div
                          className="p-muted"
                          style={{ marginTop: 10, fontSize: 12 }}
                        >
                          Not enough data.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Outliers */}
                  <div style={{ gridColumn: "span 4" }}>
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        height: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 1000 }}>Outliers</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        Worst/Best trades + tail risk
                      </div>

                      {outliers ? (
                        <div
                          style={{ marginTop: 10, display: "grid", gap: 10 }}
                        >
                          <StatCard
                            title="Tail concentration"
                            value={`${Math.round((outliers.tailConcentration ?? 0) * 100)}%`}
                            sub={
                              outliers.tailRiskFlag
                                ? "Flag: Outlier losses dominate"
                                : "No tail-risk flag"
                            }
                          />

                          <div style={{ display: "grid", gap: 8 }}>
                            <div className="p-muted" style={{ fontSize: 12 }}>
                              Worst 2 trades:
                            </div>

                            {(outliers.worstTrades ?? [])
                              .slice(0, 2)
                              .map((t: any, i: number) => (
                                <div
                                  key={`${t.t}-${i}`}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    padding: "8px 10px",
                                    borderRadius: 12,
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    background: "rgba(255,255,255,0.03)",
                                    fontSize: 12,
                                  }}
                                >
                                  <div style={{ minWidth: 0 }}>
                                    <b>{t.symbol ?? "—"}</b>{" "}
                                    <span className="p-muted">
                                      {t.t ?? "—"}
                                    </span>
                                  </div>
                                  <span
                                    style={{ fontWeight: 900 }}
                                    className={pnlClass(t.pnl)}
                                  >
                                    {t.pnl.toFixed(2)}
                                  </span>
                                </div>
                              ))}
                          </div>
                        </div>
                      ) : (
                        <div
                          className="p-muted"
                          style={{ marginTop: 10, fontSize: 12 }}
                        >
                          Not enough data.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Consistency */}
                  <div style={{ gridColumn: "span 4" }}>
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        height: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 1000 }}>Consistency</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        Variance + recent stability
                      </div>

                      {consistency ? (
                        <div
                          style={{ marginTop: 10, display: "grid", gap: 10 }}
                        >
                          <StatCard
                            title="Risk inconsistency (CV)"
                            value={(
                              consistency.riskInconsistencyCV ?? 0
                            ).toFixed(2)}
                            sub={
                              consistency.inconsistencyFlag
                                ? "Flag: high variability"
                                : "No inconsistency flag"
                            }
                          />

                          <div
                            className="p-muted"
                            style={{ fontSize: 12, lineHeight: 1.45 }}
                          >
                            <div>
                              <b>Recent stability:</b>{" "}
                              {(consistency.recentStability ?? 0).toFixed(2)}
                            </div>
                            <div>
                              <b>Last N:</b> {consistency.lastN ?? 20} •{" "}
                              <b>Avg:</b>{" "}
                              {(consistency.recentAvg ?? 0).toFixed(2)} •{" "}
                              <b>Std:</b>{" "}
                              {(consistency.recentStd ?? 0).toFixed(2)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="p-muted"
                          style={{ marginTop: 10, fontSize: 12 }}
                        >
                          Not enough data.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Tiny hint */}
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Nächster Schritt: <b>Action</b> wird nur Regeln + Plan (ohne
                  Analytics) enthalten.
                </div>
              </div>
            ) : null}

            {tab === "meaning" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 1000, fontSize: 16 }}>Meaning</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Was das für dich heißt — in einfachen Regeln +
                    Interpretation.
                  </div>
                </div>

                {/* Mode explanation (compact) */}
                <div
                  style={{
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div style={{ fontWeight: 1000 }}>Mode interpretation</div>
                  {(risk as any)?.modeExplanation ? (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ fontWeight: 900, fontSize: 13 }}>
                        {(risk as any).modeExplanation.title}
                      </div>
                      <ul
                        style={{
                          marginTop: 8,
                          paddingLeft: 18,
                          lineHeight: 1.5,
                        }}
                      >
                        {((risk as any).modeExplanation.bullets ?? [])
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
                    </div>
                  ) : (
                    <div
                      className="p-muted"
                      style={{ marginTop: 8, fontSize: 12 }}
                    >
                      —
                    </div>
                  )}
                </div>

                {/* Drivers (top 3) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(12, 1fr)",
                    gap: 12,
                  }}
                >
                  <div style={{ gridColumn: "span 6" }}>
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        height: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 1000 }}>Top drivers</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        Die 3 Faktoren, die deinen Risk-State am meisten treiben
                      </div>

                      {risk?.drivers?.length ? (
                        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                          {risk.drivers
                            .slice(0, 3)
                            .map((d: any, idx: number) => (
                              <div
                                key={idx}
                                style={{
                                  padding: "10px 12px",
                                  borderRadius: 14,
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  background: "rgba(255,255,255,0.02)",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                }}
                              >
                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{ fontWeight: 900, fontSize: 13 }}
                                  >
                                    {d.label}
                                  </div>
                                  <div
                                    className="p-muted"
                                    style={{ marginTop: 4, fontSize: 12 }}
                                  >
                                    {d.detail}
                                  </div>
                                </div>
                                <div style={{ flexShrink: 0 }}>
                                  {sevPill(d.severity)}
                                </div>
                              </div>
                            ))}
                        </div>
                      ) : (
                        <div
                          className="p-muted"
                          style={{ marginTop: 10, fontSize: 12 }}
                        >
                          —
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Drawdown meaning quick */}
                  <div style={{ gridColumn: "span 6" }}>
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        height: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 1000 }}>Drawdown meaning</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        Quick interpretation in 3 lines
                      </div>

                      <div
                        className="p-muted"
                        style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5 }}
                      >
                        <div>
                          <b>Current DD:</b>{" "}
                          {fmtMoney(risk?.currentDrawdown ?? 0)}{" "}
                          {risk?.currentDrawdownPct != null
                            ? `(${fmtPct(risk.currentDrawdownPct)})`
                            : ""}
                        </div>
                        <div>
                          <b>Distance:</b>{" "}
                          {fmtMoneyLike(risk?.distanceToBreakeven ?? 0, ccy)}
                        </div>
                        <div>
                          <b>Implication:</b>{" "}
                          {(risk?.currentDrawdownPct ?? 0) >= 0.1
                            ? "You must protect capital; trade only A+ setups."
                            : "Risk looks controllable; keep rules stable."}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Root Cause Engine: ONE ROW */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(12, 1fr)",
                    gap: 10,
                  }}
                >
                  <div style={{ gridColumn: "span 3" }}>
                    <MiniKPI
                      label="Expectancy (recent)"
                      value={
                        rce
                          ? fmtMoneyLike(rce.expectancy?.recent ?? 0, ccy)
                          : "—"
                      }
                      hint={rce ? `last ${rce.recentN ?? 20} trades` : null}
                    />
                  </div>

                  <div style={{ gridColumn: "span 3" }}>
                    <MiniKPI
                      label="Edge stability"
                      value={rce ? fmtPctOrDash(rce.edgeStability) : "—"}
                      hint="0–100% (higher=better)"
                    />
                  </div>

                  <div style={{ gridColumn: "span 2" }}>
                    <MiniKPI
                      label="Loss clustering"
                      value={rce ? fmtPctOrDash(rce.lossClusteringIndex) : "—"}
                      hint="streak pressure"
                    />
                  </div>

                  <div style={{ gridColumn: "span 2" }}>
                    <MiniKPI
                      label="Risk consistency"
                      value={rce ? fmtPctOrDash(rce.riskConsistencyIndex) : "—"}
                      hint="CV inverted"
                    />
                  </div>

                  <div style={{ gridColumn: "span 2" }}>
                    <MiniKPI
                      label="Tail risk"
                      value={
                        rce ? fmtPctOrDash(rce.sizeEscalationDetector) : "—"
                      }
                      hint="outlier losses"
                    />
                  </div>
                </div>

                {/* Projection row (compact) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(12, 1fr)",
                    gap: 10,
                  }}
                >
                  <div style={{ gridColumn: "span 4" }}>
                    <MiniKPI
                      label="Trades to break-even"
                      value={proj ? (proj.tradesToRecover ?? 0) : "—"}
                      hint="rough estimate"
                    />
                  </div>

                  <div style={{ gridColumn: "span 4" }}>
                    <MiniKPI
                      label="Risk of further DD"
                      value={proj ? fmtPctOrDash(proj.riskOfFurtherDD) : "—"}
                      hint="0–100% heuristic"
                    />
                  </div>

                  <div style={{ gridColumn: "span 4" }}>
                    <MiniKPI
                      label="Half-size expectancy"
                      value={
                        proj
                          ? fmtMoneyLike(proj.simHalfSizeExpectancy ?? 0, ccy)
                          : "—"
                      }
                      hint="if you cut size 50%"
                    />
                  </div>
                </div>
              </div>
            ) : null}

            {tab === "action" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 1000, fontSize: 16 }}>Action</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Konkrete Schritte für heute — ohne Analytics-Overload.
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(12, 1fr)",
                    gap: 12,
                  }}
                >
                  {/* Best Move */}
                  <div style={{ gridColumn: "span 4" }}>
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        height: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 1000 }}>Best move</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        Highest-impact fix
                      </div>

                      {(risk as any)?.bestMove ? (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ fontWeight: 900, fontSize: 13 }}>
                            {(risk as any).bestMove.title}
                          </div>
                          <div
                            className="p-muted"
                            style={{
                              marginTop: 6,
                              fontSize: 12,
                              lineHeight: 1.45,
                            }}
                          >
                            {(risk as any).bestMove.detail}
                          </div>
                        </div>
                      ) : (
                        <div
                          className="p-muted"
                          style={{ marginTop: 10, fontSize: 12 }}
                        >
                          —
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rules Now */}
                  <div style={{ gridColumn: "span 4" }}>
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        height: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 1000 }}>Rules now</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        3 rules (no fluff)
                      </div>

                      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                        {((risk as any)?.rulesNow ?? [])
                          .slice(0, 3)
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
                                <div style={{ fontWeight: 900, fontSize: 12 }}>
                                  {r.label}
                                </div>
                                <div style={{ fontWeight: 1000, fontSize: 12 }}>
                                  {r.value}
                                </div>
                              </div>
                              <div
                                className="p-muted"
                                style={{
                                  marginTop: 6,
                                  fontSize: 12,
                                  lineHeight: 1.35,
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
                  <div style={{ gridColumn: "span 4" }}>
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.08)",
                        background: "rgba(255,255,255,0.02)",
                        height: "100%",
                      }}
                    >
                      <div style={{ fontWeight: 1000 }}>Next session</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        3-step plan
                      </div>

                      <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
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
                              <div style={{ fontWeight: 900, fontSize: 12 }}>
                                Step {idx + 1}: {s.title}
                              </div>
                              <div
                                className="p-muted"
                                style={{
                                  marginTop: 6,
                                  fontSize: 12,
                                  lineHeight: 1.35,
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

                {/* --- Recovery & Projection (compact) --- */}
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <div style={{ fontWeight: 1000, fontSize: 14 }}>
                    Recovery & Projection
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(12, 1fr)",
                      gap: 10,
                    }}
                  >
                    <div style={{ gridColumn: "span 4" }}>
                      <MiniKPI
                        label="Trades needed to recover"
                        value={proj ? (proj.tradesToRecover ?? 0) : "—"}
                        hint="rough estimate"
                      />
                    </div>

                    <div style={{ gridColumn: "span 4" }}>
                      <MiniKPI
                        label="Risk of further DD"
                        value={proj ? fmtPctOrDash(proj.riskOfFurtherDD) : "—"}
                        hint="0–100% heuristic"
                      />
                    </div>

                    <div style={{ gridColumn: "span 4" }}>
                      <MiniKPI
                        label="Simulation if risk reduced"
                        value={
                          proj
                            ? fmtMoneyLike(proj.simHalfSizeExpectancy ?? 0, ccy)
                            : "—"
                        }
                        hint="expectancy @ 50% size"
                      />
                    </div>
                  </div>

                  {/* Recovery speed vs historical (compact text line) */}
                  <div
                    className="p-muted"
                    style={{
                      padding: "10px 12px",
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.02)",
                      fontSize: 12,
                      lineHeight: 1.45,
                    }}
                  >
                    <b>Recovery speed vs historical:</b>{" "}
                    {proj?.recoverySpeedHint ? proj.recoverySpeedHint : "—"}
                  </div>
                </div>

                {/* optional mini policy line */}
                {risk?.policy ? (
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    <b>Policy:</b> max trades {risk.policy.maxTradesToday} ·
                    size {Math.round(risk.policy.sizeMultiplier * 100)}% · stop{" "}
                    {fmtMoney(risk.policy.maxDailyLoss)}
                  </div>
                ) : null}
              </div>
            ) : null}
            {tab === "forecast" ? (
              <div style={{ display: "grid", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 1000, fontSize: 16 }}>Forecast</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    What happens if you continue like this — or change behavior?
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {[20, 50, 100].map((h) => (
                    <button
                      key={h}
                      className={
                        horizon === h ? "btn-primary" : "btn-secondary"
                      }
                      onClick={() => setHorizon(h)}
                    >
                      {h} trades
                    </button>
                  ))}
                </div>

                {!risk?.scenarioForecasts?.length ? (
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    Not enough data to simulate scenarios.
                  </div>
                ) : (
                  <>
                    {/* Scenario selector */}
                    <ScenarioSelector
                      scenarios={risk.scenarioForecasts}
                      ccy={ccy}
                    />
                  </>
                )}
              </div>
            ) : null}
          </RiskOS>

          {/* ===== 2) At a glance (moved down) ===== */}
          {/*
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
        </Section>     */}

          {/* ===== 3) Root Cause Intelligence ===== */}
          {/*

          <Section
            title="Root Cause Intelligence"
            subtitle="The system-level causes behind your risk — and the fastest fixes."
          >
            {((risk as any)?.rootCauses ?? []).length ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(12, 1fr)",
                  gap: 12,
                }}
              >
              */}
          {/* Left: causes */}
          {/*

                <div style={{ gridColumn: "span 5" }}>
                  <div style={{ display: "grid", gap: 10 }}>
                    {(risk as any).rootCauses
                      .slice(0, 3)
                      .map((c: any, idx: number) => (
                        <div
                          key={c.key ?? idx}
                          style={{
                            padding: "12px 12px",
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
                            <div style={{ fontWeight: 1000 }}>
                              <span
                                className="p-muted"
                                style={{ fontSize: 12, marginRight: 8 }}
                              >
                                #{idx + 1}
                              </span>
                              {c.title}
                            </div>
                            {sevPill(c.severity)}
                          </div>

                          <div
                            className="p-muted"
                            style={{
                              marginTop: 8,
                              fontSize: 12,
                              lineHeight: 1.45,
                            }}
                          >
                            <div>
                              <b>Evidence:</b> {c.evidence}
                            </div>
                            <div style={{ marginTop: 6 }}>
                              <b>Impact:</b> {c.impactHint}
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
                */}

          {/* Right: countermeasures */}
          {/*

                <div style={{ gridColumn: "span 7" }}>
                  <div style={{ display: "grid", gap: 10 }}>
                    {((risk as any)?.countermeasures ?? [])
                      .slice(0, 3)
                      .map((m: any, idx: number) => (
                        <div
                          key={m.key ?? idx}
                          style={{
                            padding: "12px 12px",
                            borderRadius: 14,
                            border: "1px solid rgba(255,255,255,0.08)",
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <div style={{ fontWeight: 1000 }}>{m.title}</div>

                          <ul
                            style={{
                              marginTop: 8,
                              paddingLeft: 18,
                              lineHeight: 1.55,
                            }}
                          >
                            {(m.steps ?? [])
                              .slice(0, 4)
                              .map((s: string, i: number) => (
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
                            <b>Metric to watch:</b> {m.metricToWatch}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="card"
                style={{
                  padding: 14,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ fontWeight: 1000 }}>
                  No major root causes detected
                </div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Your current risk triggers are low. Keep sizing stable and
                  protect green days.
                </div>
              </div>
            )}
    </Section>
    */}

          {/* ===== 4) Plan ===== */}
          {/*

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
            */}

          {/* Best Move + Rules now */}
          {/*

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
              */}

          {/* Next Session Plan */}
          {/*
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
            */}

          {/* Countermeasures (full width) */}
          {/*
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
            */}

          {/* Trading Policy + Checklist (optional, collapsed later in Step 4) */}
          {/*
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
          */}

          {/* ===== Details (deep dive) ===== */}
          {/*
          <Section
            title="Details"
            subtitle="More analytics and explanations — open only what you need."
          >
          */}

          {/* 1) Drivers */}
          {/*
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
            */}

          {/* 0) Behavior & Stability (Layer 3) */}
          {/*
            <Disclosure
              title="Behavior & Stability"
              subtitle="Overtrading, spiral days, recent stability, best/worst trades"
              defaultOpen={false}
            >
              {!layer3 ? (
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Not enough data yet.
                </div>
              ) : (
                <div style={{ display: "grid", gap: 12 }}>
                */}

          {/* Row 1: quick stats */}
          {/*
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(12, 1fr)",
                      gap: 12,
                    }}
                  >
                    <div style={{ gridColumn: "span 4" }}>
                      <StatCard
                        title="Trades / day (avg)"
                        value={(layer3.behavior?.tradesPerDayAvg ?? 0).toFixed(
                          1,
                        )}
                        sub={`Max/day: ${layer3.behavior?.tradesPerDayMax ?? 0}`}
                      />
                    </div>

                    <div style={{ gridColumn: "span 4" }}>
                      <StatCard
                        title="Active days"
                        value={layer3.behavior?.activeDays ?? 0}
                        sub={
                          layer3.behavior?.overtradingFlag
                            ? "Flag: Overtrading risk"
                            : "No overtrading flag"
                        }
                      />
                    </div>

                    <div style={{ gridColumn: "span 4" }}>
                      <StatCard
                        title="Recent stability (last 20)"
                        value={
                          layer3.recent?.recentStability == null
                            ? "—"
                            : layer3.recent.recentStability.toFixed(2)
                        }
                        sub={
                          layer3.recent?.recentAvg != null
                            ? `Avg: ${layer3.recent.recentAvg.toFixed(2)} • Std: ${layer3.recent.recentStd.toFixed(2)}`
                            : "—"
                        }
                      />
                    </div>
                  </div>
                  */}

          {/* Row 2: Spiral days + Tail risk */}
          {/*
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(12, 1fr)",
                      gap: 12,
                    }}
                  >
                    <div style={{ gridColumn: "span 7" }}>
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.02)",
                        }}
                      >
                        <div style={{ fontWeight: 1000 }}>Spiral days</div>
                        <div
                          className="p-muted"
                          style={{ marginTop: 6, fontSize: 12 }}
                        >
                          Many trades + negative day PnL (last 10)
                        </div>

                        {(layer3.behavior?.spiralDays ?? []).length ? (
                          <div
                            style={{ marginTop: 10, display: "grid", gap: 8 }}
                          >
                            {layer3.behavior.spiralDays.map((x: any) => (
                              <div
                                key={x.day}
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: 12,
                                  padding: "10px 12px",
                                  borderRadius: 12,
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  background: "rgba(255,255,255,0.03)",
                                }}
                              >
                                <div style={{ fontWeight: 900, fontSize: 12 }}>
                                  {x.day}
                                </div>
                                <div
                                  className="p-muted"
                                  style={{ fontSize: 12 }}
                                >
                                  {x.count} trades
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            className="p-muted"
                            style={{ marginTop: 10, fontSize: 12 }}
                          >
                            No spiral days detected.
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ gridColumn: "span 5" }}>
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.02)",
                          height: "100%",
                        }}
                      >
                        <div style={{ fontWeight: 1000 }}>Tail risk</div>
                        <div
                          className="p-muted"
                          style={{ marginTop: 6, fontSize: 12 }}
                        >
                          How concentrated your biggest losses are
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <StatCard
                            title="Top-3 loss concentration"
                            value={`${Math.round((layer3.tailRisk?.tailConcentration ?? 0) * 100)}%`}
                            sub={
                              layer3.tailRisk?.tailRiskFlag
                                ? "Flag: Outlier losses dominate"
                                : "No tail-risk flag"
                            }
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                  */}

          {/* Row 3: Best / Worst trades */}
          {/*
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(12, 1fr)",
                      gap: 12,
                    }}
                  >
                    <div style={{ gridColumn: "span 6" }}>
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.02)",
                        }}
                      >
                        <div style={{ fontWeight: 1000 }}>Best trades</div>
                        <div
                          className="p-muted"
                          style={{ marginTop: 6, fontSize: 12 }}
                        >
                          Top 3 by PnL
                        </div>

                        {(layer3.examples?.bestTrades ?? []).length ? (
                          <div
                            style={{ marginTop: 10, display: "grid", gap: 8 }}
                          >
                            {layer3.examples.bestTrades.map(
                              (t: any, i: number) => (
                                <div
                                  key={`${t.day}-${i}`}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    background: "rgba(255,255,255,0.03)",
                                  }}
                                >
                                  <div
                                    style={{ fontWeight: 900, fontSize: 12 }}
                                  >
                                    {t.day}
                                  </div>
                                  <div
                                    style={{
                                      fontWeight: 1000,
                                      color: "#36d399",
                                    }}
                                  >
                                    +{t.pnl.toFixed(2)}
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        ) : (
                          <div
                            className="p-muted"
                            style={{ marginTop: 10, fontSize: 12 }}
                          >
                            —
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ gridColumn: "span 6" }}>
                      <div
                        style={{
                          padding: 12,
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background: "rgba(255,255,255,0.02)",
                        }}
                      >
                        <div style={{ fontWeight: 1000 }}>Worst trades</div>
                        <div
                          className="p-muted"
                          style={{ marginTop: 6, fontSize: 12 }}
                        >
                          Bottom 3 by PnL
                        </div>

                        {(layer3.examples?.worstTrades ?? []).length ? (
                          <div
                            style={{ marginTop: 10, display: "grid", gap: 8 }}
                          >
                            {layer3.examples.worstTrades.map(
                              (t: any, i: number) => (
                                <div
                                  key={`${t.day}-${i}`}
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    padding: "10px 12px",
                                    borderRadius: 12,
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    background: "rgba(255,255,255,0.03)",
                                  }}
                                >
                                  <div
                                    style={{ fontWeight: 900, fontSize: 12 }}
                                  >
                                    {t.day}
                                  </div>
                                  <div
                                    style={{
                                      fontWeight: 1000,
                                      color: "#ff6b6b",
                                    }}
                                  >
                                    {t.pnl.toFixed(2)}
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        ) : (
                          <div
                            className="p-muted"
                            style={{ marginTop: 10, fontSize: 12 }}
                          >
                            —
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Disclosure>
            */}

          {/* 2) Risk Score */}
          {/*
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
              */}

          {/* Left: Score + penalties */}
          {/*
                <div className="tv-col-5" style={{ gridColumn: "span 5" }}>
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
                          Rule-based score from drawdown, streaks,
                          inconsistency, overtrading.
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
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                }}
                              >
                                <div style={{ fontWeight: 900, fontSize: 12 }}>
                                  {b.label}
                                </div>
                                <div
                                  className="p-muted"
                                  style={{ fontSize: 12 }}
                                >
                                  {b.value}
                                </div>
                              </div>
                              <div
                                style={{
                                  fontWeight: 1000,
                                  color: "#ff6b6b",
                                }}
                              >
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
                */}

          {/* Right: Guidance / actions */}
          {/*
                <div className="tv-col-7" style={{ gridColumn: "span 7" }}>
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
                          <b>Consistency:</b> keep trade size stable (avoid big
                          size jumps).
                        </li>
                        <li>
                          <b>Overtrading:</b> cap trades/day (e.g. max 5–10).
                        </li>
                      </ul>
                    </div>
                  </div>
                </div>
                */}

          {/* Mobile fallback hint (optional) */}
          {/*
                <div
                  className="p-muted"
                  style={{ gridColumn: "span 12", fontSize: 12 }}
                >
                  Tip: Use this score as a “risk thermometer” — don’t optimize
                  it day-to-day.
                </div>
              </div>
            </Disclosure>
            */}

          {/* 3) Explanation */}
          {/*
            <Disclosure
              title="Why this score"
              subtitle="Reasons + 3 rules to improve"
              defaultOpen={false}
            >
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
            </Disclosure>
            */}

          {/* 4) Drawdown phases */}
          {/*
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
            */}

          {/* Active phase */}
          {/*
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
              */}

          {/* Last phases */}
          {/*
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
                          <b style={{ color: "#ff6b6b" }}>
                            {fmtMoney(p.depth)}
                          </b>{" "}
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
                          {p.recoveryDays == null
                            ? "—"
                            : fmtDays(p.recoveryDays)}
                        </b>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  className="p-muted"
                  style={{ marginTop: 12, fontSize: 12 }}
                >
                  Not enough history yet to detect drawdown phases.
                </div>
              )}
            </Disclosure>

            {/* 5) Roadmap
            <Disclosure
              title="Next actions (v1)"
              subtitle="Roadmap of what comes next"
              defaultOpen={false}
            >
              <div className="p-muted" style={{ lineHeight: 1.4 }}>
                This is the first “Risk OS” layer. Next we’ll add:
                <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                  <li>Drawdown period detection (start/end, recovery time)</li>
                  <li>Overtrading & “loss-streak escalation” signals</li>
                  <li>Rules: max daily loss / max trades per day</li>
                </ul>
              </div>
            </Disclosure>

        </Section>
        */}
        </>
      )}
    </main>
  );
}

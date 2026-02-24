"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { DEFAULT_CCY, fmtMoney, fmtPercent } from "@/lib/format";
import { mapTradesToRiskEvents } from "@/core/risk/mappers/mapTradesToRiskEvents";
import type { RiskEvent } from "@/core/risk/types";
import { mapOpenPositionsToRiskEvents } from "@/core/risk/mappers/mapOpenPositionsToRiskEvents";

const DAYSTART_KEY = "tv:dayStartEquity:v1";
const DAYSTART_DATE_KEY = "tv:dayStartEquityDate:v1";

function yyyyMmDdUtc(ts: number) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
    d.getUTCDate(),
  ).padStart(2, "0")}`;
}

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

function stateBadge(state: string) {
  const base: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    padding: "6px 12px",
    borderRadius: 999,
    fontSize: 12,
    fontWeight: 1000,
    border: "1px solid rgba(255,255,255,0.12)",
    letterSpacing: 0.3,
  };

  const map: Record<string, React.CSSProperties> = {
    SAFE: { background: "rgba(0,212,255,0.10)" },
    WARNING: { background: "rgba(255,255,72,0.10)" },
    DANGER: { background: "rgba(255,160,72,0.14)" },
    CRITICAL: { background: "rgba(255,72,72,0.14)" },
  };

  return {
    ...base,
    ...(map[state] ?? { background: "rgba(255,255,255,0.06)" }),
  };
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

export default function ControlCenterPage() {
  const router = useRouter();
  const { data } = useTradeSession();

  const uploadEvents = useMemo(() => {
    return mapTradesToRiskEvents(data?.trades ?? []);
  }, [data]);

  const [tradeEvents, setTradeEvents] = useState<RiskEvent[]>([]);

  const events = useMemo(() => {
    const merged = [...tradeEvents, ...uploadEvents];

    // ✅ Dedupe: gleicher Trade (symbol+ts+realizedPnl+fee) nur einmal
    const seen = new Set<string>();
    const unique = merged.filter((e) => {
      const k = `${e.type}|${e.symbol}|${e.ts}|${e.realizedPnl ?? 0}|${e.fee ?? 0}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    unique.sort((a, b) => a.ts - b.ts);
    return unique;
  }, [tradeEvents, uploadEvents]);

  const [liveEquity, setLiveEquity] = useState<number | null>(null);
  const [liveTs, setLiveTs] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadEquity() {
      try {
        const res = await fetch("/api/bitget/equity", { cache: "no-store" });
        const json = await res.json();

        if (!alive) return;

        const eq = Number(json?.equity ?? 0);
        const ts = Number(json?.ts ?? Date.now());

        setLiveEquity(Number.isFinite(eq) ? eq : null);
        setLiveTs(Number.isFinite(ts) ? ts : Date.now());
        // ✅ DayStartEquity setzen (1x pro UTC-Tag)
        if (Number.isFinite(eq) && eq > 0) {
          const today = yyyyMmDdUtc(ts);
          const savedDate = localStorage.getItem(DAYSTART_DATE_KEY);
          const savedEq = localStorage.getItem(DAYSTART_KEY);

          if (savedDate !== today || !savedEq) {
            localStorage.setItem(DAYSTART_DATE_KEY, today);
            localStorage.setItem(DAYSTART_KEY, String(eq));
          }
        }
      } catch {
        if (!alive) return;
        setLiveEquity(null);
        setLiveTs(null);
      }
    }

    loadEquity();
    const id = setInterval(loadEquity, 10_000); // alle 10s
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    let alive = true;

    async function loadTrades() {
      try {
        const res = await fetch("/api/bitget/trades?lookbackDays=30", {
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);

        if (!alive) return;

        if (res.ok && json?.ok && Array.isArray(json?.events)) {
          setTradeEvents(json.events);
        } else {
          console.error("Trades fetch failed", json);
          setTradeEvents([]);
        }
      } catch (e) {
        if (!alive) return;
        console.error("Trades fetch crashed", e);
        setTradeEvents([]);
      }
    }

    loadTrades();
    const id = setInterval(loadTrades, 60_000); // alle 60s reicht
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const hasData = events.length > 0 || liveEquity != null;

  const [os, setOs] = useState<any>(null);

  const [showWhy, setShowWhy] = useState(false);

  const [guardrails, setGuardrails] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      return JSON.parse(localStorage.getItem("tv_guardrails") || "null");
    } catch {
      return null;
    }
  });

  useEffect(() => {
    function refresh() {
      try {
        setGuardrails(
          JSON.parse(localStorage.getItem("tv_guardrails") || "null"),
        );
      } catch {
        setGuardrails(null);
      }
    }

    // 1) direkt beim Mount
    refresh();

    // 2) wenn user in anderem Tab speichert
    window.addEventListener("storage", refresh);

    // 3) wenn user zurückkommt (Settings -> Control)
    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  useEffect(() => {
    if (!events.length && liveTs == null) return;

    const ac = new AbortController();

    async function runRisk() {
      try {
        // 1) Equity Snapshot (wenn vorhanden)

        // 1) Hole Snapshot vom Backend
        const snapRes = await fetch("/api/bitget/snapshot", {
          cache: "no-store",
          signal: ac.signal,
        });

        const snapJson = await snapRes.json().catch(() => null);

        let snapshotEvents: RiskEvent[] = [];

        // ✅ DayStart Equity Event (für DailyLossEngine)
        const dayStartEqRaw =
          typeof window !== "undefined"
            ? localStorage.getItem(DAYSTART_KEY)
            : null;

        const dayStartEq = dayStartEqRaw ? Number(dayStartEqRaw) : null;

        const dayStartEvent: RiskEvent[] =
          dayStartEq != null && Number.isFinite(dayStartEq) && dayStartEq > 0
            ? [
                {
                  id: `eq-daystart-${yyyyMmDdUtc(Date.now())}`,
                  type: "EQUITY_SNAPSHOT",
                  ts: Date.UTC(
                    new Date().getUTCFullYear(),
                    new Date().getUTCMonth(),
                    new Date().getUTCDate(),
                    0,
                    0,
                    0,
                    0,
                  ),
                  equity: dayStartEq,
                  meta: { source: "local-daystart" },
                },
              ]
            : [];

        if (snapRes.ok && snapJson?.ok && Array.isArray(snapJson.events)) {
          snapshotEvents = snapJson.events;
        } else {
          console.error("Snapshot failed", snapJson);
        }

        // 1.5) Open Positions Snapshot (Realtime Exposure)
        let posEvents: RiskEvent[] = [];

        try {
          const posRes = await fetch("/api/bitget/open-positions", {
            cache: "no-store",
            signal: ac.signal,
          });

          const posJson = await posRes.json().catch(() => null);

          if (posRes.ok && posJson?.ok && Array.isArray(posJson?.positions)) {
            const tsNow = snapshotEvents[0]?.ts ?? liveTs ?? Date.now();
            posEvents = mapOpenPositionsToRiskEvents(posJson.positions, tsNow);
          } else {
            console.error("Open positions failed", posJson);
          }
        } catch (e: any) {
          if (e?.name === "AbortError") return; // ✅ ignore
          console.error("Open positions fetch crashed", e);
        }

        // 2) Combine: Equity zuerst, dann Trades
        const combinedEvents = [
          ...dayStartEvent,
          ...snapshotEvents,
          ...posEvents,
          ...events,
        ].sort((a, b) => a.ts - b.ts);

        const res = await fetch("/api/risk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ events: combinedEvents, guardrails }),
          signal: ac.signal,
        });

        const contentType = res.headers.get("content-type") ?? "";
        const text = await res.text();

        // A) Empty body => meistens 405/500 / Route nicht getroffen
        if (!text) {
          console.error("API returned empty body", {
            status: res.status,
            ok: res.ok,
          });
          setOs(null);
          return;
        }

        // B) Wenn HTML o.ä. kommt (z.B. Error page), nicht JSON-parsen
        if (!contentType.includes("application/json")) {
          console.error("API returned non-JSON content-type:", contentType, {
            status: res.status,
            ok: res.ok,
            sample: text.slice(0, 300),
          });
          setOs(null);
          return;
        }

        // C) JSON parse
        let json: any;
        try {
          json = JSON.parse(text);
        } catch {
          console.error("API returned invalid JSON:", text.slice(0, 300));
          setOs(null);
          return;
        }

        // D) HTTP error payload loggen
        if (!res.ok) {
          console.error("API error payload:", json, { status: res.status });
          setOs(null);
          return;
        }

        // E) ✅ Unterstütze beide Response-Shapes:
        // - { os: ... }
        // - direkt: { equity, exposure, ... }
        setOs(json?.os ?? json);

        console.log("[control] os keys:", Object.keys(json?.os ?? json ?? {}));
        console.log("[control] deviations:", (json?.os ?? json)?.deviations);
        console.log("[control] baselines:", (json?.os ?? json)?.baselines);
      } catch (err: any) {
        if (err?.name === "AbortError") return;
        console.error("runRisk crashed:", err);
        setOs(null);
      }
    }

    runRisk();

    return () => {
      ac.abort();
    };
  }, [events, liveTs, guardrails]);

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

          <div className="p-muted" style={{ marginTop: 4, fontSize: 12 }}>
            Deviations:{" "}
            <b style={{ color: "var(--text)" }}>
              {os?.deviations?.deviations?.length ?? 0}
            </b>
          </div>

          <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
            wrapperOk:{" "}
            <b style={{ color: "var(--text)" }}>{String((os as any)?.ok)}</b>
          </div>

          <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
            Samples:{" "}
            <b style={{ color: "var(--text)" }}>
              {os?.deviations?.meta?.tradeSamplesUsed ?? "—"}
            </b>{" "}
            | Baseline trades:{" "}
            <b style={{ color: "var(--text)" }}>
              {os?.baselines?.[0]?.evidence?.tradesUsed ?? "—"}
            </b>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn-secondary"
              onClick={() => router.push("/settings/risk")}
            >
              Risk Settings
            </button>
          </div>
        </div>
      </div>

      {os?.riskState?.state === "CRITICAL" ? (
        <div
          className="card"
          style={{ padding: 16, border: "1px solid rgba(255,72,72,0.35)" }}
        >
          <div style={{ fontWeight: 1000, fontSize: 14 }}>
            🚨 Capital Protection Mode: CRITICAL
          </div>

          <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
            Action:{" "}
            <b style={{ color: "var(--text)" }}>
              {os?.riskState?.recommendedAction ?? "—"}
            </b>
          </div>

          <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
            {(os?.riskState?.reasons ?? [])
              .slice(0, 3)
              .map((r: string, i: number) => (
                <div key={i}>• {r}</div>
              ))}

            {showWhy && os?.riskState?.explain ? (
              <div style={{ marginTop: 12, ...cardInner() }}>
                <div
                  className="p-muted"
                  style={{ fontSize: 12, fontWeight: 900 }}
                >
                  TRIGGER
                </div>

                <div style={{ marginTop: 8, fontSize: 12 }}>
                  {(os.riskState.explain.triggeredBy ?? []).length ? (
                    (os.riskState.explain.triggeredBy as string[]).map(
                      (t, i) => <div key={i}>• {t}</div>,
                    )
                  ) : (
                    <div className="p-muted">No triggers (SAFE).</div>
                  )}
                </div>

                <div
                  className="p-muted"
                  style={{ marginTop: 12, fontSize: 12, fontWeight: 900 }}
                >
                  METRICS
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
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span className="p-muted">Daily loss used</span>
                    <b>
                      {os.riskState.explain.metrics.dailyLossUsedPct != null
                        ? `${os.riskState.explain.metrics.dailyLossUsedPct}%`
                        : "—"}
                    </b>
                  </div>
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span className="p-muted">Drawdown</span>
                    <b>
                      {os.riskState.explain.metrics.drawdownPct != null
                        ? `${os.riskState.explain.metrics.drawdownPct}%`
                        : "—"}
                    </b>
                  </div>
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span className="p-muted">Survival score</span>
                    <b>
                      {os.riskState.explain.metrics.survivalScore != null
                        ? `${os.riskState.explain.metrics.survivalScore}/100`
                        : "—"}
                    </b>
                  </div>
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span className="p-muted">Top deviation</span>
                    <b>
                      {os.riskState.explain.metrics.topDeviationSeverity ?? "—"}
                    </b>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

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
              gridTemplateColumns: "1fr 1fr 1fr",
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <div style={{ fontWeight: 1000 }}>Risk Status</div>
                <span style={stateBadge(String(os?.riskState?.state ?? "—"))}>
                  {String(os?.riskState?.state ?? "—")}
                </span>
              </div>

              <button
                className="btn-secondary"
                style={{ padding: "6px 10px", fontSize: 12 }}
                onClick={() => setShowWhy((v) => !v)}
              >
                {showWhy ? "Hide" : "Why?"}
              </button>

              <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                One action. Based on deterministic rules.
              </div>

              <div style={{ marginTop: 12, ...cardInner() }}>
                <div style={{ fontWeight: 1000 }}>
                  {os?.riskState?.recommendedAction ?? "—"}
                </div>

                <div
                  className="p-muted"
                  style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}
                >
                  {(os?.riskState?.reasons ?? [])
                    .slice(0, 3)
                    .map((r: string, i: number) => (
                      <div key={i}>• {r}</div>
                    ))}
                </div>
              </div>

              <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
                <div>
                  Daily loss used:{" "}
                  <b style={{ color: "var(--text)" }}>
                    {os?.riskState?.flags?.dailyLossUsedRatio != null
                      ? `${Math.round(Number(os.riskState.flags.dailyLossUsedRatio) * 100)}%`
                      : "—"}
                  </b>
                </div>
                <div>
                  DD:{" "}
                  <b style={{ color: "var(--text)" }}>
                    {os?.riskState?.flags?.currentDrawdownPct != null
                      ? `${Math.round(Number(os.riskState.flags.currentDrawdownPct) * 1000) / 10}%`
                      : "—"}
                  </b>
                </div>
                <div>
                  Top deviation:{" "}
                  <b style={{ color: "var(--text)" }}>
                    {os?.riskState?.flags?.topDeviationSeverity ?? "—"}
                  </b>
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

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Guardrails</div>
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Your safety limits (deterministic). Pro feature later.
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              <div style={cardInner()}>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span className="p-muted">Daily loss limit</span>
                  <b>
                    {guardrails?.dailyLossLimitPct != null
                      ? `${Math.round(Number(guardrails.dailyLossLimitPct) * 1000) / 10}%`
                      : "—"}
                  </b>
                </div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Used today:{" "}
                  <b style={{ color: "var(--text)" }}>
                    {os?.riskState?.flags?.dailyLossUsedRatio != null
                      ? `${Math.round(Number(os.riskState.flags.dailyLossUsedRatio) * 100)}%`
                      : "—"}
                  </b>
                </div>
              </div>

              <div style={cardInner()}>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span className="p-muted">Max drawdown limit</span>
                  <b>
                    {guardrails?.ddHardStopPct != null
                      ? `${Math.round(Number(guardrails.ddHardStopPct) * 1000) / 10}%`
                      : "—"}
                  </b>
                </div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Current DD:{" "}
                  <b style={{ color: "var(--text)" }}>
                    {os?.riskState?.flags?.currentDrawdownPct != null
                      ? `${Math.round(Number(os.riskState.flags.currentDrawdownPct) * 1000) / 10}%`
                      : "—"}
                  </b>
                </div>
              </div>

              <div style={cardInner()}>
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <span className="p-muted">Cooldown after loss streak</span>
                  <b>
                    {guardrails?.lossStreakHardStop != null
                      ? `Hard-stop at ${guardrails.lossStreakHardStop}`
                      : "—"}
                  </b>
                </div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Current streak: <b style={{ color: "var(--text)" }}></b>
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

"use client";

import React, { useMemo, useState } from "react";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { useRouter } from "next/navigation";
import { DEFAULT_CCY, fmtMoney } from "@/lib/format";
import { getSnapshotAt, type Timeframe } from "@/lib/intel/marketData";

type AnyPos = any;

function normalizeSymbol(s: any) {
  const v = String(s ?? "").trim();
  return v || "—";
}

function getSide(p: any): "LONG" | "SHORT" | "UNKNOWN" {
  const raw = String(
    p?.side ?? p?.positionSide ?? p?.direction ?? p?.type ?? p?.tradeType ?? "",
  ).toUpperCase();
  if (raw.includes("LONG") || raw === "BUY") return "LONG";
  if (raw.includes("SHORT") || raw === "SELL") return "SHORT";
  return "UNKNOWN";
}

function getEntryExitFromPosition(p: any) {
  const entry =
    p?.entryPrice ??
    p?.avgEntryPrice ??
    p?.openPrice ??
    p?.entry ??
    p?.price ??
    p?.fillPrice ??
    null;

  const exit =
    p?.exitPrice ??
    p?.avgExitPrice ??
    p?.closePrice ??
    p?.exit ??
    p?.close ??
    p?.exitFillPrice ??
    null;

  const entryPx = entry != null ? Number(entry) : null;
  const exitPx = exit != null ? Number(exit) : null;

  return {
    entryPx: Number.isFinite(entryPx as any) ? (entryPx as number) : null,
    exitPx: Number.isFinite(exitPx as any) ? (exitPx as number) : null,
  };
}

function parseIso(x: any): string | null {
  if (!x) return null;
  const d = new Date(x);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function cardInner(): React.CSSProperties {
  return {
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 14,
    background: "rgba(255,255,255,0.02)",
  };
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

function fmtNum(x: any, d = 2) {
  const n = Number(x);
  return Number.isFinite(n) ? n.toFixed(d) : "—";
}

export default function IntelPage() {
  const router = useRouter();
  const { data } = useTradeSession();
  const positions = useMemo(() => (data?.positions ?? []) as AnyPos[], [data]);

  const hasSession = positions.length > 0;

  // MVP timeframe selector (later: advanced)
  const [tf, setTf] = useState<Timeframe>("15m");

  // selected position
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // snapshots
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [entrySnap, setEntrySnap] = useState<any>(null);
  const [exitSnap, setExitSnap] = useState<any>(null);

  // keep list short so page stays compact
  const list = useMemo(() => {
    const out = [...positions];
    // newest first if closedAt exists
    out.sort((a, b) =>
      String(b?.closedAt ?? b?.openedAt ?? "").localeCompare(
        String(a?.closedAt ?? a?.openedAt ?? ""),
      ),
    );
    return out.slice(0, 20);
  }, [positions]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    return (
      list.find(
        (p) => String(p?.id ?? p?._id ?? p?.uid ?? "") === selectedId,
      ) ?? null
    );
  }, [selectedId, list]);

  async function loadIntel(p: AnyPos) {
    setLoading(true);
    setErr(null);
    setEntrySnap(null);
    setExitSnap(null);

    try {
      const symbol = normalizeSymbol(p?.symbol);
      const openedAt =
        parseIso(p?.openedAt ?? p?.openTime ?? p?.entryTime ?? p?.entryAt) ??
        null;
      const closedAt =
        parseIso(p?.closedAt ?? p?.closeTime ?? p?.exitTime ?? p?.exitAt) ??
        null;

      if (!openedAt) {
        throw new Error("Position has no valid openedAt timestamp.");
      }

      // entry snapshot (required)
      const entry = await getSnapshotAt({
        symbol,
        tf,
        isoTime: openedAt,
        lookbackDays: 120,
      });

      // exit snapshot (optional)
      const exit = closedAt
        ? await getSnapshotAt({
            symbol,
            tf,
            isoTime: closedAt,
            lookbackDays: 120,
          })
        : null;

      setEntrySnap(entry);
      setExitSnap(exit);
    } catch (e: any) {
      setErr(e?.message ?? "Intel load failed");
    } finally {
      setLoading(false);
    }
  }

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
      {/* Header */}
      <div className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 1000, fontSize: 18 }}>Intel</div>
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Indicator snapshots at Entry/Exit (real market candles). MVP v1.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select value={tf} onChange={(e) => setTf(e.target.value as any)}>
              <option value="1m">1m</option>
              <option value="5m">5m</option>
              <option value="15m">15m</option>
              <option value="1h">1h</option>
              <option value="4h">4h</option>
              <option value="1d">1d</option>
            </select>

            <button
              className="btn-secondary"
              onClick={() => router.push("/positions")}
            >
              Positions
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/mentor")}
            >
              Mentor
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/performance")}
            >
              Performance
            </button>
          </div>
        </div>
      </div>

      {!hasSession ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 1000 }}>No session loaded</div>
          <div className="p-muted" style={{ marginTop: 8 }}>
            Upload a CSV first so we can build positions and compute Intel.
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "360px 1fr",
            gap: 12,
            alignItems: "start",
          }}
        >
          {/* LEFT: compact positions list */}
          <div className="card" style={{ padding: 12 }}>
            <div style={{ fontWeight: 1000, marginBottom: 8 }}>
              Pick a position
            </div>
            <div className="p-muted" style={{ fontSize: 12, marginBottom: 10 }}>
              Showing latest {list.length}. Click to load Entry/Exit snapshots.
            </div>

            <div
              style={{
                display: "grid",
                gap: 8,
                maxHeight: 520,
                overflow: "auto",
                paddingRight: 4,
              }}
            >
              {list.map((p) => {
                const id = String(
                  p?.id ??
                    p?._id ??
                    p?.uid ??
                    p?.timestamp ??
                    p?.openedAt ??
                    Math.random(),
                );
                const sym = normalizeSymbol(p?.symbol);
                const side = getSide(p);
                const net = Number(p?.netProfit ?? 0);

                const isSel = selectedId === id;

                return (
                  <button
                    key={id}
                    className="btn-secondary"
                    style={{
                      textAlign: "left",
                      padding: 10,
                      borderRadius: 14,
                      background: isSel ? "rgba(0,212,255,0.08)" : undefined,
                      borderColor: isSel ? "rgba(0,212,255,0.35)" : undefined,
                    }}
                    onClick={() => {
                      setSelectedId(id);
                      loadIntel(p);
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div style={{ fontWeight: 1000, fontSize: 13 }}>
                        {sym} · {side}
                      </div>
                      <div
                        className={pnlClass(net)}
                        style={{ fontWeight: 1000, fontSize: 13 }}
                      >
                        {fmtMoney(net, DEFAULT_CCY)}
                      </div>
                    </div>
                    <div
                      className="p-muted"
                      style={{ fontSize: 11, marginTop: 4 }}
                    >
                      {String(p?.openedAt ?? p?.openTime ?? "").slice(0, 16) ||
                        "—"}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* RIGHT: intel detail */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Intel Panel</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Timeframe: <b style={{ color: "var(--text)" }}>{tf}</b> · Data
              source: Binance candles (public)
            </div>

            {!selected ? (
              <div style={{ marginTop: 14, ...cardInner() }}>
                <div style={{ fontWeight: 1000 }}>Select a position</div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  We’ll show RSI, MACD, EMA, ATR at Entry/Exit.
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 14, display: "grid", gap: 12 }}>
                {/* selected meta */}
                <div style={cardInner()}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 1000, fontSize: 15 }}>
                        {normalizeSymbol(selected.symbol)} · {getSide(selected)}
                      </div>
                      <div
                        className="p-muted"
                        style={{ fontSize: 12, marginTop: 4 }}
                      >
                        opened:{" "}
                        {String(
                          selected?.openedAt ??
                            selected?.openTime ??
                            selected?.entryTime ??
                            "—",
                        )}
                        {selected?.closedAt || selected?.closeTime
                          ? ` · closed: ${String(selected?.closedAt ?? selected?.closeTime ?? "—")}`
                          : ""}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div
                        className={pnlClass(Number(selected?.netProfit ?? 0))}
                        style={{ fontWeight: 1000 }}
                      >
                        {fmtMoney(
                          Number(selected?.netProfit ?? 0),
                          DEFAULT_CCY,
                        )}
                      </div>
                      {(() => {
                        const { entryPx, exitPx } =
                          getEntryExitFromPosition(selected);
                        return (
                          <div
                            className="p-muted"
                            style={{ fontSize: 12, marginTop: 4 }}
                          >
                            entry{" "}
                            <b style={{ color: "var(--text)" }}>
                              {entryPx != null ? entryPx : "—"}
                            </b>{" "}
                            · exit{" "}
                            <b style={{ color: "var(--text)" }}>
                              {exitPx != null ? exitPx : "—"}
                            </b>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>

                {loading ? (
                  <div style={cardInner()}>
                    <div style={{ fontWeight: 1000 }}>
                      Loading market intel…
                    </div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      Fetching candles + computing indicators.
                    </div>
                  </div>
                ) : err ? (
                  <div style={cardInner()}>
                    <div style={{ fontWeight: 1000 }}>Intel failed</div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      {err}
                    </div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      Tip: some symbols might not exist on Binance (or need a
                      different quote).
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    {/* ENTRY */}
                    <div style={cardInner()}>
                      <div style={{ fontWeight: 1000 }}>Entry snapshot</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        Candle close at / before entry time
                      </div>

                      <div
                        style={{
                          marginTop: 10,
                          display: "grid",
                          gap: 8,
                          fontSize: 12,
                        }}
                      >
                        <div className="p-muted">
                          candle close:{" "}
                          <b style={{ color: "var(--text)" }}>
                            {fmtNum(entrySnap?.candle?.c, 6)}
                          </b>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 10,
                          }}
                        >
                          <div>
                            <div className="p-muted">RSI(14)</div>
                            <div style={{ fontWeight: 1000 }}>
                              {fmtNum(entrySnap?.indicators?.rsi14, 2)}
                            </div>
                          </div>
                          <div>
                            <div className="p-muted">ATR(14)</div>
                            <div style={{ fontWeight: 1000 }}>
                              {fmtNum(entrySnap?.indicators?.atr14, 6)}
                            </div>
                          </div>
                          <div>
                            <div className="p-muted">EMA(20)</div>
                            <div style={{ fontWeight: 1000 }}>
                              {fmtNum(entrySnap?.indicators?.ema20, 6)}
                            </div>
                          </div>
                          <div>
                            <div className="p-muted">EMA(50)</div>
                            <div style={{ fontWeight: 1000 }}>
                              {fmtNum(entrySnap?.indicators?.ema50, 6)}
                            </div>
                          </div>
                        </div>

                        <div style={{ marginTop: 4 }}>
                          <div className="p-muted">MACD</div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <span>macd</span>
                            <b>
                              {fmtNum(entrySnap?.indicators?.macd?.macd, 6)}
                            </b>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <span>signal</span>
                            <b>
                              {fmtNum(entrySnap?.indicators?.macd?.signal, 6)}
                            </b>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <span>hist</span>
                            <b>
                              {fmtNum(entrySnap?.indicators?.macd?.hist, 6)}
                            </b>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* EXIT */}
                    <div style={cardInner()}>
                      <div style={{ fontWeight: 1000 }}>Exit snapshot</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 6, fontSize: 12 }}
                      >
                        Candle close at / before exit time
                      </div>

                      {!exitSnap ? (
                        <div
                          className="p-muted"
                          style={{ marginTop: 10, fontSize: 12 }}
                        >
                          No exit time on this position.
                        </div>
                      ) : (
                        <div
                          style={{
                            marginTop: 10,
                            display: "grid",
                            gap: 8,
                            fontSize: 12,
                          }}
                        >
                          <div className="p-muted">
                            candle close:{" "}
                            <b style={{ color: "var(--text)" }}>
                              {fmtNum(exitSnap?.candle?.c, 6)}
                            </b>
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              gap: 10,
                            }}
                          >
                            <div>
                              <div className="p-muted">RSI(14)</div>
                              <div style={{ fontWeight: 1000 }}>
                                {fmtNum(exitSnap?.indicators?.rsi14, 2)}
                              </div>
                            </div>
                            <div>
                              <div className="p-muted">ATR(14)</div>
                              <div style={{ fontWeight: 1000 }}>
                                {fmtNum(exitSnap?.indicators?.atr14, 6)}
                              </div>
                            </div>
                            <div>
                              <div className="p-muted">EMA(20)</div>
                              <div style={{ fontWeight: 1000 }}>
                                {fmtNum(exitSnap?.indicators?.ema20, 6)}
                              </div>
                            </div>
                            <div>
                              <div className="p-muted">EMA(50)</div>
                              <div style={{ fontWeight: 1000 }}>
                                {fmtNum(exitSnap?.indicators?.ema50, 6)}
                              </div>
                            </div>
                          </div>

                          <div style={{ marginTop: 4 }}>
                            <div className="p-muted">MACD</div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
                              <span>macd</span>
                              <b>
                                {fmtNum(exitSnap?.indicators?.macd?.macd, 6)}
                              </b>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
                              <span>signal</span>
                              <b>
                                {fmtNum(exitSnap?.indicators?.macd?.signal, 6)}
                              </b>
                            </div>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
                              <span>hist</span>
                              <b>
                                {fmtNum(exitSnap?.indicators?.macd?.hist, 6)}
                              </b>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* small CTA */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    className="btn-secondary"
                    onClick={() => router.push("/positions")}
                  >
                    Open full positions
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => router.push("/mentor")}
                  >
                    Back to Mentor
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

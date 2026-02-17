"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { DEFAULT_CCY, fmtMoney, fmtPercent } from "@/lib/format";

// -----------------------------
// Types (so TS stops complaining)
// -----------------------------
type MentorRow = {
  symbol: string;
  side: "LONG" | "SHORT" | "UNKNOWN";
  net: number;

  openedAt?: string;
  closedAt?: string;
  entryPrice?: number | null;
  exitPrice?: number | null;

  holdMin?: number | null;
};

type ComboBucket = {
  key: string;
  symbol: string;
  side: "LONG" | "SHORT" | "UNKNOWN";
  holdBucket: string;

  count: number;
  wins: number;
  losses: number;
  winRate: number;

  net: number;
  avgNet: number;
};

// -----------------------------
// Helpers
// -----------------------------
function safeNum(x: any): number {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
}

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

  const qty = Number(
    p?.qty ?? p?.quantity ?? p?.size ?? p?.contracts ?? p?.positionSize,
  );
  if (Number.isFinite(qty)) {
    if (qty > 0) return "LONG";
    if (qty < 0) return "SHORT";
  }

  return "UNKNOWN";
}

function parseDate(x: any): Date | null {
  if (!x) return null;
  const d = new Date(x);
  return Number.isFinite(d.getTime()) ? d : null;
}

function holdMinutes(openedAt?: any, closedAt?: any): number | null {
  const o = parseDate(openedAt);
  const c = parseDate(closedAt);
  if (!o || !c) return null;
  const ms = c.getTime() - o.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round(ms / (1000 * 60));
}

function holdBucketLabel(mins: number | null): string {
  if (mins == null) return "Unknown";
  if (mins <= 15) return "0–15m";
  if (mins <= 60) return "15–60m";
  if (mins <= 240) return "1–4h";
  if (mins <= 420) return "4–7h";
  if (mins <= 1440) return "7–24h";
  return "24h+";
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

function cardInner(): React.CSSProperties {
  return {
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 14,
    background: "rgba(255,255,255,0.02)",
  };
}

function hourUTC(ts?: string) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  return d.getUTCHours(); // 0..23
}

function weekdayUTC(ts?: string) {
  const d = ts ? new Date(ts) : null;
  if (!d || Number.isNaN(d.getTime())) return null;
  // 0=Sun..6=Sat
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  return names[d.getUTCDay()];
}

function pickTimeForBehavior(r: { closedAt?: string; openedAt?: string }) {
  return r.closedAt ?? r.openedAt ?? undefined;
}

export default function MentorPage() {
  const router = useRouter();
  const { data } = useTradeSession();

  const positions = useMemo(() => (data?.positions ?? []) as any[], [data]);
  const hasSession = positions.length > 0;

  // 1) Build rows from positions (safe + typed)
  const mentorRows = useMemo<MentorRow[]>(() => {
    const rows: MentorRow[] = [];

    for (const p of positions) {
      const symbol = normalizeSymbol(p?.symbol);
      const side = getSide(p);

      // IMPORTANT: we rely on netProfit for positions
      const net = safeNum(p?.netProfit);

      const openedAt = p?.openedAt ?? p?.openTime ?? p?.entryTime ?? p?.entryAt;
      const closedAt = p?.closedAt ?? p?.closeTime ?? p?.exitTime ?? p?.exitAt;

      const entryPrice =
        p?.entryPrice ?? p?.openPrice ?? p?.avgEntryPrice ?? p?.price ?? null;
      const exitPrice =
        p?.exitPrice ?? p?.closePrice ?? p?.avgExitPrice ?? null;

      const hm = holdMinutes(openedAt, closedAt);

      rows.push({
        symbol,
        side,
        net,
        openedAt: openedAt ? String(openedAt) : undefined,
        closedAt: closedAt ? String(closedAt) : undefined,
        entryPrice: entryPrice != null ? safeNum(entryPrice) : null,
        exitPrice: exitPrice != null ? safeNum(exitPrice) : null,
        holdMin: hm,
      });
    }

    return rows;
  }, [positions]);

  // 2) Combo analytics: (symbol + side + hold bucket)
  const combos = useMemo<ComboBucket[]>(() => {
    const map = new Map<string, ComboBucket>();

    for (const r of mentorRows) {
      // ignore empty symbol
      if (!r.symbol || r.symbol === "—") continue;

      const hb = holdBucketLabel(r.holdMin ?? null);
      const key = `${r.symbol}|${r.side}|${hb}`;

      const cur =
        map.get(key) ??
        ({
          key,
          symbol: r.symbol,
          side: r.side,
          holdBucket: hb,
          count: 0,
          wins: 0,
          losses: 0,
          winRate: 0,
          net: 0,
          avgNet: 0,
        } as ComboBucket);

      cur.count += 1;
      cur.net += r.net;

      if (r.net > 0) cur.wins += 1;
      else if (r.net < 0) cur.losses += 1;

      map.set(key, cur);
    }

    const out = Array.from(map.values());
    for (const x of out) {
      x.winRate = x.count ? x.wins / x.count : 0;
      x.avgNet = x.count ? x.net / x.count : 0;
    }

    // keep only combos with enough sample size to be meaningful
    // (you can tune later)
    return out.filter((x) => x.count >= 3);
  }, [mentorRows]);

  const timeBehavior = useMemo(() => {
    const hourMap = new Map<
      number,
      { hour: number; count: number; net: number }
    >();
    const dayMap = new Map<
      string,
      { day: string; count: number; net: number }
    >();

    for (const r of mentorRows) {
      const ts = pickTimeForBehavior(r);
      const h = hourUTC(ts);
      const wd = weekdayUTC(ts);

      if (h != null) {
        const cur = hourMap.get(h) ?? { hour: h, count: 0, net: 0 };
        cur.count += 1;
        cur.net += r.net;
        hourMap.set(h, cur);
      }

      if (wd != null) {
        const cur = dayMap.get(wd) ?? { day: wd, count: 0, net: 0 };
        cur.count += 1;
        cur.net += r.net;
        dayMap.set(wd, cur);
      }
    }

    const hours = Array.from(hourMap.values()).sort((a, b) => b.net - a.net);
    const days = Array.from(dayMap.values()).sort((a, b) => b.net - a.net);

    // only consider buckets with minimal sample size (tune later)
    const minN = 3;
    const hoursFiltered = hours.filter((x) => x.count >= minN);
    const daysFiltered = days.filter((x) => x.count >= minN);

    return {
      hoursBest: hoursFiltered.slice(0, 3),
      hoursWorst: [...hoursFiltered].reverse().slice(0, 3),
      daysBest: daysFiltered.slice(0, 3),
      daysWorst: [...daysFiltered].reverse().slice(0, 3),
      minN,
    };
  }, [mentorRows]);

  const priceZones = useMemo(() => {
    // group rows by symbol
    const bySym = new Map<string, typeof mentorRows>();

    for (const r of mentorRows) {
      const sym = normalizeSymbol(r.symbol);
      if (!bySym.has(sym)) bySym.set(sym, []);
      bySym.get(sym)!.push(r);
    }

    type Zone = {
      symbol: string;
      side: string;
      from: number;
      to: number;
      count: number;
      net: number;
      winRate: number; // 0..1
      avgHoldMin: number;
    };

    const zones: Zone[] = [];

    // Build zones per symbol + side based on entryPrice
    for (const [sym, rows] of bySym.entries()) {
      // ignore if no prices
      const priced = rows
        .map((r) => ({ ...r, entryPrice: safeNum((r as any).entryPrice) }))
        .filter((r) => Number.isFinite(r.entryPrice) && r.entryPrice > 0);

      if (priced.length < 6) continue; // need some data

      const sides = ["LONG", "SHORT", "UNKNOWN"] as const;

      for (const side of sides) {
        const list = priced.filter((r) => (r.side ?? "UNKNOWN") === side);
        if (list.length < 6) continue;

        const prices = list.map((r) => r.entryPrice);
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        if (!Number.isFinite(minP) || !Number.isFinite(maxP) || maxP <= minP)
          continue;

        const bins = 4; // MVP: 4 zones
        const step = (maxP - minP) / bins;

        for (let i = 0; i < bins; i++) {
          const from = minP + step * i;
          const to = i === bins - 1 ? maxP : minP + step * (i + 1);

          const inBin = list.filter((r) => {
            const p = r.entryPrice;
            // include upper bound only for last bin
            if (i === bins - 1) return p >= from && p <= to;
            return p >= from && p < to;
          });

          if (inBin.length < 3) continue;

          const net = inBin.reduce((a, x) => a + (x.net ?? 0), 0);
          const wins = inBin.filter((x) => (x.net ?? 0) > 0).length;
          const winRate = wins / inBin.length;

          const holds = inBin
            .map((x) => safeNum((x as any).holdMin))
            .filter((h) => Number.isFinite(h) && h > 0);
          const avgHoldMin = holds.length
            ? holds.reduce((a, b) => a + b, 0) / holds.length
            : 0;

          zones.push({
            symbol: sym,
            side,
            from,
            to,
            count: inBin.length,
            net,
            winRate,
            avgHoldMin,
          });
        }
      }
    }

    // Rank best/worst zones overall (net), require some sample size
    const ranked = zones
      .filter((z) => z.count >= 4)
      .sort((a, b) => b.net - a.net);

    const best = ranked.slice(0, 6);
    const worst = [...ranked].reverse().slice(0, 6);

    return { best, worst };
  }, [mentorRows]);

  const bestCombo = useMemo(() => {
    if (!combos.length) return null;
    // sort by total net first, tie-breaker by avg net
    const sorted = [...combos].sort((a, b) => {
      const d = (b.net ?? 0) - (a.net ?? 0);
      if (d !== 0) return d;
      return (b.avgNet ?? 0) - (a.avgNet ?? 0);
    });
    return sorted[0] ?? null;
  }, [combos]);

  const worstCombo = useMemo(() => {
    if (!combos.length) return null;
    const sorted = [...combos].sort((a, b) => (a.net ?? 0) - (b.net ?? 0));
    return sorted[0] ?? null;
  }, [combos]);

  // quick “style classifier” (very rough MVP, purely rule-based)
  const styleLabel = useMemo(() => {
    const withHold = mentorRows
      .map((r) => r.holdMin)
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));

    if (withHold.length < 5) return "Not enough data";

    const avg = withHold.reduce((a, b) => a + b, 0) / withHold.length;

    if (avg <= 60) return "Scalper / very short-term";
    if (avg <= 240) return "Daytrader (intraday holds)";
    if (avg <= 1440) return "Swing-ish (multi-hour to 1 day)";
    return "Swing / position trader";
  }, [mentorRows]);

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
          }}
        >
          <div>
            <div style={{ fontWeight: 1000, fontSize: 18 }}>Mentor</div>
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Behavior insights (rule-based MVP). AI comes later.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="btn-secondary"
              onClick={() => router.push("/journal")}
            >
              Journal
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/performance")}
            >
              Performance
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/risk")}
            >
              Risk
            </button>
          </div>
        </div>
      </div>

      {!hasSession ? (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 1000 }}>Keine Session geladen</div>
          <div className="p-muted" style={{ marginTop: 8 }}>
            Lade zuerst eine CSV hoch, damit der Mentor deine Trades analysieren
            kann.
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
        <div style={{ display: "grid", gap: 12 }}>
          {/* Row 1: quick identity + top pattern */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
            }}
          >
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 1000 }}>Your trading style (MVP)</div>
              <div
                className="p-muted"
                style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}
              >
                Based on your average holding time.
              </div>

              <div style={{ marginTop: 12, ...cardInner() }}>
                <div
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    fontWeight: 900,
                  }}
                >
                  CLASSIFICATION
                </div>
                <div style={{ marginTop: 6, fontWeight: 1000, fontSize: 16 }}>
                  {styleLabel}
                </div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Trades analyzed:{" "}
                  <b style={{ color: "var(--text)" }}>{mentorRows.length}</b>
                </div>
              </div>

              <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
                Tomorrow we’ll improve this with time-of-day, symbol focus, and
                price zones.
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 1000 }}>Best pattern (combination)</div>
              <div
                className="p-muted"
                style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}
              >
                Symbol + Direction + Holding bucket that produced the most net
                profit.
              </div>

              {bestCombo ? (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <div style={cardInner()}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 1000, fontSize: 16 }}>
                          {bestCombo.symbol} · {bestCombo.side} ·{" "}
                          {bestCombo.holdBucket}
                        </div>
                        <div
                          className="p-muted"
                          style={{ fontSize: 12, marginTop: 4 }}
                        >
                          {bestCombo.count} positions · Win rate{" "}
                          {(bestCombo.winRate * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div
                          className={pnlClass(bestCombo.net)}
                          style={{ fontWeight: 1000, fontSize: 16 }}
                        >
                          {fmtMoney(bestCombo.net, DEFAULT_CCY)}
                        </div>
                        <div
                          className="p-muted"
                          style={{ fontSize: 12, marginTop: 4 }}
                        >
                          avg {fmtMoney(bestCombo.avgNet, DEFAULT_CCY)}
                        </div>
                      </div>
                    </div>

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
                        onClick={() =>
                          router.push(
                            `/positions?symbol=${encodeURIComponent(bestCombo.symbol)}`,
                          )
                        }
                      >
                        Open positions
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 12, ...cardInner() }}>
                  <div style={{ fontWeight: 1000 }}>Not enough data</div>
                  <div
                    className="p-muted"
                    style={{ marginTop: 6, fontSize: 12 }}
                  >
                    Need at least a few repeated patterns (we currently require
                    3+ positions per combo).
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: worst pattern */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Weakest pattern (leak)</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              This is the combo that hurt you the most — good candidate for a
              rule to avoid.
            </div>

            {worstCombo ? (
              <div style={{ marginTop: 12, ...cardInner() }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 1000, fontSize: 16 }}>
                      {worstCombo.symbol} · {worstCombo.side} ·{" "}
                      {worstCombo.holdBucket}
                    </div>
                    <div
                      className="p-muted"
                      style={{ fontSize: 12, marginTop: 4 }}
                    >
                      {worstCombo.count} positions · Win rate{" "}
                      {(worstCombo.winRate * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div
                      className={pnlClass(worstCombo.net)}
                      style={{ fontWeight: 1000, fontSize: 16 }}
                    >
                      {fmtMoney(worstCombo.net, DEFAULT_CCY)}
                    </div>
                    <div
                      className="p-muted"
                      style={{ fontSize: 12, marginTop: 4 }}
                    >
                      avg {fmtMoney(worstCombo.avgNet, DEFAULT_CCY)}
                    </div>
                  </div>
                </div>

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
                    onClick={() =>
                      router.push(
                        `/positions?symbol=${encodeURIComponent(worstCombo.symbol)}`,
                      )
                    }
                  >
                    Inspect positions
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12, ...cardInner() }}>
                <div style={{ fontWeight: 1000 }}>Not enough data</div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Once you have a few more positions, we’ll detect leaks
                  automatically.
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Time Behavior (MVP)</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Where you statistically make / lose money (UTC). Only buckets with{" "}
              {timeBehavior.minN}+ positions.
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div style={cardInner()}>
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                  Best Hours
                </div>
                {timeBehavior.hoursBest.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {timeBehavior.hoursBest.map((x) => (
                      <div
                        key={x.hour}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span className="p-muted">
                          {String(x.hour).padStart(2, "0")}:00
                        </span>
                        <span
                          className={pnlClass(x.net)}
                          style={{ fontWeight: 1000 }}
                        >
                          {fmtMoney(x.net, DEFAULT_CCY)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    Not enough data
                  </div>
                )}
              </div>

              <div style={cardInner()}>
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                  Worst Hours
                </div>
                {timeBehavior.hoursWorst.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {timeBehavior.hoursWorst.map((x) => (
                      <div
                        key={x.hour}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span className="p-muted">
                          {String(x.hour).padStart(2, "0")}:00
                        </span>
                        <span
                          className={pnlClass(x.net)}
                          style={{ fontWeight: 1000 }}
                        >
                          {fmtMoney(x.net, DEFAULT_CCY)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    Not enough data
                  </div>
                )}
              </div>

              <div style={cardInner()}>
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                  Best Weekdays
                </div>
                {timeBehavior.daysBest.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {timeBehavior.daysBest.map((x) => (
                      <div
                        key={x.day}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span className="p-muted">{x.day}</span>
                        <span
                          className={pnlClass(x.net)}
                          style={{ fontWeight: 1000 }}
                        >
                          {fmtMoney(x.net, DEFAULT_CCY)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    Not enough data
                  </div>
                )}
              </div>

              <div style={cardInner()}>
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                  Worst Weekdays
                </div>
                {timeBehavior.daysWorst.length ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    {timeBehavior.daysWorst.map((x) => (
                      <div
                        key={x.day}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <span className="p-muted">{x.day}</span>
                        <span
                          className={pnlClass(x.net)}
                          style={{ fontWeight: 1000 }}
                        >
                          {fmtMoney(x.net, DEFAULT_CCY)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    Not enough data
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Price Zones (MVP)</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Where you make/lose money by entry price range (symbol + side).
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div style={cardInner()}>
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                  Best Zones
                </div>

                {priceZones.best.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {priceZones.best.map((z, i) => (
                      <div
                        key={`${z.symbol}-${z.side}-${i}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div style={{ fontSize: 12 }}>
                          <b>{z.symbol}</b>{" "}
                          <span className="p-muted">({z.side})</span>
                          <div className="p-muted" style={{ marginTop: 4 }}>
                            {z.from.toFixed(4)} – {z.to.toFixed(4)} · {z.count}x
                            · WR {fmtPercent(z.winRate)} · Hold{" "}
                            {z.avgHoldMin
                              ? `${Math.round(z.avgHoldMin)}m`
                              : "—"}
                          </div>
                        </div>

                        <div
                          className={pnlClass(z.net)}
                          style={{ fontWeight: 1000, whiteSpace: "nowrap" }}
                        >
                          {fmtMoney(z.net, DEFAULT_CCY)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    Not enough data (need entry prices + enough positions).
                  </div>
                )}
              </div>

              <div style={cardInner()}>
                <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                  Worst Zones
                </div>

                {priceZones.worst.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {priceZones.worst.map((z, i) => (
                      <div
                        key={`${z.symbol}-${z.side}-${i}`}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                        }}
                      >
                        <div style={{ fontSize: 12 }}>
                          <b>{z.symbol}</b>{" "}
                          <span className="p-muted">({z.side})</span>
                          <div className="p-muted" style={{ marginTop: 4 }}>
                            {z.from.toFixed(4)} – {z.to.toFixed(4)} · {z.count}x
                            · WR {fmtPercent(z.winRate)} · Hold{" "}
                            {z.avgHoldMin
                              ? `${Math.round(z.avgHoldMin)}m`
                              : "—"}
                          </div>
                        </div>

                        <div
                          className={pnlClass(z.net)}
                          style={{ fontWeight: 1000, whiteSpace: "nowrap" }}
                        >
                          {fmtMoney(z.net, DEFAULT_CCY)}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    Not enough data.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Placeholder for AI chat later */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Mentor Chat (later)</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Tomorrow: prompt input + (later) AI response. Today: analytics
              foundation.
            </div>
            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Prompt (disabled)
                </div>
                <div style={{ marginTop: 6, opacity: 0.6, fontSize: 12 }}>
                  “Analyse my last 30 positions and tell me my biggest leaks…”
                </div>
              </div>
              <button className="btn-primary" disabled style={{ opacity: 0.6 }}>
                Ask Mentor (soon)
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

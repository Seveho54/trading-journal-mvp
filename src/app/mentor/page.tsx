"use client";

import React, { useMemo, useState } from "react";
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
// Mentor tuning constants
// -----------------------------
const ZONE_BINS = 4; // price zones per symbol+side
const MIN_PRICED_ROWS = 6; // minimum rows with entryPrice for a symbol+side
const MIN_ZONE_TRADES = 3; // minimum trades inside a zone
const MIN_ZONE_SAMPLE_FOR_RANK = 4; // minimum trades to rank a zone globally
const TOP_ZONES = 6; // how many to show
const MIN_COMBO_SAMPLE = 3; // minimum sample per combo bucket
const BEHAVIOR_MIN_N = 3; // minimum sample for time behavior buckets

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
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
  return names[d.getUTCDay()];
}

function pickTimeForBehavior(r: { closedAt?: string; openedAt?: string }) {
  return r.closedAt ?? r.openedAt ?? undefined;
}

function buildPositionsUrl(params: Record<string, any>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "" || v === "—") continue;
    sp.set(k, String(v));
  }
  const qs = sp.toString();
  return qs ? `/positions?${qs}` : "/positions";
}
// compact label for price ranges (avoid too many decimals)
function fmtRange(from: number, to: number) {
  const maxAbs = Math.max(Math.abs(from), Math.abs(to));
  const d = maxAbs >= 1000 ? 2 : maxAbs >= 100 ? 3 : maxAbs >= 1 ? 4 : 6;
  return `${from.toFixed(d)} – ${to.toFixed(d)}`;
}

export default function MentorPage() {
  const router = useRouter();
  const { data } = useTradeSession();

  const positions = useMemo(() => (data?.positions ?? []) as any[], [data]);
  const hasSession = positions.length > 0;

  function goPositions(params: Record<string, any>) {
    router.push(buildPositionsUrl(params));
  }

  // small "chat-like" UX (no AI yet)
  const [prompt, setPrompt] = useState("");
  const quickSuggestions = [
    "What is my biggest leak?",
    "Which symbol/side should I focus on?",
    "When do I lose money most often?",
    "Show me my best price zone.",
  ];

  // 1) Build rows from positions (safe + typed)
  const mentorRows = useMemo<MentorRow[]>(() => {
    const rows: MentorRow[] = [];

    for (const p of positions) {
      const symbol = normalizeSymbol(p?.symbol);
      const side = getSide(p);

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

    return out.filter((x) => x.count >= MIN_COMBO_SAMPLE);
  }, [mentorRows]);

  const bestCombo = useMemo(() => {
    if (!combos.length) return null;
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

    const hoursFiltered = hours.filter((x) => x.count >= BEHAVIOR_MIN_N);
    const daysFiltered = days.filter((x) => x.count >= BEHAVIOR_MIN_N);

    return {
      hoursBest: hoursFiltered.slice(0, 3),
      hoursWorst: [...hoursFiltered].reverse().slice(0, 3),
      daysBest: daysFiltered.slice(0, 3),
      daysWorst: [...daysFiltered].reverse().slice(0, 3),
      minN: BEHAVIOR_MIN_N,
    };
  }, [mentorRows]);

  const priceZones = useMemo(() => {
    const bySym = new Map<string, MentorRow[]>();
    for (const r of mentorRows) {
      const sym = normalizeSymbol(r.symbol);
      if (!bySym.has(sym)) bySym.set(sym, []);
      bySym.get(sym)!.push(r);
    }

    type Zone = {
      symbol: string;
      side: "LONG" | "SHORT" | "UNKNOWN";
      from: number;
      to: number;
      count: number;
      net: number;
      winRate: number;
      avgHoldMin: number;
    };

    const zones: Zone[] = [];

    for (const [sym, rows] of bySym.entries()) {
      const priced = rows
        .map((r) => ({ ...r, entryPrice: safeNum(r.entryPrice) }))
        .filter((r) => Number.isFinite(r.entryPrice) && r.entryPrice > 0);

      // overall symbol needs enough priced rows to even attempt
      if (priced.length < MIN_PRICED_ROWS) continue;

      const sides: Zone["side"][] = ["LONG", "SHORT", "UNKNOWN"];

      for (const side of sides) {
        const list = priced.filter((r) => (r.side ?? "UNKNOWN") === side);
        if (list.length < MIN_PRICED_ROWS) continue;

        const prices = list.map((r) => r.entryPrice as number);
        const minP = Math.min(...prices);
        const maxP = Math.max(...prices);
        if (!Number.isFinite(minP) || !Number.isFinite(maxP) || maxP <= minP)
          continue;

        const bins = ZONE_BINS;
        const step = (maxP - minP) / bins;

        for (let i = 0; i < bins; i++) {
          const from = minP + step * i;
          const to = i === bins - 1 ? maxP : minP + step * (i + 1);

          const inBin = list.filter((r) => {
            const p = r.entryPrice as number;
            if (i === bins - 1) return p >= from && p <= to;
            return p >= from && p < to;
          });

          if (inBin.length < MIN_ZONE_TRADES) continue;

          const net = inBin.reduce((a, x) => a + (x.net ?? 0), 0);
          const wins = inBin.filter((x) => (x.net ?? 0) > 0).length;
          const winRate = wins / inBin.length;

          const holds = inBin
            .map((x) => safeNum(x.holdMin))
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

    // IMPORTANT: split best/worst properly
    const ranked = zones.filter((z) => z.count >= MIN_ZONE_SAMPLE_FOR_RANK);

    const best = [...ranked]
      .filter((z) => z.net > 0)
      .sort((a, b) => b.net - a.net)
      .slice(0, TOP_ZONES);

    const worst = [...ranked]
      .filter((z) => z.net < 0)
      .sort((a, b) => a.net - b.net)
      .slice(0, TOP_ZONES);

    return { best, worst };
  }, [mentorRows]);

  // quick “style classifier” (still MVP, but compact)
  const styleLabel = useMemo(() => {
    const withHold = mentorRows
      .map((r) => r.holdMin)
      .filter((x): x is number => typeof x === "number" && Number.isFinite(x));

    if (withHold.length < 5) return "Not enough data";
    const avg = withHold.reduce((a, b) => a + b, 0) / withHold.length;

    if (avg <= 60) return "Scalper / very short-term";
    if (avg <= 240) return "Daytrader";
    if (avg <= 1440) return "Swing-ish";
    return "Swing / position trader";
  }, [mentorRows]);

  // small “mentor summary” lines (keeps page compact)
  const mentorSummary = useMemo(() => {
    const netTotal = mentorRows.reduce((a, r) => a + (r.net ?? 0), 0);
    const wins = mentorRows.filter((r) => (r.net ?? 0) > 0).length;
    const losses = mentorRows.filter((r) => (r.net ?? 0) < 0).length;
    const wr = wins + losses > 0 ? wins / (wins + losses) : 0;

    const topSym = (() => {
      const m = new Map<string, number>();
      for (const r of mentorRows) {
        const s = normalizeSymbol(r.symbol);
        m.set(s, (m.get(s) ?? 0) + (r.net ?? 0));
      }
      const sorted = Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
      return sorted[0] ? { symbol: sorted[0][0], net: sorted[0][1] } : null;
    })();

    return { netTotal, wins, losses, wr, topSym };
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
          {/* TOP: Mentor "briefing" + Chat */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.1fr 0.9fr",
              gap: 12,
              alignItems: "start",
            }}
          >
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 1000 }}>Mentor Briefing</div>
              <div
                className="p-muted"
                style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}
              >
                A quick diagnosis from your real behavior (positions).
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={cardInner()}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      fontWeight: 900,
                    }}
                  >
                    YOUR STYLE
                  </div>
                  <div style={{ marginTop: 6, fontWeight: 1000, fontSize: 16 }}>
                    {styleLabel}
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div style={cardInner()}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        fontWeight: 900,
                      }}
                    >
                      NET TOTAL
                    </div>
                    <div
                      className={pnlClass(mentorSummary.netTotal)}
                      style={{ marginTop: 6, fontWeight: 1000 }}
                    >
                      {fmtMoney(mentorSummary.netTotal, DEFAULT_CCY)}
                    </div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      WR {fmtPercent(mentorSummary.wr)} · {mentorRows.length}{" "}
                      positions
                    </div>
                  </div>

                  <div style={cardInner()}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        fontWeight: 900,
                      }}
                    >
                      TOP SYMBOL
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 1000 }}>
                      {mentorSummary.topSym?.symbol ?? "—"}
                    </div>
                    <div
                      className={pnlClass(mentorSummary.topSym?.net ?? 0)}
                      style={{ marginTop: 6, fontWeight: 1000 }}
                    >
                      {mentorSummary.topSym
                        ? fmtMoney(mentorSummary.topSym.net, DEFAULT_CCY)
                        : "—"}
                    </div>
                  </div>
                </div>

                {bestCombo ? (
                  <div style={cardInner()}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        fontWeight: 900,
                      }}
                    >
                      BEST REPEATABLE PATTERN
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 1000 }}>
                      {bestCombo.symbol} · {bestCombo.side} ·{" "}
                      {bestCombo.holdBucket}
                    </div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      {bestCombo.count} positions · WR{" "}
                      {fmtPercent(bestCombo.winRate)} · net{" "}
                      <b
                        className={pnlClass(bestCombo.net)}
                        style={{ color: "inherit" }}
                      >
                        {fmtMoney(bestCombo.net, DEFAULT_CCY)}
                      </b>
                    </div>
                  </div>
                ) : null}

                {worstCombo ? (
                  <div style={cardInner()}>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        fontWeight: 900,
                      }}
                    >
                      BIGGEST LEAK
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 1000 }}>
                      {worstCombo.symbol} · {worstCombo.side} ·{" "}
                      {worstCombo.holdBucket}
                    </div>
                    <div
                      className="p-muted"
                      style={{ marginTop: 6, fontSize: 12 }}
                    >
                      {worstCombo.count} positions · WR{" "}
                      {fmtPercent(worstCombo.winRate)} · net{" "}
                      <b
                        className={pnlClass(worstCombo.net)}
                        style={{ color: "inherit" }}
                      >
                        {fmtMoney(worstCombo.net, DEFAULT_CCY)}
                      </b>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 1000 }}>Talk to Mentor</div>
              <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
                No AI yet — but this is the final layout (AI plugs in here
                later).
              </div>

              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {quickSuggestions.map((s) => (
                    <button
                      key={s}
                      className="btn-secondary"
                      style={{
                        padding: "8px 10px",
                        borderRadius: 999,
                        fontSize: 12,
                      }}
                      onClick={() => setPrompt(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div style={{ ...cardInner(), padding: 12 }}>
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    Prompt
                  </div>
                  <input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ask about your behavior… (AI soon)"
                    style={{ width: "100%", marginTop: 8 }}
                  />
                  <div
                    style={{
                      marginTop: 10,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      className="btn-primary"
                      disabled
                      style={{ opacity: 0.6 }}
                    >
                      Ask (soon)
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => setPrompt("")}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div style={{ ...cardInner(), padding: 12 }}>
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    Mentor reply (preview)
                  </div>
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      lineHeight: 1.5,
                      opacity: 0.9,
                    }}
                  >
                    I’ll answer with your real patterns (symbols, hold-time
                    buckets, price zones, and time behavior). AI will generate
                    action steps like: “Avoid SHORTs on ADA during 4–7h holds”
                    or “Focus on BTC LONG entries within your best price zone”.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* BOTTOM: compact analytics (keeps page short) */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Key Behavior Signals</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Compact view (keeps the page short). You can drill down via
              Positions.
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              {/* Time (best/worst hour) */}
              <div style={cardInner()}>
                <div style={{ fontWeight: 1000, marginBottom: 6 }}>Timing</div>
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Best/Worst hours & weekdays (UTC, min {timeBehavior.minN}{" "}
                  samples)
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span className="p-muted" style={{ fontSize: 12 }}>
                      Best hour
                    </span>
                    <span
                      className={pnlClass(
                        timeBehavior.hoursBest?.[0]?.net ?? 0,
                      )}
                      style={{ fontWeight: 1000, fontSize: 12 }}
                    >
                      {timeBehavior.hoursBest?.[0]
                        ? `${String(timeBehavior.hoursBest[0].hour).padStart(2, "0")}:00 · ${fmtMoney(
                            timeBehavior.hoursBest[0].net,
                            DEFAULT_CCY,
                          )}`
                        : "—"}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span className="p-muted" style={{ fontSize: 12 }}>
                      Worst hour
                    </span>
                    <span
                      className={pnlClass(
                        timeBehavior.hoursWorst?.[0]?.net ?? 0,
                      )}
                      style={{ fontWeight: 1000, fontSize: 12 }}
                    >
                      {timeBehavior.hoursWorst?.[0]
                        ? `${String(timeBehavior.hoursWorst[0].hour).padStart(2, "0")}:00 · ${fmtMoney(
                            timeBehavior.hoursWorst[0].net,
                            DEFAULT_CCY,
                          )}`
                        : "—"}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span className="p-muted" style={{ fontSize: 12 }}>
                      Best day
                    </span>
                    <span
                      className={pnlClass(timeBehavior.daysBest?.[0]?.net ?? 0)}
                      style={{ fontWeight: 1000, fontSize: 12 }}
                    >
                      {timeBehavior.daysBest?.[0]
                        ? `${timeBehavior.daysBest[0].day} · ${fmtMoney(timeBehavior.daysBest[0].net, DEFAULT_CCY)}`
                        : "—"}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span className="p-muted" style={{ fontSize: 12 }}>
                      Worst day
                    </span>
                    <span
                      className={pnlClass(
                        timeBehavior.daysWorst?.[0]?.net ?? 0,
                      )}
                      style={{ fontWeight: 1000, fontSize: 12 }}
                    >
                      {timeBehavior.daysWorst?.[0]
                        ? `${timeBehavior.daysWorst[0].day} · ${fmtMoney(timeBehavior.daysWorst[0].net, DEFAULT_CCY)}`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price zones (best & worst single) */}
              <div style={cardInner()}>
                <div style={{ fontWeight: 1000, marginBottom: 6 }}>
                  Price Zones
                </div>
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Best (positive) + Worst (negative) entry ranges
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  <div>
                    <div className="p-muted" style={{ fontSize: 12 }}>
                      Best zone
                    </div>
                    {priceZones.best?.[0] ? (
                      <div style={{ marginTop: 4, fontSize: 12 }}>
                        <b>{priceZones.best[0].symbol}</b>{" "}
                        <span className="p-muted">
                          ({priceZones.best[0].side})
                        </span>
                        <div className="p-muted" style={{ marginTop: 4 }}>
                          {fmtRange(
                            priceZones.best[0].from,
                            priceZones.best[0].to,
                          )}{" "}
                          · {priceZones.best[0].count}x · WR{" "}
                          {fmtPercent(priceZones.best[0].winRate)} · Hold{" "}
                          {priceZones.best[0].avgHoldMin
                            ? `${Math.round(priceZones.best[0].avgHoldMin)}m`
                            : "—"}
                        </div>
                        <div
                          className={pnlClass(priceZones.best[0].net)}
                          style={{ marginTop: 4, fontWeight: 1000 }}
                        >
                          {fmtMoney(priceZones.best[0].net, DEFAULT_CCY)}
                        </div>
                      </div>
                    ) : (
                      <div className="p-muted" style={{ fontSize: 12 }}>
                        Not enough data
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="p-muted" style={{ fontSize: 12 }}>
                      Worst zone
                    </div>
                    {priceZones.worst?.[0] ? (
                      <div style={{ marginTop: 4, fontSize: 12 }}>
                        <b>{priceZones.worst[0].symbol}</b>{" "}
                        <span className="p-muted">
                          ({priceZones.worst[0].side})
                        </span>
                        <div className="p-muted" style={{ marginTop: 4 }}>
                          {fmtRange(
                            priceZones.worst[0].from,
                            priceZones.worst[0].to,
                          )}{" "}
                          · {priceZones.worst[0].count}x · WR{" "}
                          {fmtPercent(priceZones.worst[0].winRate)} · Hold{" "}
                          {priceZones.worst[0].avgHoldMin
                            ? `${Math.round(priceZones.worst[0].avgHoldMin)}m`
                            : "—"}
                        </div>
                        <div
                          className={pnlClass(priceZones.worst[0].net)}
                          style={{ marginTop: 4, fontWeight: 1000 }}
                        >
                          {fmtMoney(priceZones.worst[0].net, DEFAULT_CCY)}
                        </div>
                      </div>
                    ) : (
                      <div className="p-muted" style={{ fontSize: 12 }}>
                        Not enough data
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions (mentor-like) */}
              <div style={cardInner()}>
                <div style={{ fontWeight: 1000, marginBottom: 6 }}>
                  Mentor Actions
                </div>
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Three simple rules you can apply right now
                </div>

                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <span className="badge badge-blue" style={{ height: 22 }}>
                      1
                    </span>
                    <div>
                      <b>Protect the leak.</b>
                      <div className="p-muted" style={{ marginTop: 4 }}>
                        {worstCombo
                          ? `Avoid repeating: ${worstCombo.symbol} ${worstCombo.side} during ${worstCombo.holdBucket} holds (net ${fmtMoney(
                              worstCombo.net,
                              DEFAULT_CCY,
                            )}).`
                          : "Once there is enough data, I’ll surface your biggest leak here."}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <span className="badge badge-green" style={{ height: 22 }}>
                      2
                    </span>
                    <div>
                      <b>Double down on what works.</b>
                      <div className="p-muted" style={{ marginTop: 4 }}>
                        {bestCombo
                          ? `Prioritize: ${bestCombo.symbol} ${bestCombo.side} with ${bestCombo.holdBucket} holds (WR ${fmtPercent(
                              bestCombo.winRate,
                            )}).`
                          : "Once there is enough data, I’ll highlight your best repeatable pattern."}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                    }}
                  >
                    <span className="badge badge-purple" style={{ height: 22 }}>
                      3
                    </span>
                    <div>
                      <b>Use timing as a filter.</b>
                      <div className="p-muted" style={{ marginTop: 4 }}>
                        {timeBehavior.hoursWorst?.[0]
                          ? `If possible, reduce trading around ${String(
                              timeBehavior.hoursWorst[0].hour,
                            ).padStart(
                              2,
                              "0",
                            )}:00 UTC (worst hour net ${fmtMoney(timeBehavior.hoursWorst[0].net, DEFAULT_CCY)}).`
                          : "Once there is enough data, I’ll identify your worst trading window."}
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      className="btn-secondary"
                      onClick={() => router.push("/positions")}
                    >
                      Open Positions
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => router.push("/performance")}
                    >
                      Go Performance
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Keep the detailed lists optional but not huge */}
          <details className="card" style={{ padding: 16 }}>
            <summary
              className="tv-disclosure-summary"
              style={{ cursor: "pointer", fontWeight: 1000 }}
            >
              Show more details (optional)
              <span
                className="tv-chevron"
                style={{ marginLeft: 8, display: "inline-block" }}
              >
                ▾
              </span>
            </summary>

            <div style={{ marginTop: 12, display: "grid", gap: 12 }}>
              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontWeight: 1000 }}>Time Behavior (details)</div>
                <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
                  Best/Worst hours & weekdays (UTC). Only buckets with{" "}
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

              <div className="card" style={{ padding: 14 }}>
                <div style={{ fontWeight: 1000 }}>Price Zones (details)</div>
                <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
                  Best shows only positive zones. Worst shows only negative
                  zones.
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
                                {fmtRange(z.from, z.to)} · {z.count}x · WR{" "}
                                {fmtPercent(z.winRate)} · Hold{" "}
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
                                {fmtRange(z.from, z.to)} · {z.count}x · WR{" "}
                                {fmtPercent(z.winRate)} · Hold{" "}
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
            </div>
          </details>
        </div>
      )}
    </main>
  );
}

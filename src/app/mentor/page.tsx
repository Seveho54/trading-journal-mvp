"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import { DEFAULT_CCY, fmtMoney, fmtPercent } from "@/lib/format";
import { loadRules, saveRules, uid, type Rule } from "@/lib/mentor/rules";

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

function confidenceLabel(n: number) {
  if (n >= 20) return { label: "High confidence", cls: "badge badge-green" };
  if (n >= 8) return { label: "Medium confidence", cls: "badge badge-blue" };
  if (n >= 3) return { label: "Low confidence", cls: "badge badge-purple" };
  return { label: "Not enough data", cls: "badge" };
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

  const rawPositions = useMemo(() => (data?.positions ?? []) as any[], [data]);

  function posTs(p: any) {
    const ts =
      p?.closedAt ??
      p?.closeTime ??
      p?.exitTime ??
      p?.exitAt ??
      p?.openedAt ??
      p?.openTime ??
      p?.entryTime ??
      p?.entryAt;
    const d = ts ? new Date(ts) : null;
    return d && Number.isFinite(d.getTime()) ? d.getTime() : null;
  }

  const [range, setRange] = useState<"30d" | "90d" | "all">("90d");

  const positions = useMemo(() => {
    if (range === "all") return rawPositions;

    const now = Date.now();
    const days = range === "30d" ? 30 : 90;
    const cutoff = now - days * 24 * 60 * 60 * 1000;

    return rawPositions.filter((p) => {
      const t = posTs(p);
      return t != null && t >= cutoff;
    });
  }, [rawPositions, range]);

  const hasSession = positions.length > 0;

  function goPositions(params: Record<string, any>) {
    router.push(buildPositionsUrl(params));
  }

  // small "chat-like" UX (no AI yet)
  const [prompt, setPrompt] = useState("");

  const [rules, setRules] = useState<Rule[]>([]);

  // load once
  React.useEffect(() => {
    setRules(loadRules());
  }, []);

  // persist
  React.useEffect(() => {
    saveRules(rules);
  }, [rules]);

  function addRule(r: Rule) {
    setRules((prev) => {
      // avoid duplicates
      const exists = prev.some((x) => JSON.stringify(x) === JSON.stringify(r));
      if (exists) return prev;
      return [r, ...prev].slice(0, 12); // keep it compact
    });
  }

  function removeRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  type ChatMsg = { role: "user" | "mentor"; text: string; ts: number };

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "mentor",
      text: "Hi — I’m your Mentor. Ask me about leaks, best patterns, timing, or price zones.",
      ts: Date.now(),
    },
  ]);

  function mentorReply(qRaw: string): string {
    const q = String(qRaw ?? "").toLowerCase();

    const leak = worstCombo;
    const best = bestCombo;

    const bestHour = timeBehavior.hoursBest?.[0];
    const worstHour = timeBehavior.hoursWorst?.[0];
    const bestDay = timeBehavior.daysBest?.[0];
    const worstDay = timeBehavior.daysWorst?.[0];

    const bestZone = priceZones.best?.[0];
    const worstZone = priceZones.worst?.[0];

    // 1) Biggest leak
    if (q.includes("leak") || q.includes("loss") || q.includes("biggest")) {
      if (!leak)
        return "I need a bit more repeated data to detect a clear leak.";
      return (
        `Your biggest leak is: ${leak.symbol} ${leak.side} with ${leak.holdBucket} holds.\n` +
        `Sample: ${leak.count} positions · WR ${fmtPercent(leak.winRate)} · Net ${fmtMoney(leak.net, DEFAULT_CCY)}.\n` +
        `Action: avoid or reduce this combo for 1–2 weeks and compare results.`
      );
    }

    // 2) Focus symbol/side
    if (q.includes("focus") || q.includes("symbol") || q.includes("pair")) {
      if (!mentorSummary.topSym) return "Not enough symbol data yet.";
      return (
        `Your top symbol by net is ${mentorSummary.topSym.symbol} (${fmtMoney(mentorSummary.topSym.net, DEFAULT_CCY)}).\n` +
        `${best ? `Best repeatable pattern: ${best.symbol} ${best.side} ${best.holdBucket} (WR ${fmtPercent(best.winRate)}).\n` : ""}` +
        `Action: focus on 1–2 symbols max and cut everything else for a week.`
      );
    }

    // 3) Timing
    if (
      q.includes("time") ||
      q.includes("hour") ||
      q.includes("when") ||
      q.includes("uhr")
    ) {
      const parts: string[] = [];
      if (bestHour)
        parts.push(
          `Best hour: ${String(bestHour.hour).padStart(2, "0")}:00 UTC → ${fmtMoney(bestHour.net, DEFAULT_CCY)} (n=${bestHour.count}).`,
        );
      if (worstHour)
        parts.push(
          `Worst hour: ${String(worstHour.hour).padStart(2, "0")}:00 UTC → ${fmtMoney(worstHour.net, DEFAULT_CCY)} (n=${worstHour.count}).`,
        );
      if (bestDay)
        parts.push(
          `Best weekday: ${bestDay.day} → ${fmtMoney(bestDay.net, DEFAULT_CCY)} (n=${bestDay.count}).`,
        );
      if (worstDay)
        parts.push(
          `Worst weekday: ${worstDay.day} → ${fmtMoney(worstDay.net, DEFAULT_CCY)} (n=${worstDay.count}).`,
        );
      if (!parts.length)
        return `Not enough time buckets yet (need min ${timeBehavior.minN} samples per bucket).`;
      return (
        parts.join("\n") +
        `\nAction: add a “timing filter” (avoid the worst hour/day).`
      );
    }

    // 4) Best price zone
    if (
      q.includes("best price") ||
      q.includes("best zone") ||
      q.includes("zone")
    ) {
      if (!bestZone) return "Not enough entry price data yet to build zones.";
      return (
        `Best price zone: ${bestZone.symbol} (${bestZone.side})\n` +
        `Range: ${fmtRange(bestZone.from, bestZone.to)} · ${bestZone.count}x · WR ${fmtPercent(bestZone.winRate)} · Avg hold ${bestZone.avgHoldMin ? `${Math.round(bestZone.avgHoldMin)}m` : "—"}\n` +
        `Net: ${fmtMoney(bestZone.net, DEFAULT_CCY)}.\n` +
        `Action: try to only take entries inside this zone for this symbol (for a test period).`
      );
    }

    // 5) Worst price zone
    if (q.includes("worst") || q.includes("avoid")) {
      if (!worstZone)
        return "Not enough entry price data yet to identify a worst zone.";
      return (
        `Worst price zone: ${worstZone.symbol} (${worstZone.side})\n` +
        `Range: ${fmtRange(worstZone.from, worstZone.to)} · ${worstZone.count}x · WR ${fmtPercent(worstZone.winRate)} · Avg hold ${worstZone.avgHoldMin ? `${Math.round(worstZone.avgHoldMin)}m` : "—"}\n` +
        `Net: ${fmtMoney(worstZone.net, DEFAULT_CCY)}.\n` +
        `Action: avoid entries in this range (or reduce size).`
      );
    }

    // fallback: give a compact “briefing”
    return (
      `Here’s your current briefing:\n` +
      `Style: ${styleLabel}\n` +
      `Net total: ${fmtMoney(mentorSummary.netTotal, DEFAULT_CCY)} · WR ${fmtPercent(mentorSummary.wr)}\n` +
      `${best ? `Best pattern: ${best.symbol} ${best.side} ${best.holdBucket} (net ${fmtMoney(best.net, DEFAULT_CCY)}).\n` : ""}` +
      `${leak ? `Biggest leak: ${leak.symbol} ${leak.side} ${leak.holdBucket} (net ${fmtMoney(leak.net, DEFAULT_CCY)}).\n` : ""}` +
      `Ask me: “biggest leak”, “when do I lose money?”, “best zone”, “what should I focus on?”`
    );
  }

  function sendMessage(textRaw?: string) {
    const text = String(textRaw ?? prompt ?? "").trim();
    if (!text) return;

    const now = Date.now();

    // push user msg
    setMessages((prev) => [...prev, { role: "user", text, ts: now }]);
    setPrompt("");

    // TODO: Step 2 -> replace this with real rule-based answer
    const reply = mentorReply(text);

    setMessages((prev) => [
      ...prev,
      { role: "mentor", text: reply, ts: now + 1 },
    ]);
  }

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

  // ------------------------------------------------
  // Behavior Evolution – Period split
  // ------------------------------------------------
  const { currentRows, previousRows } = useMemo(() => {
    if (!mentorRows.length) {
      return { currentRows: [], previousRows: [] };
    }

    if (range === "all") {
      return { currentRows: mentorRows, previousRows: [] };
    }

    const days = range === "30d" ? 30 : 90;
    const now = new Date();
    const currentStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const previousStart = new Date(
      now.getTime() - days * 2 * 24 * 60 * 60 * 1000,
    );

    const getDate = (r: MentorRow) =>
      r.closedAt
        ? new Date(r.closedAt)
        : r.openedAt
          ? new Date(r.openedAt)
          : null;

    const currentRows = mentorRows.filter((r) => {
      const d = getDate(r);
      return d && d >= currentStart && d <= now;
    });

    const previousRows = mentorRows.filter((r) => {
      const d = getDate(r);
      return d && d >= previousStart && d < currentStart;
    });

    return { currentRows, previousRows };
  }, [mentorRows, range]);

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

  const lossStreak = useMemo(() => {
    // sort by time (openedAt/closedAt)
    const rows = [...mentorRows].sort((a, b) => {
      const ta = new Date(a.closedAt ?? a.openedAt ?? 0).getTime();
      const tb = new Date(b.closedAt ?? b.openedAt ?? 0).getTime();
      return ta - tb;
    });

    let cur = 0;
    let max = 0;

    for (const r of rows) {
      if ((r.net ?? 0) < 0) {
        cur += 1;
        if (cur > max) max = cur;
      } else if ((r.net ?? 0) > 0) {
        cur = 0; // reset on win
      } else {
        // breakeven: ignore / don't reset
      }
    }

    // last streak (current state)
    let last = 0;
    for (let i = rows.length - 1; i >= 0; i--) {
      const n = rows[i]?.net ?? 0;
      if (n < 0) last += 1;
      else if (n > 0) break;
    }

    // simple guardrail thresholds
    const warnAt = 2;
    const stopAt = 3;

    return { maxStreak: max, currentStreak: last, warnAt, stopAt };
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

  // -----------------------------
  // RISK ESCALATION DETECTION
  // -----------------------------
  const riskEscalation = useMemo(() => {
    if (mentorRows.length < 3) {
      return {
        escalationCount: 0,
        totalAfterLoss: 0,
        escalationRate: 0,
        avgIncrease: 0,
      };
    }

    let escalationCount = 0;
    let totalAfterLoss = 0;
    let totalIncrease = 0;

    for (let i = 1; i < mentorRows.length; i++) {
      const prev = mentorRows[i - 1];
      const curr = mentorRows[i];

      if (prev.net < 0) {
        totalAfterLoss++;

        const prevRisk = Math.abs(prev.net);
        const currRisk = Math.abs(curr.net);

        if (currRisk > prevRisk) {
          escalationCount++;
          totalIncrease += currRisk - prevRisk;
        }
      }
    }

    return {
      escalationCount,
      totalAfterLoss,
      escalationRate: totalAfterLoss > 0 ? escalationCount / totalAfterLoss : 0,
      avgIncrease: escalationCount > 0 ? totalIncrease / escalationCount : 0,
    };
  }, [mentorRows]);

  const ruleImpact = useMemo(() => {
    const rows = mentorRows ?? [];
    if (!rows.length || !rules.length) {
      return {
        total: rows.length,
        compliant: rows.length,
        violations: 0,
        netCompliant: rows.reduce((a, r) => a + (r.net ?? 0), 0),
        netViolations: 0,
      };
    }

    function violates(rule: Rule, r: MentorRow) {
      if (rule.type === "AVOID_HOUR_UTC") {
        const ts = pickTimeForBehavior(r);
        const h = hourUTC(ts);
        return h != null && h === rule.hour;
      }

      if (rule.type === "AVOID_COMBO") {
        const hb = holdBucketLabel(r.holdMin ?? null);
        return (
          r.symbol === rule.symbol &&
          r.side === rule.side &&
          hb === rule.holdBucket
        );
      }

      // FOCUS_COMBO is not a violation rule (Step 2 will use it for A-Setup mode)
      return false;
    }

    let violations = 0;
    let netCompliant = 0;
    let netViolations = 0;

    for (const r of rows) {
      const violated = rules.some((rule) => violates(rule, r));
      if (violated) {
        violations++;
        netViolations += r.net ?? 0;
      } else {
        netCompliant += r.net ?? 0;
      }
    }

    const compliant = rows.length - violations;

    return {
      total: rows.length,
      compliant,
      violations,
      netCompliant,
      netViolations,
    };
  }, [mentorRows, rules]);

  const mentorRules = useMemo(() => {
    type Rule = {
      id: string;
      tag: "AVOID" | "FOCUS" | "FILTER";
      title: string;
      text: string;
      cta: string;
      params: Record<string, any>;
    };

    const rules: Rule[] = [];

    // 1) Avoid leak combo
    if (worstCombo) {
      rules.push({
        id: "leak",
        tag: "AVOID",
        title: "Block your biggest leak",
        text: `Avoid repeating: ${worstCombo.symbol} ${worstCombo.side} with ${worstCombo.holdBucket} holds (net ${fmtMoney(
          worstCombo.net,
          DEFAULT_CCY,
        )}).`,
        cta: "Inspect leak positions",
        params: {
          symbol: worstCombo.symbol,
          side: worstCombo.side,
          // optional: if your /positions supports hold bucket filter later
        },
      });
    }

    // 2) Focus best repeatable pattern
    if (bestCombo) {
      rules.push({
        id: "best",
        tag: "FOCUS",
        title: "Double down on what works",
        text: `Prioritize: ${bestCombo.symbol} ${bestCombo.side} with ${bestCombo.holdBucket} holds (WR ${fmtPercent(
          bestCombo.winRate,
        )}, net ${fmtMoney(bestCombo.net, DEFAULT_CCY)}).`,
        cta: "Open best pattern",
        params: {
          symbol: bestCombo.symbol,
          side: bestCombo.side,
        },
      });
    }

    // 3) Filter worst hour (timing)
    const worstHour = timeBehavior.hoursWorst?.[0];
    if (worstHour) {
      rules.push({
        id: "timing",
        tag: "FILTER",
        title: "Use timing as a filter",
        text: `Reduce trading around ${String(worstHour.hour).padStart(
          2,
          "0",
        )}:00 UTC (worst hour net ${fmtMoney(worstHour.net, DEFAULT_CCY)}).`,
        cta: "Inspect that hour",
        params: {
          hour: worstHour.hour, // only works if /positions supports ?hour= later
        },
      });
    }

    // fallback: if we don’t have 3, use price zones
    const bestZone = priceZones.best?.[0];
    if (rules.length < 3 && bestZone) {
      rules.push({
        id: "zone",
        tag: "FOCUS",
        title: "Trade inside your best zone",
        text: `Best zone: ${bestZone.symbol} (${bestZone.side}) ${fmtRange(
          bestZone.from,
          bestZone.to,
        )} · ${bestZone.count} trades · WR ${fmtPercent(
          bestZone.winRate,
        )} · net ${fmtMoney(bestZone.net, DEFAULT_CCY)}.`,
        cta: "Inspect zone positions",
        params: {
          symbol: bestZone.symbol,
          side: bestZone.side,
        },
      });
    }

    return rules.slice(0, 3);
  }, [worstCombo, bestCombo, timeBehavior, priceZones]);

  function clamp(n: number, a = 0, b = 100) {
    return Math.max(a, Math.min(b, n));
  }

  function isoDayUTC(ts?: string) {
    const d = ts ? new Date(ts) : null;
    if (!d || Number.isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }

  const mentorScorecards = useMemo(() => {
    const rows = mentorRows ?? [];
    if (!rows.length) {
      return {
        edge: { score: 0, why: "No data yet.", next: "Upload trades first." },
        consistency: {
          score: 0,
          why: "No data yet.",
          next: "Upload trades first.",
        },
        discipline: {
          score: 0,
          why: "No data yet.",
          next: "Upload trades first.",
        },
      };
    }

    // --- Edge quality: profit factor + winrate blend
    const wins = rows.filter((r) => r.net > 0).map((r) => r.net);
    const losses = rows.filter((r) => r.net < 0).map((r) => Math.abs(r.net));
    const grossWin = wins.reduce((a, b) => a + b, 0);
    const grossLoss = losses.reduce((a, b) => a + b, 0);
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 9 : 0; // cap-ish
    const wr =
      wins.length + losses.length > 0
        ? wins.length / (wins.length + losses.length)
        : 0;

    // map PF to 0..100 (PF 1.0 => 50, PF 1.5 => 70, PF 2.0 => 85)
    const pfScore = clamp(pf <= 1 ? pf * 50 : 50 + (pf - 1) * 35, 0, 100);
    const wrScore = clamp(wr * 100, 0, 100);
    const edgeScore = clamp(pfScore * 0.65 + wrScore * 0.35);

    const edgeWhy =
      pf >= 1
        ? `Profit Factor ~${pf.toFixed(2)} with WR ${fmtPercent(wr)}.`
        : `Profit Factor ~${pf.toFixed(2)} (losses outweigh wins).`;
    const edgeNext =
      pf < 1
        ? "Reduce worst pattern frequency or tighten exits on losing holds."
        : "Scale what works: repeat your best pattern with strict rules.";

    // --- Consistency: daily distribution (how many green days / how volatile)
    const dayMap = new Map<string, number>();
    for (const r of rows) {
      const ts = pickTimeForBehavior(r);
      const day = isoDayUTC(ts);
      if (!day) continue;
      dayMap.set(day, (dayMap.get(day) ?? 0) + (r.net ?? 0));
    }
    const dayPnls = Array.from(dayMap.values());
    const greenDays = dayPnls.filter((x) => x > 0).length;
    const redDays = dayPnls.filter((x) => x < 0).length;
    const dayCount = greenDays + redDays;
    const greenRate = dayCount ? greenDays / dayCount : 0;

    // volatility proxy: average absolute day pnl relative to average win day
    const absAvg = dayPnls.length
      ? dayPnls.reduce((a, b) => a + Math.abs(b), 0) / dayPnls.length
      : 0;
    const avgGreen = greenDays
      ? dayPnls.filter((x) => x > 0).reduce((a, b) => a + b, 0) / greenDays
      : 0;

    // consistency = green rate + stability
    const stability = avgGreen > 0 ? clamp(100 - (absAvg / avgGreen) * 60) : 40;
    const consistencyScore = clamp(greenRate * 70 + stability * 0.3);

    const consistencyWhy =
      dayCount >= 5
        ? `${greenDays}/${dayCount} profitable days (green rate ${fmtPercent(greenRate)}).`
        : "Not enough distinct days to judge consistency well.";
    const consistencyNext =
      greenRate < 0.5
        ? "Reduce trading on your worst time window + cut the leak pattern."
        : "Keep your daily process stable; avoid expanding into weak hours.";

    // --- Discipline: concentration + avoiding worst hour + using best pattern
    const total = rows.length;

    // concentration by top symbol (too high can be risky, too low can be unfocused)
    const symCount = new Map<string, number>();
    for (const r of rows)
      symCount.set(r.symbol, (symCount.get(r.symbol) ?? 0) + 1);
    const topSymShare = total
      ? Math.max(...Array.from(symCount.values())) / total
      : 0;

    // share in worst hour (if known)
    const worstHour = timeBehavior.hoursWorst?.[0]?.hour;
    let inWorstHour = 0;
    if (worstHour != null) {
      for (const r of rows) {
        const h = hourUTC(pickTimeForBehavior(r));
        if (h === worstHour) inWorstHour += 1;
      }
    }
    const worstHourShare = total ? inWorstHour / total : 0;

    // share matching bestCombo (if exists)
    let inBestCombo = 0;
    if (bestCombo) {
      for (const r of rows) {
        const hb = holdBucketLabel(r.holdMin ?? null);
        if (
          r.symbol === bestCombo.symbol &&
          r.side === bestCombo.side &&
          hb === bestCombo.holdBucket
        ) {
          inBestCombo += 1;
        }
      }
    }
    const bestComboShare = total ? inBestCombo / total : 0;

    // scoring: reward bestComboShare, penalize worstHourShare, keep symbol focus in healthy band
    const focusScore =
      topSymShare >= 0.2 && topSymShare <= 0.6
        ? 80
        : topSymShare < 0.2
          ? 55
          : 60;
    const disciplineScore = clamp(
      focusScore * 0.35 +
        clamp(bestComboShare * 130) * 0.45 +
        clamp(100 - worstHourShare * 180) * 0.2,
    );

    const disciplineWhy = `Best-pattern usage ${fmtPercent(bestComboShare)} · Worst-hour exposure ${fmtPercent(
      worstHourShare,
    )} · Top-symbol share ${fmtPercent(topSymShare)}.`;

    const disciplineNext =
      worstHourShare > 0.2
        ? "Hard rule: avoid your worst hour unless A+ setup."
        : bestComboShare < 0.15
          ? "Trade fewer setups — repeat your best pattern more often."
          : "Good structure: keep rules strict and scale slowly.";

    return {
      edge: { score: Math.round(edgeScore), why: edgeWhy, next: edgeNext },
      consistency: {
        score: Math.round(consistencyScore),
        why: consistencyWhy,
        next: consistencyNext,
      },
      discipline: {
        score: Math.round(disciplineScore),
        why: disciplineWhy,
        next: disciplineNext,
      },
    };
  }, [mentorRows, bestCombo, timeBehavior]);

  function pickTsForSort(r: MentorRow) {
    return pickTimeForBehavior(r) ?? r.closedAt ?? r.openedAt ?? "";
  }

  function avg(nums: number[]) {
    if (!nums.length) return 0;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  function computeSliceStats(slice: MentorRow[]) {
    const wins = slice.filter((r) => r.net > 0).length;
    const losses = slice.filter((r) => r.net < 0).length;
    const counted = wins + losses;
    const wr = counted ? wins / counted : 0;

    const netTotal = slice.reduce((a, r) => a + (r.net ?? 0), 0);
    const avgNet = slice.length ? netTotal / slice.length : 0;

    const holds = slice
      .map((r) => safeNum(r.holdMin))
      .filter((x) => Number.isFinite(x) && x > 0);
    const avgHold = holds.length ? avg(holds) : 0;

    // worst hour exposure
    const worstHour = timeBehavior.hoursWorst?.[0]?.hour;
    let worstHourCount = 0;
    if (worstHour != null) {
      for (const r of slice) {
        const h = hourUTC(pickTimeForBehavior(r));
        if (h === worstHour) worstHourCount++;
      }
    }
    const worstHourShare = slice.length ? worstHourCount / slice.length : 0;

    // best combo usage
    let bestComboCount = 0;
    if (bestCombo) {
      for (const r of slice) {
        const hb = holdBucketLabel(r.holdMin ?? null);
        if (
          r.symbol === bestCombo.symbol &&
          r.side === bestCombo.side &&
          hb === bestCombo.holdBucket
        ) {
          bestComboCount++;
        }
      }
    }
    const bestComboShare = slice.length ? bestComboCount / slice.length : 0;

    return { wr, netTotal, avgNet, avgHold, worstHourShare, bestComboShare };
  }

  const mentorProgress = useMemo(() => {
    const rows = [...(mentorRows ?? [])].sort((a, b) =>
      String(pickTsForSort(a)).localeCompare(String(pickTsForSort(b))),
    );

    if (rows.length < 12) {
      return { enough: false, first: null as any, last: null as any };
    }

    // Use 25% earliest vs 25% latest (behavior change)
    const n = rows.length;
    const k = Math.max(5, Math.floor(n * 0.25));

    const first = rows.slice(0, k);
    const last = rows.slice(n - k);

    return {
      enough: true,
      k,
      first: computeSliceStats(first),
      last: computeSliceStats(last),
    };
  }, [mentorRows, bestCombo, timeBehavior]);

  const mentorVerdict = useMemo(() => {
    if (!mentorProgress?.enough) {
      return {
        headline: "Not enough data yet",
        message:
          "Upload more positions so I can compare your earlier vs current behavior.",
        actions: [] as string[],
      };
    }

    const a = mentorProgress.first;
    const b = mentorProgress.last;

    const dWR = (b.wr ?? 0) - (a.wr ?? 0);
    const dAvgNet = (b.avgNet ?? 0) - (a.avgNet ?? 0);
    const dWorstHour = (b.worstHourShare ?? 0) - (a.worstHourShare ?? 0);
    const dBestCombo = (b.bestComboShare ?? 0) - (a.bestComboShare ?? 0);

    const positives: string[] = [];
    const negatives: string[] = [];

    if (dAvgNet > 0) positives.push("your average profit per trade improved");
    if (dAvgNet < 0) negatives.push("your average profit per trade declined");

    if (dWR > 0.03) positives.push("your win rate improved");
    if (dWR < -0.03) negatives.push("your win rate dropped");

    if (dWorstHour < -0.02)
      positives.push("you reduced trading in your worst time window");
    if (dWorstHour > 0.02)
      negatives.push("you traded more in your worst time window");

    if (dBestCombo > 0.02)
      positives.push("you used your best repeatable pattern more often");
    if (dBestCombo < -0.02)
      negatives.push("you used your best repeatable pattern less often");

    const headline =
      positives.length && !negatives.length
        ? "You're improving ✅"
        : negatives.length && !positives.length
          ? "You're leaking ⚠️"
          : "Mixed progress";

    const messageParts: string[] = [];
    if (positives.length) messageParts.push(`Good: ${positives.join(", ")}.`);
    if (negatives.length)
      messageParts.push(`Watch out: ${negatives.join(", ")}.`);

    const actions: string[] = [];

    // Action 1: always tackle worst leak if it got worse
    if (dWorstHour > 0.02 && timeBehavior?.hoursWorst?.[0]) {
      actions.push(
        `Add a rule: avoid trading around ${String(timeBehavior.hoursWorst[0].hour).padStart(2, "0")}:00 UTC for the next 20 trades.`,
      );
    } else {
      actions.push(
        "Keep risk simple: trade only your A+ setups for the next 20 trades.",
      );
    }

    // Action 2: encourage best pattern usage if available
    if (bestCombo) {
      actions.push(
        `Focus: ${bestCombo.symbol} ${bestCombo.side} with ${bestCombo.holdBucket} holds (make this your default until performance drops).`,
      );
    } else {
      actions.push(
        "Build repetition: focus on 1–2 symbols so we can detect patterns reliably.",
      );
    }

    return {
      headline,
      message: messageParts.join(" "),
      actions,
    };
  }, [mentorProgress, bestCombo, timeBehavior]);

  const behaviorChange = useMemo(() => {
    const rows = [...mentorRows]
      .map((r) => ({
        ...r,
        // use closedAt first for timeline; fallback openedAt
        _t: new Date(r.closedAt ?? r.openedAt ?? 0).getTime(),
      }))
      .filter((r) => Number.isFinite(r._t) && r._t > 0)
      .sort((a, b) => a._t - b._t);

    const n = rows.length;
    if (n < 12) {
      return { ok: false as const, reason: "Not enough data for comparison." };
    }

    const chunk = Math.max(4, Math.floor(n * 0.3)); // 30% vs 30%
    const early = rows.slice(0, chunk);
    const late = rows.slice(n - chunk);

    function summarize(list: any[]) {
      const wins = list.filter((x) => (x.net ?? 0) > 0).length;
      const losses = list.filter((x) => (x.net ?? 0) < 0).length;
      const wr = wins + losses ? wins / (wins + losses) : 0;

      const net = list.reduce((a, x) => a + (x.net ?? 0), 0);

      const holds = list
        .map((x) => x.holdMin)
        .filter(
          (x: any) => typeof x === "number" && Number.isFinite(x) && x >= 0,
        );
      const avgHold = holds.length
        ? holds.reduce((a: number, b: number) => a + b, 0) / holds.length
        : 0;

      const longN = list.filter((x) => x.side === "LONG").length;
      const shortN = list.filter((x) => x.side === "SHORT").length;
      const total = Math.max(1, list.length);
      const longShare = longN / total;
      const shortShare = shortN / total;

      // top symbol by count
      const symCount = new Map<string, number>();
      for (const x of list)
        symCount.set(x.symbol, (symCount.get(x.symbol) ?? 0) + 1);
      const topSym =
        Array.from(symCount.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        "—";

      return {
        wins,
        losses,
        wr,
        net,
        avgHold,
        longShare,
        shortShare,
        topSym,
        n: list.length,
      };
    }

    const A = summarize(early);
    const B = summarize(late);

    // simple deltas
    const dWR = B.wr - A.wr;
    const dHold = B.avgHold - A.avgHold;
    const dLong = B.longShare - A.longShare;
    const dNet = B.net - A.net;

    // “verdict” lines (compact, mentor-like)
    const lines: { title: string; detail: string; score: number }[] = [];

    lines.push({
      title: "Winrate",
      detail: `${fmtPercent(A.wr)} → ${fmtPercent(B.wr)} (${dWR >= 0 ? "+" : ""}${(dWR * 100).toFixed(1)}%)`,
      score: dWR,
    });

    lines.push({
      title: "Avg holding time",
      detail: `${Math.round(A.avgHold)}m → ${Math.round(B.avgHold)}m (${dHold >= 0 ? "+" : ""}${Math.round(dHold)}m)`,
      score: -Math.abs(dHold) * 0.0001, // neutral-ish (we don’t assume longer is better)
    });

    lines.push({
      title: "Direction bias",
      detail: `LONG share ${Math.round(A.longShare * 100)}% → ${Math.round(B.longShare * 100)}% (${dLong >= 0 ? "+" : ""}${Math.round(dLong * 100)}%)`,
      score: -Math.abs(dLong) * 0.01,
    });

    lines.push({
      title: "Net outcome (recent vs early)",
      detail: `${fmtMoney(A.net, DEFAULT_CCY)} → ${fmtMoney(B.net, DEFAULT_CCY)} (${dNet >= 0 ? "+" : ""}${fmtMoney(dNet, DEFAULT_CCY)})`,
      score: dNet,
    });

    lines.push({
      title: "Focus symbol changed?",
      detail: `${A.topSym} → ${B.topSym}`,
      score: A.topSym === B.topSym ? 0.1 : 0,
    });

    // pick 3 “most important” lines (by absolute score or meaningfulness)
    const top = [...lines]
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 3);

    return {
      ok: true as const,
      early: A,
      late: B,
      lines,
      highlights: top,
      window: { earlyN: A.n, lateN: B.n },
    };
  }, [mentorRows]);

  const behaviorComboShift = useMemo(() => {
    const rows = [...mentorRows]
      .map((r) => ({
        ...r,
        _t: new Date(r.closedAt ?? r.openedAt ?? 0).getTime(),
      }))
      .filter((r) => Number.isFinite(r._t) && r._t > 0)
      .sort((a, b) => a._t - b._t);

    const n = rows.length;
    if (n < 12) {
      return { ok: false as const, reason: "Not enough data for combo shift." };
    }

    const chunk = Math.max(4, Math.floor(n * 0.3));
    const early = rows.slice(0, chunk);
    const late = rows.slice(n - chunk);

    type Agg = {
      key: string;
      symbol: string;
      side: string;
      hold: string;
      count: number;
      net: number;
    };

    function agg(list: any[]) {
      const map = new Map<string, Agg>();
      for (const r of list) {
        const symbol = normalizeSymbol(r.symbol);
        const side = r.side ?? "UNKNOWN";
        const hold = holdBucketLabel(r.holdMin ?? null);
        const key = `${symbol}|${side}|${hold}`;

        const cur = map.get(key) ?? {
          key,
          symbol,
          side,
          hold,
          count: 0,
          net: 0,
        };

        cur.count += 1;
        cur.net += r.net ?? 0;
        map.set(key, cur);
      }
      return map;
    }

    const A = agg(early);
    const B = agg(late);

    const keys = new Set<string>([...A.keys(), ...B.keys()]);
    const rowsOut = Array.from(keys).map((key) => {
      const a = A.get(key);
      const b = B.get(key);

      const aCount = a?.count ?? 0;
      const bCount = b?.count ?? 0;
      const aNet = a?.net ?? 0;
      const bNet = b?.net ?? 0;

      return {
        key,
        symbol: (b?.symbol ?? a?.symbol ?? "—") as string,
        side: (b?.side ?? a?.side ?? "UNKNOWN") as string,
        hold: (b?.hold ?? a?.hold ?? "Unknown") as string,
        earlyCount: aCount,
        recentCount: bCount,
        earlyNet: aNet,
        recentNet: bNet,
        dCount: bCount - aCount,
        dNet: bNet - aNet,
      };
    });

    // thresholds so it stays meaningful + compact
    const MIN_ANY = 2; // at least 2 appearances in either window
    const filtered = rowsOut.filter(
      (x) => Math.max(x.earlyCount, x.recentCount) >= MIN_ANY,
    );

    const mostImproved = [...filtered]
      .filter((x) => x.dNet > 0)
      .sort((a, b) => b.dNet - a.dNet)
      .slice(0, 5);

    const mostWorse = [...filtered]
      .filter((x) => x.dNet < 0)
      .sort((a, b) => a.dNet - b.dNet)
      .slice(0, 5);

    const newPatterns = [...filtered]
      .filter((x) => x.earlyCount === 0 && x.recentCount >= MIN_ANY)
      .sort((a, b) => b.recentNet - a.recentNet)
      .slice(0, 4);

    const disappeared = [...filtered]
      .filter((x) => x.recentCount === 0 && x.earlyCount >= MIN_ANY)
      .sort((a, b) => b.earlyNet - a.earlyNet)
      .slice(0, 4);

    return {
      ok: true as const,
      window: { earlyN: early.length, recentN: late.length },
      mostImproved,
      mostWorse,
      newPatterns,
      disappeared,
    };
  }, [mentorRows]);

  const behaviorDrivers = useMemo(() => {
    const rows = [...mentorRows]
      .map((r) => ({
        ...r,
        _t: new Date(r.closedAt ?? r.openedAt ?? 0).getTime(),
      }))
      .filter((r) => Number.isFinite(r._t) && r._t > 0)
      .sort((a, b) => a._t - b._t);

    const n = rows.length;
    if (n < 12) return { ok: false as const, reason: "Not enough data." };

    const chunk = Math.max(4, Math.floor(n * 0.3));
    const early = rows.slice(0, chunk);
    const late = rows.slice(n - chunk);

    function aggTime(list: any[]) {
      const byHour = new Map<
        number,
        { hour: number; count: number; net: number }
      >();
      for (const r of list) {
        const ts = pickTimeForBehavior(r);
        const h = hourUTC(ts);
        if (h == null) continue;
        const cur = byHour.get(h) ?? { hour: h, count: 0, net: 0 };
        cur.count += 1;
        cur.net += r.net ?? 0;
        byHour.set(h, cur);
      }
      const arr = Array.from(byHour.values()).filter((x) => x.count >= 2);
      const best = [...arr].sort((a, b) => b.net - a.net)[0] ?? null;
      const worst = [...arr].sort((a, b) => a.net - b.net)[0] ?? null;
      return { best, worst };
    }

    function holdMix(list: any[]) {
      const m = new Map<
        string,
        { bucket: string; count: number; net: number }
      >();
      for (const r of list) {
        const b = holdBucketLabel(r.holdMin ?? null);
        const cur = m.get(b) ?? { bucket: b, count: 0, net: 0 };
        cur.count += 1;
        cur.net += r.net ?? 0;
        m.set(b, cur);
      }
      const arr = Array.from(m.values()).sort((a, b) => b.count - a.count);
      return arr.slice(0, 4); // keep compact
    }

    function topSymbols(list: any[]) {
      const m = new Map<
        string,
        { symbol: string; count: number; net: number }
      >();
      for (const r of list) {
        const s = normalizeSymbol(r.symbol);
        const cur = m.get(s) ?? { symbol: s, count: 0, net: 0 };
        cur.count += 1;
        cur.net += r.net ?? 0;
        m.set(s, cur);
      }
      const arr = Array.from(m.values()).sort((a, b) => b.count - a.count);
      return arr.slice(0, 4);
    }

    const earlyTime = aggTime(early);
    const lateTime = aggTime(late);

    const earlyHold = holdMix(early);
    const lateHold = holdMix(late);

    const earlySyms = topSymbols(early);
    const lateSyms = topSymbols(late);

    // Mentor hypotheses (short + actionable)
    const insights: string[] = [];

    if (
      earlyTime.worst &&
      lateTime.worst &&
      earlyTime.worst.hour !== lateTime.worst.hour
    ) {
      insights.push(
        `Your worst hour shifted from ${String(earlyTime.worst.hour).padStart(2, "0")}:00 UTC to ${String(
          lateTime.worst.hour,
        ).padStart(
          2,
          "0",
        )}:00 UTC — check if you started trading a new session window.`,
      );
    }

    const earlyTopHold = earlyHold[0];
    const lateTopHold = lateHold[0];
    if (
      earlyTopHold &&
      lateTopHold &&
      earlyTopHold.bucket !== lateTopHold.bucket
    ) {
      insights.push(
        `You changed your holding style: from mostly "${earlyTopHold.bucket}" to mostly "${lateTopHold.bucket}". This often changes winrate + volatility.`,
      );
    }

    const earlyTopSym = earlySyms[0];
    const lateTopSym = lateSyms[0];
    if (earlyTopSym && lateTopSym && earlyTopSym.symbol !== lateTopSym.symbol) {
      insights.push(
        `Your focus shifted from ${earlyTopSym.symbol} to ${lateTopSym.symbol}. Different symbols behave differently — consider adapting entry rules.`,
      );
    }

    // If we have combo shift, reference strongest leak/improvement as driver
    if (behaviorComboShift.ok) {
      const leak = behaviorComboShift.mostWorse?.[0];
      const win = behaviorComboShift.mostImproved?.[0];
      if (leak) {
        insights.push(
          `Main drag lately: ${leak.symbol} ${leak.side} ${leak.hold} (ΔNet ${fmtMoney(leak.dNet, DEFAULT_CCY)}). Consider a rule to avoid this combo.`,
        );
      }
      if (win) {
        insights.push(
          `Main improvement: ${win.symbol} ${win.side} ${win.hold} (ΔNet ${fmtMoney(win.dNet, DEFAULT_CCY)}). Consider scaling this setup.`,
        );
      }
    }

    return {
      ok: true as const,
      window: { earlyN: early.length, recentN: late.length },
      earlyTime,
      lateTime,
      earlyHold,
      lateHold,
      earlySyms,
      lateSyms,
      insights: insights.slice(0, 4),
    };
  }, [mentorRows, behaviorComboShift]);

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
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontWeight: 1000, fontSize: 18 }}>Mentor</div>

              <span className="badge badge-purple">BITGET ONLY · BETA</span>
              <span className="badge badge-blue">EDUCATIONAL ANALYTICS</span>
            </div>

            <div
              className="p-muted"
              style={{ marginTop: 6, fontSize: 12, lineHeight: 1.4 }}
            >
              Built for Bitget Futures traders. Analytics only — no financial
              advice.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <select
              value={range}
              onChange={(e) => setRange(e.target.value as any)}
            >
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>
        </div>
      </div>

      <div
        style={{
          fontSize: 11,
          opacity: 0.6,
          marginBottom: 8,
        }}
      >
        Educational analytics only — not financial advice.
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

                <div style={cardInner()}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      fontWeight: 900,
                    }}
                  >
                    RISK ESCALATION (AFTER LOSSES)
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span className="badge badge-purple">
                      {riskEscalation.totalAfterLoss}x after loss
                    </span>

                    <span
                      className={`badge ${
                        riskEscalation.escalationRate > 0.35
                          ? "badge-red"
                          : "badge-green"
                      }`}
                    >
                      {fmtPercent(riskEscalation.escalationRate)} escalated
                    </span>

                    <span className="badge badge-blue">
                      avg +{fmtMoney(riskEscalation.avgIncrease, DEFAULT_CCY)}
                    </span>
                  </div>

                  <div
                    className="p-muted"
                    style={{ marginTop: 8, fontSize: 12 }}
                  >
                    Meaning: After a red trade, you often increase risk on the
                    next position. Keep this below ~25% to stay disciplined.
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
                    LOSS-STREAK GUARDRAIL
                  </div>

                  <div
                    style={{
                      marginTop: 6,
                      display: "flex",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span className="badge badge-red">
                      current: {lossStreak.currentStreak}
                    </span>
                    <span className="badge badge-purple">
                      max: {lossStreak.maxStreak}
                    </span>

                    <span
                      className={`badge ${
                        lossStreak.currentStreak >= lossStreak.stopAt
                          ? "badge-red"
                          : lossStreak.currentStreak >= lossStreak.warnAt
                            ? "badge-purple"
                            : "badge-green"
                      }`}
                    >
                      {lossStreak.currentStreak >= lossStreak.stopAt
                        ? "STOP"
                        : lossStreak.currentStreak >= lossStreak.warnAt
                          ? "CAUTION"
                          : "OK"}
                    </span>
                  </div>

                  <div
                    className="p-muted"
                    style={{ marginTop: 8, fontSize: 12 }}
                  >
                    Rule: At {lossStreak.warnAt} consecutive losses → reduce
                    size. At {lossStreak.stopAt} → stop for the day.
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
                      {(() => {
                        const c = confidenceLabel(bestCombo.count);
                        return (
                          <div style={{ marginTop: 8 }}>
                            <span className={c.cls}>{c.label}</span>
                          </div>
                        );
                      })()}
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
                      {(() => {
                        const c = confidenceLabel(worstCombo.count);
                        return (
                          <div style={{ marginTop: 8 }}>
                            <span className={c.cls}>{c.label}</span>
                          </div>
                        );
                      })()}
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

                {/* Chat transcript */}
                <div
                  style={{
                    ...cardInner(),
                    padding: 12,
                    maxHeight: 260,
                    overflow: "auto",
                    display: "grid",
                    gap: 8,
                  }}
                >
                  {messages.map((m, idx) => (
                    <div
                      key={m.ts + "-" + idx}
                      style={{
                        display: "flex",
                        justifyContent:
                          m.role === "user" ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "85%",
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: "1px solid rgba(255,255,255,0.08)",
                          background:
                            m.role === "user"
                              ? "rgba(0,212,255,0.10)"
                              : "rgba(255,255,255,0.03)",
                        }}
                      >
                        <div
                          className="p-muted"
                          style={{
                            fontSize: 11,
                            marginBottom: 6,
                            opacity: 0.85,
                          }}
                        >
                          {m.role === "user" ? "You" : "Mentor"}
                        </div>
                        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
                          {m.text}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ ...cardInner(), padding: 12 }}>
                  <div className="p-muted" style={{ fontSize: 12 }}>
                    Prompt
                  </div>
                  <input
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendMessage();
                    }}
                    placeholder="Ask about your behavior…"
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
                      onClick={() => sendMessage()}
                    >
                      Send
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

          {/* SCORECARDS */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            {[
              {
                k: "edge",
                title: "Edge Quality",
                hint: "Do you have an edge?",
              },
              {
                k: "consistency",
                title: "Consistency",
                hint: "How stable are you?",
              },
              {
                k: "discipline",
                title: "Discipline",
                hint: "Do you follow your best rules?",
              },
            ].map((c) => {
              const item = (mentorScorecards as any)[c.k];
              return (
                <div key={c.k} className="card" style={{ padding: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 1000 }}>{c.title}</div>
                      <div
                        className="p-muted"
                        style={{ marginTop: 4, fontSize: 12 }}
                      >
                        {c.hint}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 1000, fontSize: 20 }}>
                        {item?.score ?? 0}
                      </div>
                      <div className="p-muted" style={{ fontSize: 12 }}>
                        /100
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12, ...cardInner() }}>
                    <div className="p-muted" style={{ fontSize: 12 }}>
                      Why
                    </div>
                    <div
                      style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5 }}
                    >
                      {item?.why ?? "—"}
                    </div>

                    <div
                      className="p-muted"
                      style={{ fontSize: 12, marginTop: 10 }}
                    >
                      Next move
                    </div>
                    <div
                      style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5 }}
                    >
                      <b>{item?.next ?? "—"}</b>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* MENTOR VERDICT (compact, coach-like) */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Mentor Verdict</div>

            <div style={{ marginTop: 12, ...cardInner() }}>
              <div style={{ fontWeight: 1000, fontSize: 16 }}>
                {mentorVerdict.headline}
              </div>
              <div
                className="p-muted"
                style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}
              >
                {mentorVerdict.message}
              </div>

              {mentorVerdict.actions.length ? (
                <div
                  style={{
                    marginTop: 12,
                    display: "grid",
                    gap: 8,
                    fontSize: 12,
                  }}
                >
                  {mentorVerdict.actions.slice(0, 2).map((a, i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                      }}
                    >
                      <span className="badge badge-blue" style={{ height: 22 }}>
                        {i + 1}
                      </span>
                      <div>{a}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          {/* PROGRESS / CHANGE */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Behavior Progress</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Vergleich: erste 25% deiner Trades vs letzte 25% (zeigt echte
              Veränderung).
            </div>

            {!mentorProgress.enough ? (
              <div style={{ marginTop: 12, ...cardInner() }}>
                <div style={{ fontWeight: 1000 }}>Not enough data</div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  Für “Progress” brauchen wir mindestens ~12 Positionen (damit
                  die zwei Zeitfenster Sinn machen).
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                {(() => {
                  const a = mentorProgress.first;
                  const b = mentorProgress.last;

                  const dWR = (b.wr ?? 0) - (a.wr ?? 0);
                  const dAvgNet = (b.avgNet ?? 0) - (a.avgNet ?? 0);
                  const dHold = (b.avgHold ?? 0) - (a.avgHold ?? 0);
                  const dWorstHour =
                    (b.worstHourShare ?? 0) - (a.worstHourShare ?? 0);
                  const dBestCombo =
                    (b.bestComboShare ?? 0) - (a.bestComboShare ?? 0);

                  function badge(delta: number, betterWhenPositive = true) {
                    const good = betterWhenPositive ? delta > 0 : delta < 0;
                    const cls = good
                      ? "badge badge-green"
                      : delta === 0
                        ? "badge"
                        : "badge badge-red";
                    const sign = delta > 0 ? "+" : "";
                    return (
                      <span className={cls} style={{ height: 22 }}>
                        {sign}
                        {betterWhenPositive
                          ? fmtPercent(Math.abs(delta))
                          : fmtPercent(Math.abs(delta))}
                      </span>
                    );
                  }

                  return (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                      }}
                    >
                      <div style={cardInner()}>
                        <div style={{ fontWeight: 1000 }}>
                          Earlier (first 25%)
                        </div>
                        <div
                          className="p-muted"
                          style={{ marginTop: 8, fontSize: 12 }}
                        >
                          Sample: {mentorProgress.k} positions
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
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <span className="p-muted">Winrate</span>
                            <b>{fmtPercent(a.wr)}</b>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <span className="p-muted">Avg / trade</span>
                            <b
                              className={pnlClass(a.avgNet)}
                              style={{ color: "inherit" }}
                            >
                              {fmtMoney(a.avgNet, DEFAULT_CCY)}
                            </b>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <span className="p-muted">Avg hold</span>
                            <b>
                              {a.avgHold ? `${Math.round(a.avgHold)}m` : "—"}
                            </b>
                          </div>
                        </div>
                      </div>

                      <div style={cardInner()}>
                        <div style={{ fontWeight: 1000 }}>Now (last 25%)</div>
                        <div
                          className="p-muted"
                          style={{ marginTop: 8, fontSize: 12 }}
                        >
                          Sample: {mentorProgress.k} positions
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
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <span className="p-muted">Winrate</span>
                            <span
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              <b>{fmtPercent(b.wr)}</b>
                              {badge(dWR, true)}
                            </span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <span className="p-muted">Avg / trade</span>
                            <span
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              <b
                                className={pnlClass(b.avgNet)}
                                style={{ color: "inherit" }}
                              >
                                {fmtMoney(b.avgNet, DEFAULT_CCY)}
                              </b>
                              <span
                                className={
                                  dAvgNet > 0
                                    ? "badge badge-green"
                                    : dAvgNet < 0
                                      ? "badge badge-red"
                                      : "badge"
                                }
                                style={{ height: 22 }}
                              >
                                {dAvgNet > 0 ? "+" : ""}
                                {fmtMoney(dAvgNet, DEFAULT_CCY)}
                              </span>
                            </span>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                            }}
                          >
                            <span className="p-muted">Avg hold</span>
                            <span
                              style={{
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                              }}
                            >
                              <b>
                                {b.avgHold ? `${Math.round(b.avgHold)}m` : "—"}
                              </b>
                              <span
                                className={
                                  dHold < 0
                                    ? "badge badge-green"
                                    : dHold > 0
                                      ? "badge badge-purple"
                                      : "badge"
                                }
                                style={{ height: 22 }}
                              >
                                {dHold > 0 ? "+" : ""}
                                {Math.round(dHold)}m
                              </span>
                            </span>
                          </div>

                          <div
                            style={{
                              marginTop: 8,
                              borderTop: "1px solid var(--border)",
                              paddingTop: 10,
                              display: "grid",
                              gap: 8,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
                              <span className="p-muted">
                                Worst-hour exposure
                              </span>
                              <span
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                <b>{fmtPercent(b.worstHourShare)}</b>
                                {/* lower is better */}
                                {badge(dWorstHour, false)}
                              </span>
                            </div>

                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 10,
                              }}
                            >
                              <span className="p-muted">
                                Best-pattern usage
                              </span>
                              <span
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                <b>{fmtPercent(b.bestComboShare)}</b>
                                {badge(dBestCombo, true)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="p-muted" style={{ fontSize: 12 }}>
                  Mentor view: Ziel ist <b>mehr Best-pattern usage</b> +{" "}
                  <b>weniger Worst-hour exposure</b>. Wenn beides gleichzeitig
                  besser wird, bist du auf dem richtigen Weg.
                </div>
              </div>
            )}
          </div>

          {/* NEW: Behavior Change (Early vs Recent) */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Behavior Change</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Comparing your early trades vs your most recent trades (approx.
              30% vs 30%).
            </div>

            {!behaviorChange.ok ? (
              <div style={{ marginTop: 12, ...cardInner() }}>
                <div style={{ fontWeight: 1000 }}>Not enough data</div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  {behaviorChange.reason}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <span className="badge badge-blue">
                    Early: {behaviorChange.window.earlyN} pos
                  </span>
                  <span className="badge badge-purple">
                    Recent: {behaviorChange.window.lateN} pos
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                  }}
                >
                  <div style={cardInner()}>
                    <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                      Key highlights
                    </div>
                    <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                      {behaviorChange.highlights.map((h) => (
                        <div
                          key={h.title}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                          }}
                        >
                          <span className="p-muted">{h.title}</span>
                          <span style={{ fontWeight: 900 }}>{h.detail}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={cardInner()}>
                    <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                      Mentor interpretation
                    </div>
                    <div
                      className="p-muted"
                      style={{ fontSize: 12, lineHeight: 1.5 }}
                    >
                      If winrate and net improved recently, your process is
                      stabilizing. If net dropped while holding time or
                      direction bias changed, we should inspect the patterns
                      (symbol + side + hold bucket) that changed.
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* NEW: What changed the most? */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>What changed the most?</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Biggest shifts in your repeatable patterns (symbol + side +
              holding bucket).
            </div>

            {!behaviorComboShift.ok ? (
              <div style={{ marginTop: 12, ...cardInner() }}>
                <div style={{ fontWeight: 1000 }}>Not enough data</div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  {behaviorComboShift.reason}
                </div>
              </div>
            ) : (
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
                    Improved
                  </div>
                  {behaviorComboShift.mostImproved.length ? (
                    <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                      {behaviorComboShift.mostImproved.map((x) => (
                        <button
                          key={x.key}
                          className="btn-secondary"
                          style={{ textAlign: "left" }}
                          onClick={() =>
                            goPositions({ symbol: x.symbol, side: x.side })
                          }
                        >
                          <b>{x.symbol}</b> · {x.side} · {x.hold}
                          <div className="p-muted" style={{ marginTop: 4 }}>
                            ΔNet{" "}
                            <b
                              className={pnlClass(x.dNet)}
                              style={{ color: "inherit" }}
                            >
                              {fmtMoney(x.dNet, DEFAULT_CCY)}
                            </b>
                            {" · "}Early {x.earlyCount} → Recent {x.recentCount}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-muted" style={{ fontSize: 12 }}>
                      No clear improvements yet.
                    </div>
                  )}
                </div>

                <div style={cardInner()}>
                  <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                    Got worse
                  </div>
                  {behaviorComboShift.mostWorse.length ? (
                    <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                      {behaviorComboShift.mostWorse.map((x) => (
                        <button
                          key={x.key}
                          className="btn-secondary"
                          style={{ textAlign: "left" }}
                          onClick={() =>
                            goPositions({ symbol: x.symbol, side: x.side })
                          }
                        >
                          <b>{x.symbol}</b> · {x.side} · {x.hold}
                          <div className="p-muted" style={{ marginTop: 4 }}>
                            ΔNet{" "}
                            <b
                              className={pnlClass(x.dNet)}
                              style={{ color: "inherit" }}
                            >
                              {fmtMoney(x.dNet, DEFAULT_CCY)}
                            </b>
                            {" · "}Early {x.earlyCount} → Recent {x.recentCount}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="p-muted" style={{ fontSize: 12 }}>
                      No clear deteriorations yet.
                    </div>
                  )}
                </div>

                <div style={cardInner()}>
                  <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                    New patterns
                  </div>
                  {behaviorComboShift.newPatterns.length ? (
                    <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                      {behaviorComboShift.newPatterns.map((x) => (
                        <div key={x.key}>
                          <b>{x.symbol}</b> · {x.side} · {x.hold}
                          <div className="p-muted" style={{ marginTop: 4 }}>
                            Recent {x.recentCount} · Net{" "}
                            <b
                              className={pnlClass(x.recentNet)}
                              style={{ color: "inherit" }}
                            >
                              {fmtMoney(x.recentNet, DEFAULT_CCY)}
                            </b>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-muted" style={{ fontSize: 12 }}>
                      No new stable patterns detected.
                    </div>
                  )}
                </div>

                <div style={cardInner()}>
                  <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                    Disappeared
                  </div>
                  {behaviorComboShift.disappeared.length ? (
                    <div style={{ display: "grid", gap: 8, fontSize: 12 }}>
                      {behaviorComboShift.disappeared.map((x) => (
                        <div key={x.key}>
                          <b>{x.symbol}</b> · {x.side} · {x.hold}
                          <div className="p-muted" style={{ marginTop: 4 }}>
                            Early {x.earlyCount} · Net{" "}
                            <b
                              className={pnlClass(x.earlyNet)}
                              style={{ color: "inherit" }}
                            >
                              {fmtMoney(x.earlyNet, DEFAULT_CCY)}
                            </b>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-muted" style={{ fontSize: 12 }}>
                      No disappeared patterns detected.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* NEW: Why did it change? */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Why did it change?</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Mentor hypotheses based on Early vs Recent behavior.
            </div>

            {!behaviorDrivers.ok ? (
              <div style={{ marginTop: 12, ...cardInner() }}>
                <div style={{ fontWeight: 1000 }}>Not enough data</div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  {behaviorDrivers.reason}
                </div>
              </div>
            ) : (
              <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                <div style={cardInner()}>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--muted)",
                      fontWeight: 900,
                    }}
                  >
                    MENTOR NOTES
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: "grid",
                      gap: 8,
                      fontSize: 12,
                    }}
                  >
                    {(behaviorDrivers.insights ?? []).length ? (
                      behaviorDrivers.insights.map((t, i) => (
                        <div
                          key={i}
                          style={{
                            display: "flex",
                            gap: 10,
                            alignItems: "flex-start",
                          }}
                        >
                          <span
                            className="badge badge-purple"
                            style={{ height: 22 }}
                          >
                            {i + 1}
                          </span>
                          <div style={{ lineHeight: 1.5 }}>{t}</div>
                        </div>
                      ))
                    ) : (
                      <div className="p-muted">
                        No clear drivers detected yet.
                      </div>
                    )}
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
                      onClick={() => router.push("/positions")}
                    >
                      Inspect positions
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => router.push("/performance")}
                    >
                      Check performance
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* RULE SYSTEM (MVP) */}
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 1000 }}>Rule System (MVP)</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Save simple rules and track if you break them. (Local only)
            </div>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 12,
              }}
            >
              <div style={cardInner()}>
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Compliance
                </div>
                <div style={{ marginTop: 6, fontWeight: 1000, fontSize: 18 }}>
                  {ruleImpact.total
                    ? `${Math.round(
                        (ruleImpact.compliant / ruleImpact.total) * 100,
                      )}%`
                    : "—"}
                </div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  {ruleImpact.compliant} compliant · {ruleImpact.violations}{" "}
                  violations
                </div>
              </div>

              <div style={cardInner()}>
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Net PnL (compliant)
                </div>
                <div
                  className={pnlClass(ruleImpact.netCompliant)}
                  style={{ marginTop: 6, fontWeight: 1000, fontSize: 18 }}
                >
                  {fmtMoney(ruleImpact.netCompliant, DEFAULT_CCY)}
                </div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  When you follow rules
                </div>
              </div>

              <div style={cardInner()}>
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Net PnL (violations)
                </div>
                <div
                  className={pnlClass(ruleImpact.netViolations)}
                  style={{ marginTop: 6, fontWeight: 1000, fontSize: 18 }}
                >
                  {fmtMoney(ruleImpact.netViolations, DEFAULT_CCY)}
                </div>
                <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
                  When you break rules
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 12,
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn-secondary"
                disabled={!worstCombo}
                onClick={() => {
                  if (!worstCombo) return;
                  addRule({
                    id: uid("avoid"),
                    type: "AVOID_COMBO",
                    symbol: worstCombo.symbol,
                    side: worstCombo.side,
                    holdBucket: worstCombo.holdBucket,
                    createdAt: new Date().toISOString(),
                  });
                }}
              >
                Add “Avoid Leak” rule
              </button>

              <button
                className="btn-secondary"
                disabled={!timeBehavior.hoursWorst?.[0]}
                onClick={() => {
                  const w = timeBehavior.hoursWorst?.[0];
                  if (!w) return;
                  addRule({
                    id: uid("hour"),
                    type: "AVOID_HOUR_UTC",
                    hour: w.hour,
                    createdAt: new Date().toISOString(),
                  });
                }}
              >
                Add “Avoid Worst Hour” rule
              </button>

              <button
                className="btn-secondary"
                disabled={!bestCombo}
                onClick={() => {
                  if (!bestCombo) return;
                  addRule({
                    id: uid("focus"),
                    type: "FOCUS_COMBO",
                    symbol: bestCombo.symbol,
                    side: bestCombo.side,
                    holdBucket: bestCombo.holdBucket,
                    createdAt: new Date().toISOString(),
                  });
                }}
              >
                Save “Focus Best Pattern”
              </button>
            </div>

            <div style={{ marginTop: 12, ...cardInner() }}>
              <div style={{ fontWeight: 1000, marginBottom: 8 }}>
                Active rules
              </div>

              {rules.length ? (
                <div style={{ display: "grid", gap: 8 }}>
                  {rules.map((r) => (
                    <div
                      key={r.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 10,
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontSize: 12 }}>
                        {r.type === "AVOID_HOUR_UTC" ? (
                          <>
                            <span className="badge badge-red">AVOID</span>{" "}
                            <b>{String(r.hour).padStart(2, "0")}:00 UTC</b>
                          </>
                        ) : r.type === "AVOID_COMBO" ? (
                          <>
                            <span className="badge badge-red">AVOID</span>{" "}
                            <b>
                              {r.symbol} {r.side} · {r.holdBucket}
                            </b>
                          </>
                        ) : (
                          <>
                            <span className="badge badge-green">FOCUS</span>{" "}
                            <b>
                              {r.symbol} {r.side} · {r.holdBucket}
                            </b>
                          </>
                        )}
                        <div className="p-muted" style={{ marginTop: 4 }}>
                          saved {String(r.createdAt).slice(0, 10)}
                        </div>
                      </div>

                      <div
                        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                      >
                        {"symbol" in r ? (
                          <button
                            className="btn-secondary"
                            onClick={() =>
                              goPositions({
                                symbol: r.symbol,
                                side: r.side,
                                // optional: später kannst du holdBucket als query mitgeben, falls du das in /positions filterst
                              })
                            }
                          >
                            Show trades
                          </button>
                        ) : (
                          <button
                            className="btn-secondary"
                            onClick={() =>
                              goPositions({
                                hour: r.hour, // nur wenn dein /positions bereits hour filtert; sonst weglassen
                              })
                            }
                          >
                            Show trades
                          </button>
                        )}

                        <button
                          className="btn-danger"
                          onClick={() => removeRule(r.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-muted" style={{ fontSize: 12 }}>
                  No rules yet. Add one from your leak/pattern/time window.
                </div>
              )}
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
                        {(() => {
                          const z = priceZones.best[0];
                          const c = confidenceLabel(z.count);
                          return (
                            <div style={{ marginTop: 8 }}>
                              <span className={c.cls}>{c.label}</span>
                            </div>
                          );
                        })()}
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
                        {(() => {
                          const z = priceZones.worst[0];
                          const c = confidenceLabel(z.count);
                          return (
                            <div style={{ marginTop: 8 }}>
                              <span className={c.cls}>{c.label}</span>
                            </div>
                          );
                        })()}
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

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {mentorRules.length ? (
                    mentorRules.map((r, idx) => (
                      <div key={r.id} style={{ ...cardInner(), padding: 12 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: 10,
                            alignItems: "center",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            <span
                              className={
                                r.tag === "AVOID"
                                  ? "badge badge-red"
                                  : r.tag === "FOCUS"
                                    ? "badge badge-green"
                                    : "badge badge-blue"
                              }
                              style={{ height: 22 }}
                            >
                              {idx + 1}
                            </span>
                            <div style={{ fontWeight: 1000, fontSize: 12 }}>
                              {r.title}
                            </div>
                          </div>
                        </div>

                        <div
                          className="p-muted"
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            lineHeight: 1.5,
                          }}
                        >
                          {r.text}
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
                            onClick={() => goPositions(r.params)}
                          >
                            {r.cta}
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-muted" style={{ fontSize: 12 }}>
                      Not enough data yet — add more positions and I’ll generate
                      rules automatically.
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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

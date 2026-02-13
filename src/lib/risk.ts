// src/lib/risk.ts

type AnyObj = Record<string, any>;

function num(x: any, fallback = 0) {
  const n = typeof x === "number" ? x : parseFloat(String(x ?? ""));
  return Number.isFinite(n) ? n : fallback;
}

function safeDateKey(x: any) {
  // Accept already-normalized day keys like "2026-01-07"
  if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
  // Try parse date
  const d = new Date(x);
  if (!Number.isFinite(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function computeMaxDrawdown(equity: number[]) {
  let peak = -Infinity;
  let maxDD = 0; // negative number
  let maxDDPct: number | null = null;

  for (let i = 0; i < equity.length; i++) {
    const e = equity[i];
    if (e > peak) peak = e;

    const dd = e - peak; // <= 0
    if (dd < maxDD) {
      maxDD = dd;

      // pct relative to peak (only if peak != 0)
      if (peak !== 0) maxDDPct = Math.abs(dd) / Math.abs(peak);
      else maxDDPct = null;
    }
  }

  return { maxDD, maxDDPct };
}

export function computeRiskSummary(
  input: { positions: AnyObj[]; trades: AnyObj[]; byDayPositions?: AnyObj[] },
  opts?: { startEquity?: number },
) {
  const startEquity = opts?.startEquity ?? 0;

  const positions = Array.isArray(input.positions) ? input.positions : [];
  const trades = Array.isArray(input.trades) ? input.trades : [];
  const byDay = Array.isArray(input.byDayPositions) ? input.byDayPositions : [];

  // -------------------------
  // 1) Build daily equity points (BEST source = byDayPositions)
  // -------------------------
  let equityPoints: { t: string; equity: number }[] = [];

  if (byDay.length > 0) {
    // We expect each entry to have a "day" (or date) and a pnl field
    const mapped = byDay
      .map((d) => {
        const t = safeDateKey(d.day ?? d.date ?? d.t ?? d.ts ?? d.time);
        // try common fields
        const pnl =
          num(d.netPnl, NaN) ??
          num(d.pnl, NaN) ??
          num(d.totalPnl, NaN) ??
          num(d.sumPnl, NaN);
        return { t, pnl: Number.isFinite(pnl) ? pnl : 0 };
      })
      .filter((x) => !!x.t)
      .sort((a, b) => String(a.t).localeCompare(String(b.t)));

    let eq = startEquity;
    equityPoints = mapped.map((m) => {
      eq += m.pnl;
      return { t: String(m.t), equity: eq };
    });
  } else {
    // Fallback: build equity from positions sorted by close time (less ideal)
    const mapped = positions
      .map((p) => {
        const t =
          p.closeTime ??
          p.closeTimestamp ??
          p.closedAt ??
          p.exitTime ??
          p.time ??
          p.ts ??
          null;
        const key = safeDateKey(t);
        const pnl = num(p.netPnl ?? p.pnl ?? p.profit ?? p.realizedPnl ?? 0, 0);
        return { t: key, pnl };
      })
      .filter((x) => !!x.t)
      .sort((a, b) => String(a.t).localeCompare(String(b.t)));

    // aggregate by day
    const byDayAgg = new Map<string, number>();
    for (const m of mapped) {
      const k = String(m.t);
      byDayAgg.set(k, (byDayAgg.get(k) ?? 0) + m.pnl);
    }

    const keys = Array.from(byDayAgg.keys()).sort();
    let eq = startEquity;
    equityPoints = keys.map((k) => {
      eq += byDayAgg.get(k) ?? 0;
      return { t: k, equity: eq };
    });
  }

  const equityArr = equityPoints.map((p) => p.equity);
  const { maxDD, maxDDPct } = computeMaxDrawdown(equityArr);

  const lastEquity = equityArr.length
    ? equityArr[equityArr.length - 1]
    : startEquity;
  const peakEquity = equityArr.length ? Math.max(...equityArr) : startEquity;
  const currentDrawdown = lastEquity - peakEquity; // <= 0

  // -------------------------
  // 2) Win/Loss stats (from positions if possible, else trades)
  // -------------------------
  const pnlSeries =
    positions.length > 0
      ? positions.map((p) =>
          num(p.netPnl ?? p.pnl ?? p.profit ?? p.realizedPnl ?? 0, 0),
        )
      : trades.map((t) =>
          num(t.netPnl ?? t.pnl ?? t.profit ?? t.realizedPnl ?? 0, 0),
        );

  const wins = pnlSeries.filter((x) => x > 0);
  const losses = pnlSeries.filter((x) => x < 0);
  const winRate = pnlSeries.length ? wins.length / pnlSeries.length : 0;

  const avgWin = wins.length
    ? wins.reduce((a, b) => a + b, 0) / wins.length
    : 0;
  const avgLoss = losses.length
    ? losses.reduce((a, b) => a + b, 0) / losses.length
    : 0; // negative

  const winLossRatio =
    avgLoss !== 0 ? Math.abs(avgWin) / Math.abs(avgLoss) : null;

  // -------------------------
  // 3) Loss streak
  // -------------------------
  let currentLossStreak = 0;
  let maxLossStreak = 0;
  for (const x of pnlSeries) {
    if (x < 0) {
      currentLossStreak += 1;
      if (currentLossStreak > maxLossStreak) maxLossStreak = currentLossStreak;
    } else {
      currentLossStreak = 0;
    }
  }
  // recompute current streak from end
  let endStreak = 0;
  for (let i = pnlSeries.length - 1; i >= 0; i--) {
    if (pnlSeries[i] < 0) endStreak++;
    else break;
  }
  currentLossStreak = endStreak;

  const totalPnl = pnlSeries.reduce((a, b) => a + b, 0);

  // -------------------------
  // 4) Simple stability score v1 (rule-based)
  // -------------------------
  // Score starts at 100 and deducts penalties
  let stabilityScore = 100;

  // drawdown penalty (bigger DD => lower score)
  // scale: every -50 units knocks ~10 points (adjust later)
  stabilityScore -= Math.min(60, (Math.abs(maxDD) / 50) * 10);

  // loss-streak penalty
  stabilityScore -= Math.min(25, maxLossStreak * 2);

  // win/loss ratio penalty
  if (winLossRatio != null && winLossRatio < 1) {
    stabilityScore -= Math.min(20, (1 - winLossRatio) * 20);
  }

  stabilityScore = Math.max(0, Math.round(stabilityScore));

  return {
    equity: equityPoints,
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    currentDrawdown,
    winRate,
    avgWin,
    avgLoss,
    winLossRatio,
    maxLossStreak,
    currentLossStreak,
    totalPnl,
    stabilityScore,
  };
}

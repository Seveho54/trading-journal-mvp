import type { Position } from "../positions/buildPositions";

function dayKey(iso: string) {
  // YYYY-MM-DD
  return String(iso).slice(0, 10);
}

export function byDayPositions(positions: Position[]) {
  const map = new Map<
    string,
    {
      day: string;
      positions: number;
      wins: number;
      losses: number;
      winRate: number;
      totalNetProfit: number;
      totalRealizedPnl: number;
    }
  >();

  for (const p of positions) {
    const when = p.closedAt ?? p.openedAt;
    const key = dayKey(when);

    const cur = map.get(key) ?? {
      day: key,
      positions: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      totalNetProfit: 0,
      totalRealizedPnl: 0,
    };

    cur.positions += 1;
    if (p.netProfit > 0) cur.wins += 1;
    if (p.netProfit < 0) cur.losses += 1;

    cur.totalNetProfit += p.netProfit ?? 0;
    cur.totalRealizedPnl += p.realizedPnl ?? 0;

    map.set(key, cur);
  }

  const out = Array.from(map.values());
  for (const r of out) r.winRate = r.positions ? r.wins / r.positions : 0;

  out.sort((a, b) => a.day.localeCompare(b.day));
  return out;
}

function safeDayKey(x: any) {
  if (typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x)) return x;
  const d = new Date(x);
  if (!Number.isFinite(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function num(x: any, fb = 0) {
  const n = typeof x === "number" ? x : parseFloat(String(x ?? ""));
  return Number.isFinite(n) ? n : fb;
}

function getPosNet(p: any) {
  return num(
    p?.netProfit ??
      p?.totalNetProfit ??
      p?.netPnl ??
      p?.pnl ??
      p?.profit ??
      p?.realizedPnl ??
      p?.totalRealizedPnl ??
      0,
    0,
  );
}

function getPosCloseTime(p: any) {
  return (
    p?.closeTime ??
    p?.closeTimestamp ??
    p?.closedAt ??
    p?.exitTime ??
    p?.time ??
    p?.ts ??
    null
  );
}

export function buildByDayFromPositions(positions: any[]) {
  const m = new Map<
    string,
    { day: string; totalNetProfit: number; positions: number }
  >();

  for (const p of positions ?? []) {
    const day = safeDayKey(getPosCloseTime(p));
    if (!day) continue;

    const row = m.get(day) ?? { day, totalNetProfit: 0, positions: 0 };
    row.totalNetProfit += getPosNet(p);
    row.positions += 1;
    m.set(day, row);
  }

  return Array.from(m.values()).sort((a, b) => a.day.localeCompare(b.day));
}

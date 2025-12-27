"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type RawPoint = {
  date: string;   // "YYYY-MM-DD"
  pnl: number;    // daily pnl
};

type ViewMode = "EQUITY" | "DAILY";
type Bucket = "DAILY" | "WEEKLY" | "MONTHLY";

function safeNum(n: any) {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function parseDayKey(s: string) {
  // s: YYYY-MM-DD
  const [y, m, d] = s.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return new Date(0);
  return new Date(Date.UTC(y, m - 1, d));
}

function dayKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function monthKeyUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function weekKeyUTC(d: Date) {
  // ISO-ish week key: YYYY-Wxx
  // Simple: compute week number based on Thursday method
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7; // Mon=0
  date.setUTCDate(date.getUTCDate() - day + 3); // Thursday
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  const weekNo = 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function formatCurrency(n: number) {
  // nutzt dein de-DE Format, aber ohne Währungssymbol (MVP)
  // wenn du später Currency-Setting hast: style:"currency"
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

function formatCurrency2(n: number) {
  return new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function formatXLabel(dateKey: string, bucket: Bucket) {
  if (bucket === "MONTHLY") return dateKey; // YYYY-MM
  if (bucket === "WEEKLY") return dateKey;  // YYYY-Wxx
  // DAILY -> MM-DD
  return String(dateKey).slice(5);
}

function niceTicks(min: number, max: number, count = 5) {
  // Simple "nice" ticks
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return [min, max];

  const rough = span / (count - 1);
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;

  let step = pow;
  if (norm >= 5) step = 5 * pow;
  else if (norm >= 2) step = 2 * pow;
  else step = 1 * pow;

  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;

  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) ticks.push(v);
  return ticks;
}

function bucketize(raw: RawPoint[], bucket: Bucket) {
  const sorted = [...raw].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const map = new Map<string, number>();

  for (const p of sorted) {
    const d = parseDayKey(p.date);
    const key =
      bucket === "MONTHLY" ? monthKeyUTC(d) :
      bucket === "WEEKLY" ? weekKeyUTC(d) :
      dayKeyUTC(d);

    map.set(key, (map.get(key) ?? 0) + safeNum(p.pnl));
  }

  const keys = [...map.keys()].sort((a, b) => String(a).localeCompare(String(b)));
  return keys.map((k) => ({ xKey: k, pnl: map.get(k) ?? 0 }));
}

export default function EquityCurvePro({
  rawPoints,
  height = 240,
  bucket = "DAILY",
  mode = "EQUITY",
}: {
  rawPoints: RawPoint[];
  height?: number;
  bucket?: Bucket;
  mode?: ViewMode;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mouseX, setMouseX] = useState<number>(0);

  const series = useMemo(() => {
    const buckets = bucketize(rawPoints ?? [], bucket);
    let cum = 0;
    return buckets.map((p) => {
      cum += p.pnl;
      return {
        xKey: p.xKey,
        xLabel: formatXLabel(p.xKey, bucket),
        pnl: p.pnl,
        equity: cum,
      };
    });
  }, [rawPoints, bucket]);

  const values = useMemo(() => {
    if (!series.length) return [];
    return series.map((p) => (mode === "EQUITY" ? p.equity : p.pnl));
  }, [series, mode]);

  // Responsive sizing
  const [width, setWidth] = useState(900);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const w = el.clientWidth || 900;
      setWidth(w);
    });
    ro.observe(el);
    setWidth(el.clientWidth || 900);

    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = width;
    const H = height;

    const padL = 56;
    const padR = 18;
    const padT = 14;
    const padB = 34;

    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    const cs = getComputedStyle(document.documentElement);
    const border = cs.getPropertyValue("--border")?.trim() || "rgba(255,255,255,0.12)";
    const text = cs.getPropertyValue("--text")?.trim() || "#fff";
    const muted = cs.getPropertyValue("--muted")?.trim() || "rgba(255,255,255,0.6)";

    // background
    ctx.fillStyle = "rgba(255,255,255,0.02)";
    ctx.fillRect(0, 0, W, H);

    if (!series.length) {
      ctx.fillStyle = muted;
      ctx.font = "12px system-ui";
      ctx.fillText("No data", 12, 12);
      return;
    }

    let minV = Math.min(...values);
    let maxV = Math.max(...values);

    if (minV === maxV) {
      const bump = Math.abs(minV) * 0.1 + 1;
      minV -= bump;
      maxV += bump;
    }

    const ticksY = niceTicks(minV, maxV, 5);

    const xAt = (i: number) => padL + (i / Math.max(1, series.length - 1)) * plotW;
    const yAt = (v: number) => padT + (1 - (v - minV) / (maxV - minV)) * plotH;

    // grid
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55;

    for (const t of ticksY) {
      const y = yAt(t);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
    }

    ctx.globalAlpha = 1;

    // y labels
    ctx.fillStyle = muted;
    ctx.font = "12px system-ui";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    for (const t of ticksY) {
      ctx.fillText(formatCurrency(t), padL - 10, yAt(t));
    }

    // zero line
    if (minV < 0 && maxV > 0) {
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(padL, yAt(0));
      ctx.lineTo(W - padR, yAt(0));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // x labels: first / mid / last
    const xLabelIdxs =
      series.length < 6
        ? [0, series.length - 1]
        : [0, Math.floor((series.length - 1) / 2), series.length - 1];

    ctx.fillStyle = muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const i of xLabelIdxs) {
      const x = xAt(i);
      ctx.fillText(series[i].xLabel, x, H - padB + 8);
    }

    // draw series
    const lastV = values[values.length - 1] ?? 0;
    const good = lastV >= 0;
    const lineColor = good ? "rgba(54,211,153,0.95)" : "rgba(251,113,133,0.95)";
    const barPos = "rgba(54,211,153,0.50)";
    const barNeg = "rgba(251,113,133,0.50)";

    if (mode === "EQUITY") {
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = 2;

      ctx.beginPath();
      values.forEach((v, i) => {
        const x = xAt(i);
        const y = yAt(v);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      // end dot
      const endX = xAt(values.length - 1);
      const endY = yAt(values[values.length - 1]);
      ctx.fillStyle = lineColor;
      ctx.beginPath();
      ctx.arc(endX, endY, 3.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // DAILY bars around zero
      const zeroY = yAt(0);
      const barW = Math.max(2, plotW / Math.max(1, values.length) * 0.75);

      values.forEach((v, i) => {
        const x = xAt(i);
        const y = yAt(v);
        const left = x - barW / 2;

        ctx.fillStyle = v >= 0 ? barPos : barNeg;

        if (v >= 0) {
          ctx.fillRect(left, y, barW, zeroY - y);
        } else {
          ctx.fillRect(left, zeroY, barW, y - zeroY);
        }
      });
    }

    // hover crosshair + dot
    if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx < series.length) {
      const x = xAt(hoverIdx);
      const v = values[hoverIdx];
      const y = yAt(v);

      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padT);
      ctx.lineTo(x, H - padB);
      ctx.stroke();

      if (mode === "EQUITY") {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // title
    ctx.fillStyle = text;
    ctx.font = "12px system-ui";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.globalAlpha = 0.9;
    ctx.fillText(
      mode === "EQUITY" ? "Equity Curve (Cumulative Net PnL)" : "Daily Net PnL",
      12,
      10
    );
    ctx.globalAlpha = 1;
  }, [series, values, width, height, hoverIdx, mode]);

  const tooltip = useMemo(() => {
    if (hoverIdx === null || !series.length) return null;
    const p = series[hoverIdx];
    const value = mode === "EQUITY" ? p.equity : p.pnl;
    return {
      title: p.xKey,
      value,
      daily: p.pnl,
    };
  }, [hoverIdx, series, mode]);

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!series.length) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setMouseX(x);

    // map x->idx
    const padL = 56;
    const padR = 18;
    const plotW = rect.width - padL - padR;
    const rel = Math.max(0, Math.min(1, (x - padL) / Math.max(1, plotW)));
    const idx = Math.round(rel * (series.length - 1));
    setHoverIdx(idx);
  }

  function onLeave() {
    setHoverIdx(null);
  }

  return (
    <div
      ref={wrapRef}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      style={{ position: "relative", width: "100%" }}
    >
      <canvas ref={canvasRef} />

      {tooltip ? (
        <div
          style={{
            position: "absolute",
            top: 10,
            left: Math.min(Math.max(12, mouseX + 12), width - 220),
            width: 208,
            pointerEvents: "none",
            padding: 10,
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "rgba(10,10,10,0.75)",
            backdropFilter: "blur(6px)",
            color: "var(--text)",
            fontSize: 12,
          }}
        >
          <div style={{ fontWeight: 900 }}>{tooltip.title}</div>
          <div style={{ marginTop: 6, color: "var(--muted)" }}>
            {mode === "EQUITY" ? "Equity:" : "PnL:"}{" "}
            <b style={{ color: "var(--text)" }}>{formatCurrency2(tooltip.value)}</b>
          </div>
          <div style={{ marginTop: 4, color: "var(--muted)" }}>
            Daily: <b style={{ color: "var(--text)" }}>{formatCurrency2(tooltip.daily)}</b>
          </div>
        </div>
      ) : null}
    </div>
  );
}

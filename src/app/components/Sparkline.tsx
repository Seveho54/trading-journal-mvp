"use client";

import React, { useMemo } from "react";

type Props = {
  values: number[];
  labels?: string[];
  height?: number;
};

export function Sparkline({ values, labels = [], height = 120 }: Props) {
  const w = 600; // internal width (scaled by viewBox)
  const h = Math.max(60, height);
  const padX = 14;
  const padY = 14;

  const safe = useMemo(() => (values ?? []).map((v) => Number(v ?? 0)), [values]);

  const { path, area, lastX, lastY, min, max } = useMemo(() => {
    if (!safe.length) {
      return { path: "", area: "", lastX: 0, lastY: 0, min: 0, max: 1 };
    }

    const minV = Math.min(...safe);
    const maxV = Math.max(...safe);
    const range = Math.max(1e-9, maxV - minV);

    const xStep = (w - padX * 2) / Math.max(1, safe.length - 1);

    const pts = safe.map((v, i) => {
      const x = padX + i * xStep;
      // invert y
      const y = padY + (h - padY * 2) * (1 - (v - minV) / range);
      return { x, y, v };
    });

    const d = pts
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(" ");

    const areaD =
      `M ${pts[0].x} ${h - padY} ` +
      pts.map((p) => `L ${p.x} ${p.y}`).join(" ") +
      ` L ${pts[pts.length - 1].x} ${h - padY} Z`;

    const last = pts[pts.length - 1];

    return { path: d, area: areaD, lastX: last.x, lastY: last.y, min: minV, max: maxV };
  }, [safe, h]);

  if (!safe.length) return <div className="p-muted">–</div>;

  const lastVal = safe[safe.length - 1];
  const isUp = safe.length >= 2 ? lastVal >= safe[0] : true;

  return (
    <div
      style={{
        width: "100%",
        height: h,
        borderRadius: 12,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.02)",
        padding: 8,
      }}
      title={`min: ${min.toFixed(2)} • max: ${max.toFixed(2)} • last: ${lastVal.toFixed(2)}`}
    >
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height="100%" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={isUp ? "rgba(54,211,153,0.30)" : "rgba(251,113,133,0.30)"} />
            <stop offset="100%" stopColor="rgba(255,255,255,0.00)" />
          </linearGradient>
        </defs>

        {/* subtle baseline */}
        <line
          x1={padX}
          x2={w - padX}
          y1={h - padY}
          y2={h - padY}
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />

        {/* area */}
        <path d={area} fill="url(#sparkFill)" stroke="none" />

        {/* line */}
        <path
          d={path}
          fill="none"
          stroke={isUp ? "rgba(54,211,153,0.95)" : "rgba(251,113,133,0.95)"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* last point */}
        <circle cx={lastX} cy={lastY} r="4" fill="rgba(255,255,255,0.95)" />
        <circle cx={lastX} cy={lastY} r="7" fill="none" stroke="rgba(255,255,255,0.18)" />
      </svg>
    </div>
  );
}

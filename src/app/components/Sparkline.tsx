"use client";

import { useMemo, useState } from "react";

export function Sparkline({
  values,
  labels,
  width = 900,
  height = 160,
}: {
  values: number[];
  labels?: string[];
  width?: number;
  height?: number;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { min, max, pad, innerW, innerH } = useMemo(() => {
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 0;
    const pad = 10;
    const innerW = width - pad * 2;
    const innerH = height - pad * 2;
    return { min, max, pad, innerW, innerH };
  }, [values, width, height]);

  const scaleX = (i: number) => (values.length === 1 ? pad : pad + (i / (values.length - 1)) * innerW);
  const scaleY = (v: number) => {
    if (max === min) return pad + innerH / 2;
    const t = (v - min) / (max - min);
    return pad + (1 - t) * innerH;
  };

  const d = values
    .map((v, i) => `${i === 0 ? "M" : "L"} ${scaleX(i).toFixed(2)} ${scaleY(v).toFixed(2)}`)
    .join(" ");

  const fmt = (n: number) =>
    new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);

  const hi = hoverIndex ?? null;
  const hx = hi !== null ? scaleX(hi) : null;
  const hy = hi !== null ? scaleY(values[hi]) : null;

  function onMove(evt: React.MouseEvent<SVGSVGElement>) {
    const rect = (evt.currentTarget as any).getBoundingClientRect();
    const x = evt.clientX - rect.left;

    // x -> index
    const t = Math.min(1, Math.max(0, (x - pad) / innerW));
    const idx = Math.round(t * (values.length - 1));
    setHoverIndex(idx);
  }

  function onLeave() {
    setHoverIndex(null);
  }

  if (!values.length) return null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        width="100%"
        viewBox={`0 0 ${width} ${height}`}
        style={{ border: "1px solid #ddd", borderRadius: 8 }}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <path d={d} fill="none" stroke="black" strokeWidth="2" />

        {/* baseline at 0 if visible */}
        {min < 0 && max > 0 && (
          <line x1={pad} x2={width - pad} y1={scaleY(0)} y2={scaleY(0)} stroke="#bbb" strokeWidth="1" />
        )}

        {/* Hover indicator */}
        {hi !== null && hx !== null && hy !== null && (
          <>
            <line x1={hx} x2={hx} y1={pad} y2={height - pad} stroke="#ddd" strokeWidth="1" />
            <circle cx={hx} cy={hy} r="4" fill="black" />
          </>
        )}
      </svg>

      {/* Tooltip */}
      {hi !== null && (
        <div
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: "8px 10px",
            background: "white",
            fontFamily: "system-ui",
            fontSize: 12,
          }}
        >
          <div style={{ opacity: 0.7 }}>Hover</div>
          <div>
            <b>{labels?.[hi] ?? `#${hi + 1}`}</b>
          </div>
          <div>Equity: <b>{fmt(values[hi])}</b></div>
        </div>
      )}
    </div>
  );
}

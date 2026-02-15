function fmtMoney2(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}
function fmtPct1(x: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(x);
}

function fmtDays(n: number | null | undefined) {
  if (n == null) return "—";
  return `${n} day${n === 1 ? "" : "s"}`;
}

function fmtPct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

function fmtMoneyLike(x: number, ccy?: string) {
  const sign = x > 0 ? "+" : "";
  const v = `${sign}${x.toFixed(2)}`;
  return ccy ? `${v} ${ccy}` : v;
}

function fmtPctOrDash(x: number | null | undefined) {
  if (x == null || !Number.isFinite(x)) return "—";
  return fmtPct(x);
}

function MiniEquityChart({
  points,
}: {
  points: { t: string; equity: number }[];
}) {
  // tiny svg chart (no deps)
  const w = 520;
  const h = 120;
  const pad = 10;

  const data = points.slice(-120); // last N points
  if (data.length < 2) return null;

  const ys = data.map((p) => p.equity);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const range = maxY - minY || 1;

  const toX = (i: number) => pad + (i * (w - pad * 2)) / (data.length - 1);
  const toY = (y: number) => h - pad - ((y - minY) * (h - pad * 2)) / range;

  let d = "";
  data.forEach((p, i) => {
    const x = toX(i);
    const y = toY(p.equity);
    d += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });

  const last = data[data.length - 1]?.equity ?? 0;
  const first = data[0]?.equity ?? 0;
  const up = last >= first;

  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ fontWeight: 1000 }}>Equity (daily)</div>
        <div className="p-muted" style={{ fontSize: 12 }}>
          {up ? "↗ trend up" : "↘ trend down"} • last {data.length} days
        </div>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        style={{ marginTop: 10, display: "block" }}
      >
        <path
          d={d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity={0.95}
        />
        {/* baseline */}
        <line
          x1={pad}
          x2={w - pad}
          y1={toY(first)}
          y2={toY(first)}
          stroke="currentColor"
          opacity={0.08}
        />
      </svg>

      <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
        min <b>{minY.toFixed(2)}</b> • max <b>{maxY.toFixed(2)}</b>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
}: {
  title: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div
        className="p-muted"
        style={{ fontSize: 12, fontWeight: 900, opacity: 0.9 }}
      >
        {title}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 22,
          fontWeight: 1000,
          letterSpacing: 0.2,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  right,
  subtitle,
  children,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{ padding: 16, borderRadius: 16, marginTop: 12 }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 1000 }}>{title}</div>
        {right ? <div>{right}</div> : null}
      </div>

      {subtitle ? (
        <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
          {subtitle}
        </div>
      ) : null}

      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );
}

function Disclosure({
  title,
  subtitle,
  right,
  defaultOpen = false,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="card tv-disclosure"
      style={{
        padding: 0,
        borderRadius: 16,
        marginTop: 12,
        overflow: "hidden",
      }}
    >
      <summary
        className="tv-disclosure-summary"
        style={{
          listStyle: "none",
          cursor: "pointer",
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          userSelect: "none",
        }}
      >
        {/* Left */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 1000, lineHeight: 1.1 }}>{title}</div>
          {subtitle ? (
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              {subtitle}
            </div>
          ) : null}
        </div>

        {/* Right */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          {right ? <div>{right}</div> : null}

          {/* Chevron */}
          <span
            className="tv-chevron"
            aria-hidden
            style={{
              width: 28,
              height: 28,
              borderRadius: 10,
              display: "grid",
              placeItems: "center",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(255,255,255,0.03)",
              fontSize: 12,
              lineHeight: 1,
            }}
            title="Open / close"
          >
            ▼
          </span>
        </div>
      </summary>

      {/* Divider line under summary */}
      <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }} />

      {/* Content */}
      <div style={{ padding: 16 }}>{children}</div>
    </details>
  );
}

function scoreTone(score: number) {
  if (score >= 75) return "GOOD";
  if (score >= 50) return "OK";
  return "BAD";
}

function ScoreBadge({ score }: { score: number }) {
  const tone = scoreTone(score);

  const style: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 999,
    fontWeight: 1000,
    fontSize: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      tone === "GOOD"
        ? "rgba(54,211,153,0.14)"
        : tone === "OK"
          ? "rgba(250,204,21,0.14)"
          : "rgba(251,113,133,0.14)",
  };

  const dotStyle: React.CSSProperties = {
    width: 8,
    height: 8,
    borderRadius: 999,
    background:
      tone === "GOOD"
        ? "rgba(54,211,153,0.95)"
        : tone === "OK"
          ? "rgba(250,204,21,0.95)"
          : "rgba(251,113,133,0.95)",
    boxShadow: "0 0 0 3px rgba(255,255,255,0.06)",
  };

  const label =
    tone === "GOOD" ? "Healthy" : tone === "OK" ? "Needs work" : "High risk";

  return (
    <span
      style={style}
      title="Rule-based score v1 (drawdown, streaks, win/loss)"
    >
      <span style={dotStyle} />
      <span>Stability Score:</span>
      <span style={{ fontSize: 13 }}>{score}/100</span>
      <span style={{ opacity: 0.8 }}>· {label}</span>
    </span>
  );
}

function sevPill(sev: "LOW" | "MED" | "HIGH") {
  const bg =
    sev === "HIGH"
      ? "rgba(251,113,133,0.14)"
      : sev === "MED"
        ? "rgba(250,204,21,0.14)"
        : "rgba(54,211,153,0.14)";
  const border =
    sev === "HIGH"
      ? "rgba(251,113,133,0.28)"
      : sev === "MED"
        ? "rgba(250,204,21,0.28)"
        : "rgba(54,211,153,0.28)";

  return (
    <span
      style={{
        display: "inline-flex",
        padding: "6px 10px",
        borderRadius: 999,
        fontWeight: 1000,
        fontSize: 11,
        border: `1px solid ${border}`,
        background: bg,
        whiteSpace: "nowrap",
      }}
    >
      {sev}
    </span>
  );
}

function pnlClass(n: number) {
  return n > 0 ? "pnl-positive" : n < 0 ? "pnl-negative" : "pnl-zero";
}

function MiniDrawdownChart({
  points,
}: {
  points: { t: string; equity: number }[];
}) {
  const w = 520;
  const h = 120;
  const pad = 10;

  const data = points.slice(-120);
  if (data.length < 2) return null;

  // build drawdown series (negative or 0)
  let peak = -Infinity;
  const dd = data.map((p) => {
    if (p.equity > peak) peak = p.equity;
    return p.equity - peak; // <= 0
  });

  const minY = Math.min(...dd); // most negative
  const maxY = 0; // always baseline at 0
  const range = maxY - minY || 1;

  const toX = (i: number) => pad + (i * (w - pad * 2)) / (data.length - 1);
  const toY = (y: number) => h - pad - ((y - minY) * (h - pad * 2)) / range;

  let path = "";
  dd.forEach((v, i) => {
    const x = toX(i);
    const y = toY(v);
    path += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  });

  const worst = minY; // negative
  const last = dd[dd.length - 1] ?? 0;

  return (
    <div
      className="card"
      style={{
        padding: 14,
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontWeight: 1000 }}>Drawdown (daily)</div>
        <div className="p-muted" style={{ fontSize: 12 }}>
          worst {worst.toFixed(2)} • current {last.toFixed(2)}
        </div>
      </div>

      <svg
        width="100%"
        viewBox={`0 0 ${w} ${h}`}
        style={{ marginTop: 10, display: "block" }}
      >
        {/* 0 baseline */}
        <line
          x1={pad}
          x2={w - pad}
          y1={toY(0)}
          y2={toY(0)}
          stroke="currentColor"
          opacity={0.12}
        />

        {/* area fill (subtle) */}
        <path
          d={`${path} L ${toX(dd.length - 1)} ${toY(0)} L ${toX(0)} ${toY(0)} Z`}
          fill="currentColor"
          opacity={0.06}
        />

        {/* dd line */}
        <path
          d={path}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity={0.95}
        />
      </svg>

      <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
        Drawdown is ≤ 0. Closer to 0 = healthier.
      </div>
    </div>
  );
}

export {
  StatCard,
  Section,
  Disclosure,
  ScoreBadge,
  scoreTone,
  sevPill,
  pnlClass,
  fmtDays,
  fmtPct,
  fmtPctOrDash,
  fmtMoneyLike,
  MiniEquityChart,
  MiniDrawdownChart,
};

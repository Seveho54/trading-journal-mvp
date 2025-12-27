"use client";

import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";

function FeatureRow({
  children,
  kind = "ok",
}: {
  children: React.ReactNode;
  kind?: "ok" | "pro";
}) {
  const icon =
    kind === "pro" ? (
      <span className="badge badge-blue" style={{ fontSize: 11, padding: "2px 8px" }}>
        PRO
      </span>
    ) : (
      <span className="badge badge-green" style={{ fontSize: 11, padding: "2px 8px" }}>
        ✓
      </span>
    );

  return (
    <li style={{ display: "flex", gap: 10, alignItems: "flex-start", lineHeight: 1.6 }}>
      <span style={{ marginTop: 2 }}>{icon}</span>
      <span style={{ color: "var(--text)" }}>{children}</span>
    </li>
  );
}

export default function PricingPage() {
  const router = useRouter();
  const { isPro, setIsPro } = useTradeSession();

  return (
    <main style={{ maxWidth: 980, margin: "40px auto", padding: 16, fontFamily: "system-ui" }}>
      {/* Header */}
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <div className="h1" style={{ marginBottom: 6 }}>
              Pricing
            </div>
            <p className="p-muted" style={{ margin: 0 }}>
              MVP “Fake Door” – wir testen, ob Trader für Pro zahlen würden. Noch ohne Payment/Account.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <span className="badge">
              Current: <b style={{ color: "var(--text)" }}>{isPro ? "PRO" : "FREE"}</b>
            </span>
            <button className="btn-secondary" onClick={() => router.push("/dashboard")}>
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>

      {/* Plans */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* FREE */}
        <div className="card" style={{ padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>FREE</div>
            {!isPro ? <span className="badge">Current</span> : <span className="badge badge-blue">Downgrade</span>}
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.02 }}>€0</div>
            <div className="p-muted" style={{ marginTop: 2 }}>
              forever
            </div>
          </div>

          <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 900, letterSpacing: 0.08, textTransform: "uppercase" }}>
              Included
            </div>

            <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: "none", display: "grid", gap: 8 }}>
              <FeatureRow>CSV Upload (Session)</FeatureRow>
              <FeatureRow>Dashboard / Calendar / Positions / Trade Log</FeatureRow>
              <FeatureRow>
                Exports are limited (Preview only) <span style={{ color: "var(--muted)" }}>— capped rows in Free</span>
              </FeatureRow>
              <FeatureRow kind="pro">
                Pro-only actions: <b>Export CSV</b>, <b>Copy raw JSON</b>
              </FeatureRow>
            </ul>
          </div>

          <div style={{ marginTop: 16 }}>
            {isPro ? (
              <button
                className="btn-secondary"
                onClick={() => {
                  setIsPro(false);
                  router.push("/dashboard");
                }}
              >
                Switch to FREE
              </button>
            ) : (
              <button className="btn-secondary" disabled>
                Current Plan
              </button>
            )}
          </div>

          <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
            Best for: testing & quick review.
          </div>
        </div>

        {/* PRO */}
        <div
          className="card"
          style={{
            padding: 18,
            border: "1px solid rgba(54,211,153,0.40)",
            boxShadow: "0 18px 55px rgba(0,0,0,0.35)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>PRO</div>
              <span className="badge badge-green">Recommended</span>
            </div>
            {isPro ? <span className="badge badge-green">Unlocked</span> : <span className="badge badge-blue">Upgrade</span>}
          </div>

          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: -0.02 }}>€14,90</div>
            <div className="p-muted" style={{ marginTop: 2 }}>
              per month <span style={{ color: "var(--muted)" }}>· MVP price test</span>
            </div>
          </div>

          <div style={{ marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 900, letterSpacing: 0.08, textTransform: "uppercase" }}>
              Everything in Free, plus
            </div>

            <ul style={{ marginTop: 10, paddingLeft: 0, listStyle: "none", display: "grid", gap: 8 }}>
              <FeatureRow>Unlimited exports (all positions + filters)</FeatureRow>
              <FeatureRow>Copy raw JSON (positions / trades)</FeatureRow>
              <FeatureRow>Advanced KPIs (Profit Factor, Drawdown, Equity Curve)</FeatureRow>
              <FeatureRow>
                Better workflows: drill-down by <b>symbol</b> / <b>day</b> / <b>position id</b>
              </FeatureRow>
              <FeatureRow kind="pro">
                Coming soon: Tags, Notes, multiple sessions, goals & risk metrics
              </FeatureRow>
            </ul>
          </div>

          <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {isPro ? (
              <button className="btn-secondary" disabled>
                Unlocked
              </button>
            ) : (
              <button
                className="btn-primary"
                onClick={() => {
                  // Fake-door unlock (later Stripe + Login)
                  setIsPro(true);
                  router.push("/dashboard");
                }}
              >
                Unlock PRO (Fake)
              </button>
            )}

            <button className="btn-secondary" onClick={() => router.push("/positions")}>
              View Positions
            </button>
          </div>

          <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
            Hinweis: Fake Door. Später ersetzen wir das durch Stripe + Login. (Du kannst PRO aktuell jederzeit togglen.)
          </div>
        </div>
      </div>

      {/* Footer note */}
      <div className="card" style={{ padding: 14, marginTop: 14 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <span className="badge badge-blue">MVP Note</span>
          <div className="p-muted" style={{ flex: 1 }}>
            Pro ist im MVP hauptsächlich für <b>Exports</b> & <b>Detail-Actions</b> gedacht. Das ist der schnellste Weg,
            Zahlungsbereitschaft zu testen.
          </div>

          <button className="btn-secondary" onClick={() => router.push("/upload")}>
            Upload another file
          </button>
        </div>
      </div>
    </main>
  );
}

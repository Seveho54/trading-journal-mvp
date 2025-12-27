"use client";

import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";

export default function PricingPage() {
  const router = useRouter();
  const { isPro, setIsPro } = useTradeSession();

  return (
    <main style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div className="h1">Pricing</div>
        <p className="p-muted">
          Ziel: schnell testen, ob Trader für Pro zahlen würden. (Noch ohne Payment)
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {/* FREE */}
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>FREE</div>
          <div className="p-muted" style={{ marginTop: 6 }}>€0 / Monat</div>

          <ul style={{ marginTop: 12, lineHeight: 1.9 }}>
            <li>CSV Upload (Session)</li>
            <li>Dashboard / Calendar / Positions</li>
            <li><b>Export: max 50 Positionen</b></li>
          </ul>

          <div style={{ marginTop: 14 }}>
            {isPro ? (
              <button onClick={() => setIsPro(false)}>Switch to FREE</button>
            ) : (
              <button disabled>Current Plan</button>
            )}
          </div>
        </div>

        {/* PRO */}
        <div className="card" style={{ padding: 16, border: "1px solid rgba(54,211,153,0.5)" }}>
          <div style={{ fontWeight: 900, fontSize: 18 }}>PRO</div>
          <div className="p-muted" style={{ marginTop: 6 }}>
            <b>€14,90 / Monat</b> (MVP Preisvorschlag)
          </div>

          <ul style={{ marginTop: 12, lineHeight: 1.9 }}>
            <li><b>Unlimited Export</b> (All Positions / Filter)</li>
            <li>Advanced KPIs (Profit Factor, Drawdown, etc.)</li>
            <li>Priority Features (soon): Tags, Sessions, Notes</li>
          </ul>

          <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {isPro ? (
              <button disabled>Unlocked</button>
            ) : (
              <button
                className="btn-primary"
                onClick={() => {
                  // Fake-door unlock (später Stripe)
                  setIsPro(true);
                  router.push("/positions");
                }}
              >
                Unlock PRO (Fake)
              </button>
            )}

            <button onClick={() => router.push("/dashboard")}>Back</button>
          </div>

          <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
            Hinweis: Das ist aktuell ein MVP “Fake Door”. Später ersetzen wir das durch Stripe + Login.
          </div>
        </div>
      </div>
    </main>
  );
}

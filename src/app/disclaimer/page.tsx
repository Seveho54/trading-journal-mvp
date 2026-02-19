// src/app/disclaimer/page.tsx
"use client";

import React from "react";
import { useRouter } from "next/navigation";

function cardInner(): React.CSSProperties {
  return {
    border: "1px solid var(--border)",
    borderRadius: 14,
    padding: 14,
    background: "rgba(255,255,255,0.02)",
  };
}

export default function DisclaimerPage() {
  const router = useRouter();

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
      <div className="card" style={{ padding: 16 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div>
            <div style={{ fontWeight: 1000, fontSize: 18 }}>
              Financial Disclaimer
            </div>
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Educational analytics only — no investment advice.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn-secondary" onClick={() => router.push("/")}>
              Home
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/mentor")}
            >
              Mentor
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/upload")}
            >
              Upload
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={cardInner()}>
          <div style={{ fontWeight: 1000, fontSize: 14, marginBottom: 10 }}>
            Important Notice
          </div>

          <div className="p-muted" style={{ fontSize: 12, lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>
              Tradevion is an educational analytics and behavioral risk analysis
              platform.
            </p>

            <p>
              Tradevion does not provide investment advice, trading advice,
              financial advice, or any form of asset management services.
            </p>

            <p>
              All information, analytics, statistics, pattern detection, risk
              scores, and insights provided by Tradevion are for educational and
              informational purposes only.
            </p>

            <p
              style={{ marginBottom: 8, fontWeight: 900, color: "var(--text)" }}
            >
              Nothing on this platform constitutes:
            </p>
            <ul style={{ marginTop: 0, paddingLeft: 18 }}>
              <li>Investment advice</li>
              <li>Financial advice</li>
              <li>Trading signals</li>
              <li>Recommendations to buy or sell any financial instrument</li>
            </ul>

            <p>
              Users are solely responsible for their trading decisions and
              capital management.
            </p>

            <p>
              Trading cryptocurrencies, derivatives, and leveraged instruments
              involves substantial risk and may result in the loss of capital.
            </p>

            <p>
              Tradevion does not guarantee accuracy, completeness, or future
              performance. Past performance does not guarantee future results.
            </p>

            <p style={{ marginBottom: 0 }}>
              By using Tradevion, you agree that you are responsible for your
              own decisions and that Tradevion is not liable for financial
              losses, indirect damages, or data inaccuracies.
            </p>
          </div>
        </div>

        <div className="p-muted" style={{ marginTop: 10, fontSize: 12 }}>
          Last updated: {new Date().toISOString().slice(0, 10)}
        </div>
      </div>
    </main>
  );
}

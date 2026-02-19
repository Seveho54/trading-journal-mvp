// src/app/privacy/page.tsx
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

export default function PrivacyPage() {
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
            <div style={{ fontWeight: 1000, fontSize: 18 }}>Privacy Policy</div>
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              How Tradevion handles data.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn-secondary" onClick={() => router.push("/")}>
              Home
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/terms")}
            >
              Terms
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={cardInner()}>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <h3>1. Overview</h3>
            <p>
              Tradevion is an educational trading analytics platform. This
              Privacy Policy explains how we collect, process, and protect data.
            </p>

            <h3>2. Data We Process</h3>
            <p>We may process the following types of data:</p>
            <ul>
              <li>Uploaded trading history files (CSV)</li>
              <li>Position and trade analytics derived from uploaded data</li>
              <li>
                Technical usage data (browser type, device info, IP address)
              </li>
              <li>Performance metrics for system improvement</li>
            </ul>

            <h3>3. Purpose of Processing</h3>
            <p>Data is processed exclusively to:</p>
            <ul>
              <li>Provide analytics and behavioral insights</li>
              <li>Compute risk metrics and performance statistics</li>
              <li>Improve system reliability and performance</li>
            </ul>
            <p>Tradevion does not sell user data.</p>

            <h3>4. Storage</h3>
            <p>
              Uploaded data may be temporarily stored in memory or server
              infrastructure for processing purposes.
            </p>
            <p>
              No sensitive financial credentials (such as exchange passwords or
              API trading keys) are required for core functionality.
            </p>

            <h3>5. Third-Party Data Sources</h3>
            <p>
              Tradevion may fetch public market data from third-party providers
              (e.g., exchange APIs such as Binance).
            </p>
            <p>
              These providers may process technical request metadata (such as IP
              address).
            </p>

            <h3>6. Cookies</h3>
            <p>
              Tradevion may use essential cookies required for system operation.
            </p>
            <p>
              No tracking or advertising cookies are intentionally deployed at
              this stage.
            </p>

            <h3>7. Security</h3>
            <p>
              We implement reasonable technical measures to protect data.
              However, no online system can guarantee absolute security.
            </p>

            <h3>8. User Rights</h3>
            <p>
              Users may request deletion of stored data (if persistent storage
              is implemented in the future).
            </p>

            <h3>9. Changes</h3>
            <p>This Privacy Policy may be updated as the platform evolves.</p>

            <h3>10. Contact</h3>
            <p>For privacy-related inquiries, contact:</p>
            <p>
              <b>support@tradevion.com</b> (replace with your actual email)
            </p>

            <p style={{ marginTop: 20, fontWeight: 900 }}>
              By using Tradevion, you acknowledge that you understand this
              Privacy Policy.
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

// src/app/terms/page.tsx
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

export default function TermsPage() {
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
              Terms of Service
            </div>
            <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
              Educational analytics platform – no financial advisory services.
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="btn-secondary" onClick={() => router.push("/")}>
              Home
            </button>
            <button
              className="btn-secondary"
              onClick={() => router.push("/disclaimer")}
            >
              Disclaimer
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={cardInner()}>
          <div style={{ fontSize: 12, lineHeight: 1.6 }}>
            <h3>1. Overview</h3>
            <p>
              Tradevion is an educational analytics and behavioral risk analysis
              software platform designed to help traders analyze historical
              trading activity.
            </p>
            <p>
              By accessing or using Tradevion, you agree to these Terms of
              Service.
            </p>

            <h3>2. No Investment Advice</h3>
            <p>
              Tradevion does not provide investment advice, trading advice,
              financial advisory services, or portfolio management.
            </p>
            <p>
              All analytics, insights, pattern detection, risk scoring,
              performance breakdowns, and behavioral feedback are for
              educational and informational purposes only.
            </p>
            <p>
              Nothing on this platform constitutes a recommendation to buy,
              sell, hold, or trade any financial instrument.
            </p>

            <h3>3. User Responsibility</h3>
            <p>
              You are solely responsible for your trading decisions, capital
              allocation, and risk management.
            </p>
            <p>
              Trading cryptocurrencies, derivatives, futures, and leveraged
              instruments involves significant financial risk and may result in
              total loss of capital.
            </p>

            <h3>4. Data & Accuracy</h3>
            <p>
              Tradevion processes trading data uploaded by users and may fetch
              public market data from third-party sources.
            </p>
            <p>
              We do not guarantee the accuracy, completeness, reliability, or
              timeliness of any data displayed on the platform.
            </p>
            <p>
              Past performance and historical analytics do not guarantee future
              results.
            </p>

            <h3>5. Limitation of Liability</h3>
            <p>
              To the maximum extent permitted by law, Tradevion shall not be
              liable for:
            </p>
            <ul>
              <li>Financial losses</li>
              <li>Indirect or consequential damages</li>
              <li>Loss of profits</li>
              <li>Trading losses of any kind</li>
              <li>Data inaccuracies</li>
            </ul>
            <p>Use of this platform is entirely at your own risk.</p>

            <h3>6. Platform Availability</h3>
            <p>
              We do not guarantee uninterrupted access, error-free operation, or
              continuous availability of the platform.
            </p>
            <p>Features may change, be removed, or updated at any time.</p>

            <h3>7. Intellectual Property</h3>
            <p>
              All content, software logic, analytics models, and visual elements
              of Tradevion are protected intellectual property.
            </p>
            <p>
              You may not copy, resell, reverse engineer, or distribute
              Tradevion’s software or analytics without written permission.
            </p>

            <h3>8. Account & Access (Future)</h3>
            <p>
              If accounts are implemented in the future, users will be
              responsible for maintaining the confidentiality of their login
              credentials.
            </p>

            <h3>9. Modifications</h3>
            <p>
              These Terms may be updated at any time. Continued use of the
              platform constitutes acceptance of updated Terms.
            </p>

            <h3>10. Governing Law</h3>
            <p>
              These Terms shall be governed by applicable law in the
              jurisdiction where the operator of Tradevion resides.
            </p>

            <p style={{ marginTop: 20, fontWeight: 900 }}>
              By using Tradevion, you acknowledge that you understand and agree
              to these Terms.
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

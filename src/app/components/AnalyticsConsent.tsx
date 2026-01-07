"use client";

import { useEffect, useState } from "react";

function setGaConsent(granted: boolean) {
  if (typeof window === "undefined") return;

  // optional: Google Consent Mode (wenn GA via gtag geladen ist)
  if (typeof (window as any).gtag === "function") {
    (window as any).gtag("consent", "update", {
      analytics_storage: granted ? "granted" : "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }
}

export function AnalyticsConsent() {
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // check saved choice
    const v = localStorage.getItem("tv_consent_analytics"); // "yes" | "no" | null
    if (v === "yes") {
      setGaConsent(true);
      setShow(false);
    } else if (v === "no") {
      setGaConsent(false);
      setShow(false);
    } else {
      setShow(true); // no choice yet -> show banner
    }
    setReady(true);
  }, []);

  if (!ready || !show) return null;

  return (
    <div
      style={{
        position: "fixed",
        left: 12,
        right: 12,
        bottom: 12,
        zIndex: 9999,
        border: "1px solid var(--border)",
        borderRadius: 14,
        background: "rgba(10,10,10,0.85)",
        backdropFilter: "blur(8px)",
        padding: 12,
        color: "var(--text)",
        maxWidth: 980,
        margin: "0 auto",
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 6 }}>Analytics</div>
      <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.35 }}>
        We use analytics to understand where visitors come from and which pages
        are used. You can accept or reject.
      </div>

      <div
        style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}
      >
        <button
          className="btn-primary"
          onClick={() => {
            localStorage.setItem("tv_consent_analytics", "yes");
            setGaConsent(true);
            setShow(false);
          }}
        >
          Accept
        </button>

        <button
          className="btn-secondary"
          onClick={() => {
            localStorage.setItem("tv_consent_analytics", "no");
            setGaConsent(false);
            setShow(false);
          }}
        >
          Reject
        </button>

        <button
          className="btn-secondary"
          onClick={() => {
            // optional: open a simple privacy page later
            window.open("/privacy", "_blank");
          }}
          style={{ marginLeft: "auto" }}
        >
          Privacy
        </button>
      </div>
    </div>
  );
}

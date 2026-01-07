"use client";

import { useState } from "react";

export default function GateOverlay({
  title,
  subtitle,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  onSubmit: (email: string) => void;
}) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState<string | null>(null);

  function submit() {
    const email = value.trim().toLowerCase();

    // super simple validation
    if (!email || !email.includes("@") || !email.includes(".")) {
      setErr("Please enter a valid email.");
      return;
    }

    setErr(null);
    onSubmit(email);
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(6px)",
        display: "grid",
        placeItems: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 18,
          background: "rgba(10,10,10,0.85)",
          color: "var(--text)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
        {subtitle ? (
          <div style={{ marginTop: 6, opacity: 0.8 }}>{subtitle}</div>
        ) : null}

        <div style={{ marginTop: 14 }}>
          <input
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="you@email.com"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.02)",
              color: "var(--text)",
            }}
          />
          {err ? (
            <div
              style={{
                marginTop: 8,
                color: "rgba(251,113,133,1)",
                fontWeight: 800,
              }}
            >
              {err}
            </div>
          ) : null}

          <button
            onClick={submit}
            className="btn-primary"
            style={{
              width: "100%",
              marginTop: 12,
              padding: 12,
              fontWeight: 900,
            }}
          >
            Continue
          </button>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
            By continuing you agree we store your email locally in your browser
            to unlock this page.
          </div>
        </div>
      </div>
    </div>
  );
}

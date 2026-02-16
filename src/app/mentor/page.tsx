"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";

export default function MentorPage() {
  const router = useRouter();
  const { data } = useTradeSession();

  const hasSession = !!data?.rowsParsed && (data.rowsParsed ?? 0) > 0;

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
      {/* Header */}
      <div
        className="card"
        style={{
          padding: 16,
          borderRadius: 16,
          border: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div style={{ fontWeight: 1000, fontSize: 18 }}>Mentor</div>
        <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
          AI Analysis (coming soon). Hier bekommst du später: wo du stehst,
          warum, was du als Nächstes tun solltest.
        </div>

        <div
          style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <button
            className="btn-secondary"
            onClick={() => router.push("/journal")}
          >
            Journal
          </button>
          <button
            className="btn-secondary"
            onClick={() => router.push("/risk")}
          >
            Risk
          </button>
          <button
            className="btn-secondary"
            onClick={() => router.push("/performance")}
          >
            Performance
          </button>
        </div>
      </div>

      {/* Empty state / placeholder */}
      {!hasSession ? (
        <div className="card" style={{ padding: 16, borderRadius: 16 }}>
          <div style={{ fontWeight: 1000 }}>Keine Session geladen</div>
          <div className="p-muted" style={{ marginTop: 8 }}>
            Lade zuerst eine CSV hoch, damit der Mentor später deine Trades
            analysieren kann.
          </div>
          <div style={{ marginTop: 12 }}>
            <button
              className="btn-primary"
              onClick={() => router.push("/upload")}
            >
              Go to Upload
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          <div
            className="card"
            style={{
              padding: 16,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div style={{ fontWeight: 1000 }}>Heute (Placeholder)</div>
            <div
              className="p-muted"
              style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5 }}
            >
              Morgen bauen wir hier:
              <ul style={{ marginTop: 8, paddingLeft: 18 }}>
                <li>“Where you stand” (1–2 KPIs)</li>
                <li>“Why” (Top 3 Gründe)</li>
                <li>“Next steps” (3 Actions)</li>
              </ul>
            </div>
          </div>

          <div
            className="card"
            style={{
              padding: 16,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div style={{ fontWeight: 1000 }}>Mentor Chat (später)</div>
            <div className="p-muted" style={{ marginTop: 8, fontSize: 12 }}>
              Kommt morgen: Eingabefeld + Antwort-Box. Heute nur Layout.
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.08)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div className="p-muted" style={{ fontSize: 12 }}>
                  Prompt (disabled)
                </div>
                <div style={{ marginTop: 6, opacity: 0.6, fontSize: 12 }}>
                  “Analyse my last 30 trades…”
                </div>
              </div>

              <button className="btn-primary" disabled style={{ opacity: 0.6 }}>
                Ask Mentor (tomorrow)
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

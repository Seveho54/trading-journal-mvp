"use client";

import { useRouter } from "next/navigation";

export default function JournalPage() {
  const router = useRouter();

  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "40px auto",
        padding: 16,
        fontFamily: "system-ui",
      }}
    >
      <div className="card" style={{ padding: 18 }}>
        <div className="h1">Journal</div>
        <p className="p-muted" style={{ marginTop: 8 }}>
          Trades, Positions, Calendar.
        </p>

        <div
          style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}
        >
          <button
            className="btn-secondary"
            onClick={() => router.push("/trades")}
          >
            Trades
          </button>
          <button
            className="btn-secondary"
            onClick={() => router.push("/positions")}
          >
            Positions
          </button>
          <button
            className="btn-secondary"
            onClick={() => router.push("/calendar")}
          >
            Calendar
          </button>
          <div style={{ flex: 1 }} />
          <button
            className="btn-secondary"
            onClick={() => router.push("/overview")}
          >
            Back to Overview
          </button>
        </div>
      </div>
    </main>
  );
}

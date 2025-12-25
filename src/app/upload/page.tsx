"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";

export default function UploadPage() {
  const router = useRouter();
  const { setData, clear, data } = useTradeSession();

  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function upload() {
    if (!file) return;

    setLoading(true);
    setErrorText(null);

    const fd = new FormData();
    fd.append("file", file);

    const res = await fetch("/api/parse", { method: "POST", body: fd });
    const text = await res.text();

    if (!res.ok) {
      setErrorText(text || `Upload failed (${res.status})`);
      setLoading(false);
      return;
    }

    let json: any;
    try {
      json = JSON.parse(text);
    } catch {
      setErrorText("Server returned non-JSON response.");
      setLoading(false);
      return;
    }

    setData({
        summary: json.summary ?? null,
      
        // Trades-Analytics (optional weiter behalten)
        bySymbol: json.bySymbol ?? [],
        byMonth: json.byMonth ?? [],
        byDay: json.byDay ?? [],
      
        // Positions-Analytics (NEU)
        bySymbolPositions: json.bySymbolPositions ?? [],
        byMonthPositions: json.byMonthPositions ?? [],
        byDayPositions: json.byDayPositions ?? [],
      
        // Trades / Positions
        trades: json.trades ?? [],
        positions: json.positions ?? [],
      
        errors: json.errors ?? [],
        rowsParsed: json.rowsParsed ?? 0,
        uploadedFileName: file.name,
      });
      
      

    setLoading(false);
    router.push("/dashboard");
  }

  return (
    <main>
      {/* Header */}
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div className="h1">Upload</div>
        <p className="p-muted">
          Lade deine Trading-CSV hoch und erhalte sofort Analytics & Insights.
        </p>
      </div>

      {/* Upload Controls */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />

          <button
            onClick={upload}
            disabled={!file || loading}
            className="btn-primary"
            style={{ padding: "8px 14px" }}
          >
            {loading ? "Uploading..." : "Upload & Analyze"}
          </button>

          <button
            onClick={clear}
            disabled={!data}
            className="btn-secondary"
            style={{ padding: "8px 14px" }}
          >
            Clear Session
          </button>

          {data && (
            <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
              Active Session:{" "}
              <b style={{ color: "var(--text)" }}>{data.uploadedFileName}</b> ·{" "}
              {data.rowsParsed} rows
            </div>
          )}
        </div>
      </div>

      {/* Error */}
      {errorText && (
        <div className="card" style={{ padding: 14, borderColor: "rgba(251,113,133,0.4)" }}>
          <b style={{ color: "var(--danger)" }}>Error:</b>{" "}
          <span>{errorText}</span>
        </div>
      )}
    </main>
  );
}

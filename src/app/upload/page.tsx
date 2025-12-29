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
    if (!file || loading) return;

    setLoading(true);
    setErrorText(null);

    try {
      const fd = new FormData();
      fd.append("file", file);

      const res = await fetch("/api/parse", { method: "POST", body: fd });
      const text = await res.text();

      if (!res.ok) {
        setErrorText(text || `Upload failed (${res.status}). Please try again.`);
        setLoading(false);
        return;
      }

      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        setErrorText("Server returned an invalid response (non-JSON).");
        setLoading(false);
        return;
      }

      setData({
        summary: json.summary ?? null,
        bySymbol: json.bySymbol ?? [],
        byMonth: json.byMonth ?? [],
        byDay: json.byDay ?? [],

        trades: json.trades ?? [],

        // Positions
        positions: json.positions ?? [],
        bySymbolPositions: json.bySymbolPositions ?? [],
        byMonthPositions: json.byMonthPositions ?? [],
        byDayPositions: json.byDayPositions ?? [],

        errors: json.errors ?? [],
        rowsParsed: json.rowsParsed ?? 0,
        uploadedFileName: file.name,
      });

      router.push("/dashboard");
    } catch (e: any) {
      setErrorText(e?.message ?? "Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const sessionLabel = data?.uploadedFileName ? data.uploadedFileName : "—";
  const rowsLabel = typeof data?.rowsParsed === "number" ? data.rowsParsed : 0;

  return (
    <main>
      {/* Header */}
      <div className="card" style={{ padding: 18, marginBottom: 14 }}>
        <div className="h1">Upload</div>
        <p className="p-muted">
          Upload your trading CSV and instantly get analytics, insights, and performance stats.
        </p>
      </div>

      {/* Upload Controls */}
      <div className="card" style={{ padding: 14, marginBottom: 14 }}>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 800 }}>CSV File</div>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Supported: Bitget Futures CSV (more exchanges coming soon).
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              onClick={upload}
              disabled={!file || loading}
              className="btn-primary"
              style={{ padding: "8px 14px" }}
            >
              {loading ? "Uploading…" : "Upload & Analyze"}
            </button>

            <button
              onClick={clear}
              disabled={!data || loading}
              className="btn-secondary"
              style={{ padding: "8px 14px" }}
              title={!data ? "No active session" : "Clear current session"}
            >
              Clear Session
            </button>
          </div>

          {/* Active session */}
          <div style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)" }}>
            Active Session: <b style={{ color: "var(--text)" }}>{sessionLabel}</b> ·{" "}
            <b style={{ color: "var(--text)" }}>{rowsLabel}</b> rows
          </div>
        </div>
      </div>

      {/* Error */}
      {errorText && (
        <div className="card" style={{ padding: 14, borderColor: "rgba(251,113,133,0.4)" }}>
          <b style={{ color: "var(--danger)" }}>Error:</b> <span>{errorText}</span>
        </div>
      )}
    </main>
  );
}

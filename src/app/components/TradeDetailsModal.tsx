"use client";

import { useState } from "react";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;
};

export function TradeDetailsModal({ open, title = "Trade Details", onClose, children }: Props) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{
          width: "min(920px, 100%)",
          maxHeight: "85vh",
          overflow: "auto",
          padding: 16,
          borderRadius: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>{title}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Click outside to close</div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              className="btn-secondary"
              onClick={async () => {
                try {
                  const text = typeof children === "string" ? children : "";
                  await navigator.clipboard.writeText(text);
                } catch {
                  // noop
                }
                setCopied(true);
                setTimeout(() => setCopied(false), 900);
              }}
              title="Copy (optional)"
            >
              {copied ? "Copied" : "Copy"}
            </button>

            <button onClick={onClose} className="btn-secondary">
              Close
            </button>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>{children}</div>
      </div>
    </div>
  );
}

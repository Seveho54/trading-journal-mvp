"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";

type Props = {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: React.ReactNode;

  // ✅ NEW: we pass the currently selected trade into the modal
  trade?: any;
};

export function TradeDetailsModal({ open, title = "Trade Details", onClose, children, trade }: Props) {
  const [copied, setCopied] = useState(false);

  const router = useRouter();
  const { isPro } = useTradeSession();

  if (!open) return null;

  async function copyRaw() {
    if (!trade) return;

    const text = JSON.stringify(trade.raw ?? trade, null, 2);
    await navigator.clipboard.writeText(text);

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

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
            {isPro ? (
              <button className="btn-secondary" onClick={copyRaw} disabled={!trade} title={!trade ? "No trade selected" : ""}>
                {copied ? "✅ Copied" : "Copy Raw JSON"}
              </button>
            ) : (
              <button className="btn-secondary" onClick={() => router.push("/pricing")} title="Pro feature">
                🔒 Copy Raw JSON (PRO)
              </button>
            )}

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

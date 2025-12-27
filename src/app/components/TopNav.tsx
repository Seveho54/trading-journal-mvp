"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isPro, data } = useTradeSession();

  function navButton(label: string, href: string) {
    const active = pathname === href;
    return (
      <button
        onClick={() => router.push(href)}
        className={active ? "btn-primary" : ""}
        style={{ padding: "8px 12px" }}
      >
        {label}
      </button>
    );
  }

  function openFeedbackEmail() {
    const to = "info@seveho.com";

    const plan = isPro ? "PRO" : "FREE";
    const file = data?.uploadedFileName ?? "-";
    const page = pathname ?? "-";

    const subject = `Feedback Trading Platform (${plan})`;

    const body = [
      `Hi, ich teste deine Trading Platform.`,
      ``,
      `Plan: ${plan}`,
      `Page: ${page}`,
      `Uploaded file: ${file}`,
      ``,
      `1) Was war unklar oder hat nicht funktioniert?`,
      `Antwort:`,
      ``,
      `2) Was hat dir am meisten geholfen?`,
      `Antwort:`,
      ``,
      `3) Würdest du dafür zahlen? Wenn ja: wie viel pro Monat?`,
      `Antwort:`,
      ``,
      `Optional: Screenshot / Beispiel-Trade / Idee`,
      ``,
      `Danke!`,
    ].join("\n");

    const url = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      body
    )}`;

    window.location.href = url;
  }

  return (
    <div
      className="card"
      style={{
        padding: 12,
        marginBottom: 14,
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <div style={{ fontWeight: 900, marginRight: 6 }}>Trading Platform</div>

      {/* Left nav */}
      {navButton("Dashboard", "/dashboard")}
      {navButton("Upload", "/upload")}
      {navButton("Trades", "/trades")}
      {navButton("Positions", "/positions")}
      {navButton("Performance", "/performance")}
      {navButton("Calendar", "/calendar")}
      {navButton("Pricing", "/pricing")}

      {/* Right side */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
        <div className="p-muted" style={{ fontSize: 12 }}>
          Plan: <b style={{ color: "var(--text)" }}>{isPro ? "PRO" : "FREE"}</b>
        </div>

        <button onClick={openFeedbackEmail} style={{ padding: "8px 12px" }}>
          Feedback
        </button>
      </div>
    </div>
  );
}

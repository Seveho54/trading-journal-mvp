"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/upload", label: "Upload" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trades", label: "Trade Log" },
  { href: "/performance", label: "Performance" },
  { href: "/calendar", label: "Calendar" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <div style={{ position: "sticky", top: 0, zIndex: 20, backdropFilter: "blur(10px)" }}>
      <div style={{ borderBottom: "1px solid var(--border)", background: "rgba(11,18,32,0.6)" }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "14px 16px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          {/* Brand */}
          <Link href="/dashboard" style={{ textDecoration: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 12,
                  background:
                    "radial-gradient(12px 12px at 30% 30%, rgba(96,165,250,0.9), rgba(96,165,250,0.0)), radial-gradient(14px 14px at 70% 70%, rgba(54,211,153,0.9), rgba(54,211,153,0.0)), rgba(255,255,255,0.06)",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow)",
                }}
              />
              <div>
                <div style={{ fontWeight: 900, letterSpacing: 0.2 }}>Trade Platform</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>Upload → Insights → Improve</div>
              </div>
            </div>
          </Link>

          {/* Nav */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {items.map((it) => {
              const active = pathname === it.href;
              return (
                <Link
                  key={it.href}
                  href={it.href}
                  style={{
                    textDecoration: "none",
                    padding: "8px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                    fontWeight: active ? 800 : 600,
                    color: "var(--text)",
                  }}
                >
                  {it.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

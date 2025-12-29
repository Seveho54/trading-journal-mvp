"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import Image from "next/image"

type NavItem = { label: string; href: string; icon: React.ReactNode };

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        display: "inline-grid",
        placeItems: "center",
        opacity: 0.9,
      }}
    >
      {children}
    </span>
  );
}

function NavPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 999,
        border: active ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.10)",
        background: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
        color: "var(--text)",
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
        transition: "transform 120ms ease, background 120ms ease, border 120ms ease",
      }}
      onMouseDown={(e) => e.currentTarget.style.transform = "scale(0.98)"}
      onMouseUp={(e) => e.currentTarget.style.transform = "scale(1)"}
      onMouseLeave={(e) => e.currentTarget.style.transform = "scale(1)"}
    >
      {children}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(255,255,255,0.04)",
        fontSize: 12,
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </div>
  );
}

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isPro, data } = useTradeSession();

  const items: NavItem[] = [
    {
        label: "Upload",
        href: "/upload",
        icon: (
          <Icon>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path d="M12 3v12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M7 8l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M4 21h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".8" />
            </svg>
          </Icon>
        ),
      },
    {
      label: "Dashboard",
      href: "/dashboard",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path d="M4 12a8 8 0 1 0 16 0A8 8 0 0 0 4 12Z" stroke="currentColor" opacity=".8" />
            <path d="M12 12V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 12l4 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </Icon>
      ),
    },

    {
      label: "Trades",
      href: "/trades",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path d="M4 19V5" stroke="currentColor" opacity=".8" />
            <path d="M8 19V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M12 19V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M16 19V11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M20 19V6" stroke="currentColor" opacity=".8" />
          </svg>
        </Icon>
      ),
    },
    {
      label: "Positions",
      href: "/positions",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path d="M6 7h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M6 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M6 17h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </Icon>
      ),
    },
    {
      label: "Performance",
      href: "/performance",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path d="M5 19V5" stroke="currentColor" opacity=".8" />
            <path d="M5 19h14" stroke="currentColor" opacity=".8" />
            <path d="M7 15l4-4 3 3 5-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </Icon>
      ),
    },
    {
      label: "Calendar",
      href: "/calendar",
      icon: (
        <Icon>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
            <path d="M7 3v3M17 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M4 8h16" stroke="currentColor" opacity=".8" />
            <path
              d="M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
              stroke="currentColor"
              opacity=".8"
            />
            <path d="M8 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M8 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </Icon>
      ),
    },
        /*
        {
          label: "Pricing",
          href: "/pricing",
          icon: (
            <Icon>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                <path d="M7 7h10v10H7z" stroke="currentColor" opacity=".8" />
                <path d="M9 9h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M9 12h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </Icon>
          ),
        }
        */      
  ];

  async function copyFeedbackTemplate() {
    const plan = isPro ? "PRO" : "FREE";
    const file = data?.uploadedFileName ?? "-";
    const page = pathname ?? "-";
  
    const text = [
      `Feedback – Trading Platform`,
      ``,
      `Plan: ${plan}`,
      `Page: ${page}`,
      `Uploaded file: ${file}`,
      ``,
      `1) What was unclear / broken?`,
      `-`,
      ``,
      `2) What helped the most?`,
      `-`,
      ``,
      `3) Would you pay for this? If yes: how much per month?`,
      `-`,
      ``,
      `Optional: screenshot / example trade / idea`,
    ].join("\n");
  
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied! Paste it into your email or DM.");
    } catch {
      // fallback if clipboard not allowed
      window.prompt("Copy this text:", text);
    }
  }
  
  function openFeedbackEmailSimple() {
    const to = "info@seveho.com";
    const plan = isPro ? "PRO" : "FREE";
    const subject = `Tradevion Feedback (${plan})`;
  
    // keep it SHORT -> more reliable
    window.location.href = `mailto:${to}?subject=${encodeURIComponent(subject)}`;
  }
  

  return (
    <div
      className="card"
      style={{
        position: "sticky",
        top: 10,
        zIndex: 50,
        padding: 12,
        marginBottom: 14,
        borderRadius: 18,
        border: "1px solid rgba(255,255,255,0.10)",
        background: "rgba(12,18,32,0.70)",
        backdropFilter: "blur(10px)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {/* Logo placeholder */}
        <button
          onClick={() => router.push("/dashboard")}
          title="Go to Dashboard"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 10px",
            borderRadius: 14,
            border: "1px solid rgba(255,255,255,0.10)",
            background: "rgba(255,255,255,0.03)",
          }}
        >
          <div
  style={{
    width: 34,
    height: 34,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.18)",
    overflow: "hidden",
    display: "grid",
    placeItems: "center",
  }}
>
  <Image
    src="/Logo.png"
    alt="Logo"
    width={54}
    height={54}
    priority
  />
</div>

          <div style={{ lineHeight: 1 }}>
            <div style={{ fontWeight: 1000, letterSpacing: 0.3 }}>Trading Journal</div>
            <div className="p-muted" style={{ fontSize: 12 }}>
              {isPro ? "PRO" : "FREE"} • {data?.uploadedFileName ? "Session loaded" : "No session"}
            </div>
          </div>
        </button>

        {/* Right controls */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <Badge>
            Plan:{" "}
            <span style={{ color: "var(--text)" }}>
              {isPro ? "PRO" : "FREE"}
            </span>
          </Badge>

        </div>
      </div>

      {/* Nav row (scrollable on small screens) */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          gap: 8,
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {items.map((it) => {
          const active = pathname === it.href;
          return (
            <NavPill key={it.href} active={active} onClick={() => router.push(it.href)}>
              {it.icon}
              <span>{it.label}</span>
            </NavPill>
          );
        })}
      </div>
    </div>
  );
}

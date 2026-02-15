"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTradeSession } from "../providers/TradeSessionProvider";
import Image from "next/image";
import { createPortal } from "react-dom";

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

/**
 * IMPORTANT:
 * - keep this as a single <button> (no nested buttons inside)
 */
function NavPill({
  active,
  onClick,
  children,
  ariaHaspopup,
  ariaExpanded,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaHaspopup?: "menu";
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup={ariaHaspopup}
      aria-expanded={ariaExpanded}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px",
        borderRadius: 999,
        border: active
          ? "1px solid rgba(255,255,255,0.22)"
          : "1px solid rgba(255,255,255,0.10)",
        background: active
          ? "rgba(255,255,255,0.10)"
          : "rgba(255,255,255,0.03)",
        color: "var(--text)",
        fontWeight: 900,
        fontSize: 12,
        whiteSpace: "nowrap",
        transition:
          "transform 120ms ease, background 120ms ease, border 120ms ease",
        cursor: "pointer",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
      onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
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

function MenuItem({
  label,
  onClick,
  active,
}: {
  label: string;
  onClick: () => void;
  active: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.10)",
        background: active
          ? "rgba(255,255,255,0.10)"
          : "rgba(255,255,255,0.03)",
        color: "var(--text)",
        fontWeight: 900,
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

export function TopNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { isPro, data } = useTradeSession();

  // ---------- MAIN ITEMS (centered row) ----------
  const items: NavItem[] = useMemo(
    () => [
      {
        label: "Upload",
        href: "/upload",
        icon: (
          <Icon>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path
                d="M12 3v12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M7 8l5-5 5 5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M4 21h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                opacity=".8"
              />
            </svg>
          </Icon>
        ),
      },
      {
        label: "Overview",
        href: "/dashboard",
        icon: (
          <Icon>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path
                d="M4 12a8 8 0 1 0 16 0A8 8 0 0 0 4 12Z"
                stroke="currentColor"
                opacity=".8"
              />
              <path
                d="M12 12V7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M12 12l4 2"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
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
              <path
                d="M7 15l4-4 3 3 5-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </Icon>
        ),
      },
      {
        label: "Risk",
        href: "/risk",
        icon: (
          <Icon>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
              <path
                d="M12 3l9 16H3l9-16Z"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinejoin="round"
                opacity=".85"
              />
              <path
                d="M12 9v4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
              <path
                d="M12 16h.01"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          </Icon>
        ),
      },
    ],
    [],
  );

  // ---------- JOURNAL DROPDOWN (portal so it can overlay, no sticky clipping) ----------
  const journalBtnRef = useRef<HTMLButtonElement | null>(null);
  const closeTimer = useRef<number | null>(null);

  const [mounted, setMounted] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useEffect(() => setMounted(true), []);

  const journalActive =
    pathname === "/trades" ||
    pathname === "/positions" ||
    pathname === "/calendar";

  function computeMenuPos() {
    const el = journalBtnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();

    // keep it under the pill, centered to pill
    const width = 220;
    const left = Math.max(
      10,
      Math.min(
        window.innerWidth - width - 10,
        rect.left + rect.width / 2 - width / 2,
      ),
    );
    const top = rect.bottom + 10;

    setMenuPos({ top, left, width });
  }

  function openJournal() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    computeMenuPos();
    setJournalOpen(true);
  }

  function scheduleCloseJournal() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    // small delay so you can move mouse into the menu without it disappearing
    closeTimer.current = window.setTimeout(() => setJournalOpen(false), 140);
  }

  useEffect(() => {
    if (!journalOpen) return;

    const onScroll = () => computeMenuPos();
    const onResize = () => computeMenuPos();

    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);

    // compute once more (fonts/layout)
    computeMenuPos();

    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [journalOpen]);

  function go(href: string) {
    setJournalOpen(false);
    router.push(href);
  }

  const JournalMenu =
    mounted && journalOpen && menuPos
      ? createPortal(
          <div
            // the overlay captures hover so there is NEVER a "gap" problem
            onMouseEnter={openJournal}
            onMouseLeave={scheduleCloseJournal}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 9999,
              pointerEvents: "none", // enable only on the menu itself
            }}
          >
            <div
              role="menu"
              aria-label="Journal menu"
              style={{
                position: "fixed",
                top: menuPos.top,
                left: menuPos.left,
                width: menuPos.width,
                pointerEvents: "auto",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.10)",
                background: "rgba(12,18,32,0.88)",
                backdropFilter: "blur(12px)",
                boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
                padding: 10,
                display: "grid",
                gap: 8,
              }}
            >
              <div
                style={{
                  padding: "2px 6px 6px",
                  opacity: 0.8,
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                Journal
              </div>

              <MenuItem
                label="Trades"
                onClick={() => go("/trades")}
                active={pathname === "/trades"}
              />
              <MenuItem
                label="Positions"
                onClick={() => go("/positions")}
                active={pathname === "/positions"}
              />
              <MenuItem
                label="Calendar"
                onClick={() => go("/calendar")}
                active={pathname === "/calendar"}
              />
            </div>
          </div>,
          document.body,
        )
      : null;

  // ---------- RENDER ----------
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
      {/* Top row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          gap: 12,
        }}
      >
        {/* LEFT: Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
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
                background: "rgba(255,255,255,0.12)",
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
          </button>
        </div>

        {/* CENTER: Title */}
        <div style={{ textAlign: "center", lineHeight: 1.2 }}>
          <div
            style={{
              fontWeight: 900,
              fontSize: 51,
              letterSpacing: 0.3,
            }}
          >
            Tradevion
          </div>
          <div
            style={{
              fontSize: 16,
              opacity: 0.6,
              fontWeight: 600,
            }}
          >
            Risk Operating System
          </div>
        </div>

        {/* RIGHT: Plan Badge */}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Badge>
            Plan:{" "}
            <span style={{ color: "var(--text)" }}>
              {isPro ? "PRO" : "FREE"}
            </span>
          </Badge>
        </div>
      </div>

      {/* Nav row (CENTERED) */}
      <div
        style={{
          marginTop: 12,
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          gap: 8,
          justifyContent: "center", // ✅ 1) centered
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {items.map((it) => {
          const active =
            pathname === it.href ||
            (it.href.includes("#") && pathname === it.href.split("#")[0]);
          return (
            <NavPill
              key={it.href}
              active={active}
              onClick={() => router.push(it.href)}
            >
              {it.icon}
              <span>{it.label}</span>
            </NavPill>
          );
        })}

        {/* JOURNAL DROPDOWN TRIGGER (no nested button anywhere) */}
        <div
          onMouseEnter={openJournal}
          onMouseLeave={scheduleCloseJournal}
          style={{ display: "inline-flex" }}
        >
          <NavPill
            active={journalActive}
            onClick={() =>
              journalOpen ? setJournalOpen(false) : openJournal()
            }
            ariaHaspopup="menu"
            ariaExpanded={journalOpen}
          >
            <Icon>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none">
                <path
                  d="M7 4h10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <path
                  d="M7 9h10"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity=".9"
                />
                <path
                  d="M7 14h7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity=".9"
                />
                <path d="M6 20h12" stroke="currentColor" opacity=".8" />
              </svg>
            </Icon>

            <span>Journal</span>

            <span style={{ opacity: 0.75, marginLeft: 2 }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path
                  d="M7 10l5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </span>
          </NavPill>

          {/* hidden ref anchor: attach to the actual button element */}
          {/* we can safely grab it via query in effect, but simplest: wrap ref by cloning is messy.
              Instead, we locate the last button inside this wrapper. */}
          <span
            style={{ display: "none" }}
            ref={(el) => {
              // find the button inside wrapper and store as anchor
              // (runs after render; harmless)
              if (!el) return;
              const wrapper = el.parentElement;
              const btn = wrapper?.querySelector(
                "button",
              ) as HTMLButtonElement | null;
              if (btn) journalBtnRef.current = btn;
            }}
          />
        </div>
      </div>

      {JournalMenu}
    </div>
  );
}

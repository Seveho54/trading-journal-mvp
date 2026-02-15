"use client";

import React from "react";

export type RiskTabKey =
  | "diagnosis"
  | "why"
  | "meaning"
  | "action"
  | "forecast";

export function RiskOS({
  tab,
  onTabChange,
  children,
}: {
  tab: RiskTabKey;
  onTabChange: (t: RiskTabKey) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="card"
      style={{
        marginTop: 0,
        borderRadius: 18,
        overflow: "hidden",
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.02)",
        flex: 1,
        display: "flex",
        flexDirection: "column",
        minHeight: 0, // wichtig für flex child sizing
      }}
    >
      {/* Screen */}
      <div
        style={{
          padding: 12,
          flex: 1,
          minHeight: 0,
          overflow: "hidden", // kein Scroll im Screen
        }}
      >
        {children}
      </div>

      {/* Bottom Nav */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.08)",
          padding: 8,
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 8,
          background: "rgba(0,0,0,0.12)",
        }}
      >
        <TabBtn
          active={tab === "diagnosis"}
          onClick={() => onTabChange("diagnosis")}
        >
          Diagnosis
        </TabBtn>
        <TabBtn active={tab === "why"} onClick={() => onTabChange("why")}>
          Why
        </TabBtn>
        <TabBtn
          active={tab === "meaning"}
          onClick={() => onTabChange("meaning")}
        >
          Meaning
        </TabBtn>
        <TabBtn active={tab === "action"} onClick={() => onTabChange("action")}>
          Action
        </TabBtn>
        <TabBtn
          active={tab === "forecast"}
          onClick={() => onTabChange("forecast")}
        >
          Forecast
        </TabBtn>
      </div>
    </div>
  );
}

function TabBtn({
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
      type="button"
      onClick={onClick}
      className={active ? "btn-primary" : "btn-secondary"}
      style={{
        width: "100%",
        borderRadius: 14,
        padding: "10px 12px",
        fontWeight: 900,
        fontSize: 12,
        opacity: active ? 1 : 0.88,
      }}
    >
      {children}
    </button>
  );
}

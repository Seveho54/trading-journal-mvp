"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Guardrails = {
  dailyLossLimitPct: number;
  ddWarningPct: number;
  ddHardStopPct: number;
  lossStreakHardStop: number;
  survivalHardStop: number;
};

const DEFAULTS: Guardrails = {
  dailyLossLimitPct: 0.03,
  ddWarningPct: 0.1,
  ddHardStopPct: 0.25,
  lossStreakHardStop: 4,
  survivalHardStop: 40,
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function readStored(): Guardrails {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem("tv_guardrails");
    if (!raw) return DEFAULTS;
    const j = JSON.parse(raw);
    return { ...DEFAULTS, ...j };
  } catch {
    return DEFAULTS;
  }
}

function toNum(x: any, fallback: number) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

export default function RiskSettingsPage() {
  const router = useRouter();
  const [g, setG] = useState<Guardrails>(DEFAULTS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setG(readStored());
  }, []);

  const valid = useMemo(() => {
    // harte Validierung (damit niemand 300% einträgt)
    return {
      dailyLossLimitPct: clamp(g.dailyLossLimitPct, 0.005, 0.2),
      ddWarningPct: clamp(g.ddWarningPct, 0.05, 0.5),
      ddHardStopPct: clamp(g.ddHardStopPct, 0.1, 0.9),
      lossStreakHardStop: clamp(g.lossStreakHardStop, 2, 10),
      survivalHardStop: clamp(g.survivalHardStop, 0, 90),
    };
  }, [g]);

  function save() {
    localStorage.setItem("tv_guardrails", JSON.stringify(valid));
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  function reset() {
    setG(DEFAULTS);
    localStorage.setItem("tv_guardrails", JSON.stringify(DEFAULTS));
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  }

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: 16 }}>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 1000, fontSize: 18 }}>Risk Settings</div>
        <div className="p-muted" style={{ marginTop: 6, fontSize: 12 }}>
          Setze deine Guardrails. Tradevion nutzt sie für Risk State +
          Empfehlungen.
        </div>

        <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
          {/* Daily Loss */}
          <div>
            <div style={{ fontWeight: 900, fontSize: 12 }}>
              Daily Loss Limit (%)
            </div>
            <div className="p-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Standard: 3%. Wenn überschritten → CRITICAL.
            </div>
            <input
              className="input"
              value={(g.dailyLossLimitPct * 100).toString()}
              onChange={(e) =>
                setG((p) => ({
                  ...p,
                  dailyLossLimitPct: toNum(e.target.value, 3) / 100,
                }))
              }
              style={{ marginTop: 8, width: "100%" }}
              inputMode="decimal"
            />
          </div>

          {/* DD Warning */}
          <div>
            <div style={{ fontWeight: 900, fontSize: 12 }}>
              Drawdown Warning (%)
            </div>
            <div className="p-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Ab hier → WARNING.
            </div>
            <input
              className="input"
              value={(g.ddWarningPct * 100).toString()}
              onChange={(e) =>
                setG((p) => ({
                  ...p,
                  ddWarningPct: toNum(e.target.value, 10) / 100,
                }))
              }
              style={{ marginTop: 8, width: "100%" }}
              inputMode="decimal"
            />
          </div>

          {/* DD Hard Stop */}
          <div>
            <div style={{ fontWeight: 900, fontSize: 12 }}>
              Drawdown Hard-Stop (%)
            </div>
            <div className="p-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Ab hier → CRITICAL.
            </div>
            <input
              className="input"
              value={(g.ddHardStopPct * 100).toString()}
              onChange={(e) =>
                setG((p) => ({
                  ...p,
                  ddHardStopPct: toNum(e.target.value, 25) / 100,
                }))
              }
              style={{ marginTop: 8, width: "100%" }}
              inputMode="decimal"
            />
          </div>

          {/* Loss streak */}
          <div>
            <div style={{ fontWeight: 900, fontSize: 12 }}>
              Loss Streak Hard-Stop
            </div>
            <div className="p-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Anzahl Verluste in Folge → CRITICAL Empfehlung.
            </div>
            <input
              className="input"
              value={String(g.lossStreakHardStop)}
              onChange={(e) =>
                setG((p) => ({
                  ...p,
                  lossStreakHardStop: Math.round(toNum(e.target.value, 4)),
                }))
              }
              style={{ marginTop: 8, width: "100%" }}
              inputMode="numeric"
            />
          </div>

          {/* Survival hard stop */}
          <div>
            <div style={{ fontWeight: 900, fontSize: 12 }}>
              Survival Score Hard-Stop
            </div>
            <div className="p-muted" style={{ fontSize: 12, marginTop: 4 }}>
              Wenn Score darunter → CRITICAL.
            </div>
            <input
              className="input"
              value={String(g.survivalHardStop)}
              onChange={(e) =>
                setG((p) => ({
                  ...p,
                  survivalHardStop: Math.round(toNum(e.target.value, 40)),
                }))
              }
              style={{ marginTop: 8, width: "100%" }}
              inputMode="numeric"
            />
          </div>
        </div>

        <div
          style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          <button className="btn-primary" onClick={save}>
            Save
          </button>
          <button className="btn-secondary" onClick={reset}>
            Reset Defaults
          </button>
          <button
            className="btn-secondary"
            onClick={() => router.push("/control")}
          >
            Back to Control
          </button>

          {saved ? (
            <span
              className="p-muted"
              style={{ fontSize: 12, alignSelf: "center" }}
            >
              Saved ✅
            </span>
          ) : null}
        </div>
      </div>
    </main>
  );
}

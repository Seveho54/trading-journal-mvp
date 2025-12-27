"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type TradeSessionData = {
  summary: any | null;
  bySymbol: any[];
  byMonth: any[];
  byDay: any[];

  trades: any[];

  positions: any[];
  bySymbolPositions: any[];
  byMonthPositions: any[];
  byDayPositions: any[];

  errors: string[];
  rowsParsed: number;
  uploadedFileName?: string;
};

type TradeSessionContextValue = {
  data: TradeSessionData | null;
  setData: (data: TradeSessionData) => void;
  clear: () => void;

  // ✅ MVP fake-paywall
  isPro: boolean;
  setIsPro: (v: boolean) => void;
};

const TradeSessionContext = createContext<TradeSessionContextValue | null>(null);

const STORAGE_KEY = "tradeSession:v1";
const PRO_KEY = "tradeSession:isPro:v1";

export function TradeSessionProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<TradeSessionData | null>(null);
  const [isPro, setIsProState] = useState(false);

  // 1) Beim Start: Session + isPro aus localStorage laden
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as TradeSessionData;
        setDataState(parsed);
      }
    } catch {
      // ignore invalid json
    }

    try {
      const rawPro = localStorage.getItem(PRO_KEY);
      if (rawPro !== null) setIsProState(rawPro === "true");
    } catch {
      // ignore
    }
  }, []);

  // 2) Session speichern (oder löschen)
  useEffect(() => {
    try {
      if (data) localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, [data]);

  // 3) isPro speichern
  useEffect(() => {
    try {
      localStorage.setItem(PRO_KEY, String(isPro));
    } catch {
      // ignore
    }
  }, [isPro]);

  const value = useMemo<TradeSessionContextValue>(() => {
    return {
      data,
      setData: (d) => setDataState(d),
      clear: () => setDataState(null),

      isPro,
      setIsPro: (v) => setIsProState(v),
    };
  }, [data, isPro]);

  return <TradeSessionContext.Provider value={value}>{children}</TradeSessionContext.Provider>;
}

export function useTradeSession() {
  const ctx = useContext(TradeSessionContext);
  if (!ctx) throw new Error("useTradeSession must be used inside TradeSessionProvider");
  return ctx;
}

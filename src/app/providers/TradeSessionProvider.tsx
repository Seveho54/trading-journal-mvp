"use client";

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type TradeSessionData = {
  summary: any | null;
  bySymbol: any[];
  byMonth: any[];
  byDay: any[];
  trades: any[];
  errors: string[];
  rowsParsed: number;
  uploadedFileName?: string;
};

type TradeSessionContextValue = {
  data: TradeSessionData | null;
  setData: (data: TradeSessionData) => void;
  clear: () => void;
};

const TradeSessionContext = createContext<TradeSessionContextValue | null>(null);

const STORAGE_KEY = "tradeSession:v1";

export function TradeSessionProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<TradeSessionData | null>(null);

  // 1) Beim Start: aus localStorage laden
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as TradeSessionData;
      setDataState(parsed);
    } catch {
      // Falls kaputtes JSON drin ist: ignorieren
    }
  }, []);

  // 2) Bei jeder Änderung: in localStorage speichern (oder löschen)
  useEffect(() => {
    try {
      if (data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // z.B. private mode / storage full -> ignorieren
    }
  }, [data]);

  const value = useMemo<TradeSessionContextValue>(() => {
    return {
      data,
      setData: (d) => setDataState(d),
      clear: () => setDataState(null),
    };
  }, [data]);

  return (
    <TradeSessionContext.Provider value={value}>
      {children}
    </TradeSessionContext.Provider>
  );
}

export function useTradeSession() {
  const ctx = useContext(TradeSessionContext);
  if (!ctx) throw new Error("useTradeSession must be used inside TradeSessionProvider");
  return ctx;
}

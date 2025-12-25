"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

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

export function TradeSessionProvider({ children }: { children: React.ReactNode }) {
  const [data, setDataState] = useState<TradeSessionData | null>(null);

  const value = useMemo<TradeSessionContextValue>(() => {
    return {
      data,
      setData: (d) => setDataState(d),
      clear: () => setDataState(null),
    };
  }, [data]);

  return <TradeSessionContext.Provider value={value}>{children}</TradeSessionContext.Provider>;
}

export function useTradeSession() {
  const ctx = useContext(TradeSessionContext);
  if (!ctx) throw new Error("useTradeSession must be used inside TradeSessionProvider");
  return ctx;
}

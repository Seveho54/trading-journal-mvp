export type Currency = "EUR" | "USD" | "USDT" | "USDC" | "BTC";

const LOCALE = "de-DE";
const TZ = "Europe/Berlin";

export const DEFAULT_CCY: Currency = "USDT";


export function dash(v: any) {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

export function fmtNumber(n: any, digits = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(x);
}

export function fmtPercent(n: any, digits = 1) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";
  return new Intl.NumberFormat(LOCALE, {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(x);
}

/**
 * Currency formatting:
 * - If you truly have EUR: pass "EUR"
 * - If it's USDT (not ISO), we format as number + " USDT"
 */
export function fmtMoney(n: any, currency: "EUR" | "USD" | "USDT" | "USDC" | "BTC" = "USDT", digits = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "—";

  // ISO currencies -> proper Intl currency
  if (currency === "EUR" || currency === "USD") {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(x);
  }

  // Non-ISO -> suffix
  return `${fmtNumber(x, digits)} ${currency}`;
}

export function fmtDateTime(ts: any) {
  if (!ts) return "—";
  const d = new Date(String(ts));
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}



export function fmtDate(ts: any) {
  if (!ts) return "—";
  const d = new Date(String(ts));
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export function fmtTime(ts: any) {
  if (!ts) return "—";
  const d = new Date(String(ts));
  if (Number.isNaN(d.getTime())) return "—";

  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}


export function currencyFromSymbol(symbol?: string | null): Currency | undefined {
    const s = String(symbol ?? "").toUpperCase();
  
    if (s.endsWith("USDT")) return "USDT";
    if (s.endsWith("USDC")) return "USDC";
    if (s.endsWith("USD")) return "USD";
    if (s.endsWith("EUR")) return "EUR";
    if (s.endsWith("BTC")) return "BTC";
  
    return undefined;
  }

  // lib/format.ts

  export function smartDigits(n: any, maxDigits = 6) {
    const x = Number(n);
    if (!Number.isFinite(x)) return 2;
  
    if (Math.abs(x - Math.round(x)) < 1e-12) return 0;
  
    const s = x.toFixed(maxDigits);
    const trimmed = s.replace(/0+$/, "");
    return trimmed.split(".")[1]?.length ?? 0;
  }
  
  export function fmtSmartNumber(n: any, maxDigits = 6) {
    const d = smartDigits(n, maxDigits);
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(Number(n));
  }
  
  export function fmtSmartMoney(
    n: any,
    ccy: Currency = DEFAULT_CCY,
    maxDigits = 6
  ) {
    const d = smartDigits(n, maxDigits);
    return `${fmtSmartNumber(n, maxDigits)} ${ccy}`;
  }
  

export type Currency = "EUR" | "USD" | "USDT" | "USDC" | "BTC";

const LOCALE = "de-DE";
const TZ = "Europe/Berlin";

export const DEFAULT_CCY: Currency = "USDT";


export function dash(v: any) {
  return v === null || v === undefined || v === "" ? "—" : String(v);
}

export function asCurrency(input: any): Currency {
    const s = String(input ?? "").toUpperCase();
    if (s === "EUR" || s === "USD" || s === "USDT" || s === "USDC" || s === "BTC") return s;
    return DEFAULT_CCY;
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
export function fmtMoney(n: any, ccy: Currency = DEFAULT_CCY, digits = 2) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "–";
    const s = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(x);
    return `${s} ${ccy}`;
  }

  // Price: "smart" -> keine unnötigen trailing zeros (0,379200 -> 0,3792)
  export function fmtPrice(
    n: number,
    maxDecimals = 6
  ): string {
    const x = Number(n);
    if (!Number.isFinite(x)) return "–";
  
    const abs = Math.abs(x);
  
    let decimals: number;
  
    if (abs >= 1000) decimals = 2;
    else if (abs >= 100) decimals = 3;
    else if (abs >= 10) decimals = 3;
    else if (abs >= 1) decimals = 3;
    else if (abs >= 0.1) decimals = 4;
    else if (abs >= 0.01) decimals = 5;
    else decimals = maxDecimals;
  
    return new Intl.NumberFormat("de-DE", {
      minimumFractionDigits: 0,
      maximumFractionDigits: decimals,
    }).format(x);
  }
  

  // Qty: ebenfalls ohne trailing zeros (264,0000 -> 264)
export function fmtQty(n: any, maxDigits = 6) {
    const x = Number(n);
    if (!Number.isFinite(x)) return "–";
    return new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: 0,
      maximumFractionDigits: maxDigits,
    }).format(x);
  }
  

// ISO -> nice (20.12.25, 11:07)
export function fmtDateTime(input: any) {
    const ms = new Date(String(input ?? "")).getTime();
    if (!Number.isFinite(ms)) return "–";
    const d = new Date(ms);
  
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yy = String(d.getFullYear()).slice(-2);
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
  
    return `${dd}.${mm}.${yy}, ${hh}:${mi}`;
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
  

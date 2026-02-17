export type Rule =
  | {
      id: string;
      type: "AVOID_COMBO" | "FOCUS_COMBO";
      symbol: string;
      side: "LONG" | "SHORT" | "UNKNOWN";
      holdBucket: string; // e.g. "4–7h"
      createdAt: string;
    }
  | {
      id: string;
      type: "AVOID_HOUR_UTC";
      hour: number; // 0..23
      createdAt: string;
    };

const KEY = "tv_rules_v1";

export function loadRules(): Rule[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as Rule[]) : [];
  } catch {
    return [];
  }
}

export function saveRules(rules: Rule[]) {
  localStorage.setItem(KEY, JSON.stringify(rules ?? []));
}

export function uid(prefix = "r") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now()}`;
}

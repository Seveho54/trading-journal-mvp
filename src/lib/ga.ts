// src/lib/ga.ts

export function hasAnalyticsConsent() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("tv_consent_analytics") === "true";
}

export function trackEvent(name: string, params: Record<string, any> = {}) {
  if (typeof window === "undefined") return;
  if (!hasAnalyticsConsent()) return;

  // gtag exists?
  const gtag = (window as any).gtag;
  if (typeof gtag !== "function") return;

  gtag("event", name, params);
}

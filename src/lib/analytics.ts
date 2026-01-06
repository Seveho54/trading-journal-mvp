export function track(event: string, props: Record<string, any> = {}) {
  try {
    // If GA gtag exists
    const gtag = (globalThis as any).gtag;
    if (typeof gtag === "function") {
      gtag("event", event, props);
    }

    // If Vercel Analytics exists (optional via window)
    const va = (globalThis as any).va;
    if (typeof va === "function") {
      va("event", { name: event, ...props });
    }

    // Fallback: console in dev
    if (process.env.NODE_ENV !== "production") {
      console.log("[track]", event, props);
    }
  } catch {
    // never crash UI
  }
}

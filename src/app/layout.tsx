import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { TradeSessionProvider } from "./providers/TradeSessionProvider";
import { TopNav } from "./components/TopNav";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import { AnalyticsConsent } from "./components/AnalyticsConsent";

export const metadata: Metadata = {
  title: "Tradevion – Trading Analytics",
  description: "Upload your Bitget CSV and analyze your trading performance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* ✅ Google Analytics */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-SSNHNPYR63"
          strategy="afterInteractive"
        />
        <Script id="ga-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-SSNHNPYR63', {
              page_path: window.location.pathname,
            });
          `}
        </Script>
      </head>

      <body>
        <TradeSessionProvider>
          <TopNav />
          {children}
          <AnalyticsConsent />
        </TradeSessionProvider>

        {/* ✅ Vercel Analytics (separat, ok) */}
        <VercelAnalytics />

        <footer
          style={{
            maxWidth: 1100,
            margin: "24px auto 18px",
            padding: "0 12px",
            opacity: 0.85,
          }}
        >
          <div
            className="card"
            style={{
              padding: 12,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 12 }} className="p-muted">
              © {new Date().getFullYear()} Tradevion · Educational analytics
              only · No financial advice
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a className="pill" href="/disclaimer">
                Disclaimer
              </a>
              <a className="pill" href="/terms">
                Terms
              </a>
              <a className="pill" href="/privacy">
                Privacy
              </a>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

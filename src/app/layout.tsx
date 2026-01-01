import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { TradeSessionProvider } from "./providers/TradeSessionProvider";
import { TopNav } from "./components/TopNav";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";

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
        </TradeSessionProvider>

        {/* ✅ Vercel Analytics (separat, ok) */}
        <VercelAnalytics />
      </body>
    </html>
  );
}

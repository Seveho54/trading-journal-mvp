import type { Metadata } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TradeSessionProvider } from "./providers/TradeSessionProvider";
import { TopNav } from "./components/TopNav";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tradevion – Bitget Trading Analytics & Performance Dashboard",
  description:
    "Upload your Bitget CSV and instantly analyze performance, PnL, winrate, risk & symbols. No signup required.",
    icons: {
      icon: "Logo.png",
    },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        {/* Google Analytics (GA4) */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-SSNHPYR63"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-SSNHPYR63');
          `}
        </Script>
      </head>

      <body>
        <TradeSessionProvider>
          <TopNav />
          {children}
        </TradeSessionProvider>

        {/* Vercel Analytics */}
        <Analytics />
      </body>
    </html>
  );
}

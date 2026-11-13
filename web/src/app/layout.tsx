import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ConnectProvider } from "@/components/wallet";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Analytics } from "@vercel/analytics/next";

const sans = Hanken_Grotesk({ variable: "--font-hanken", subsets: ["latin"], display: "swap" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://circlesave-mezo.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "CircleSave: group savings circles on Mezo",
    template: "%s | CircleSave",
  },
  description:
    "Run your savings circle, tanda, susu or chit fund on Mezo. Members pay MUSD into a smart contract, the pot goes to whoever's turn it is, and every payment is on the record.",
  applicationName: "CircleSave",
  openGraph: {
    type: "website",
    siteName: "CircleSave",
    title: "CircleSave: group savings circles on Mezo",
    description: "Save together, take turns, and keep a record everyone can check. Paid in MUSD on Mezo.",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-ink px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        <Providers>
          <ConnectProvider>
            <SiteHeader />
            <main id="main" className="flex-1">
              {children}
            </main>
            <SiteFooter />
          </ConnectProvider>
        </Providers>
        <Analytics />
      </body>
    </html>
  );
}

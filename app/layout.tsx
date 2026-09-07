import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans, IBM_Plex_Mono, IBM_Plex_Serif } from "next/font/google";

import "./globals.css";

import THEME_SCRIPT from "./_components/theme-script";
import Toaster from "./_components/Toaster";
import SyncProvider from "./_components/SyncProvider";
import InstallPrompt from "./_components/InstallPrompt";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

const plexSerif = IBM_Plex_Serif({
  subsets: ["latin"],
  weight: ["500", "600"],
  variable: "--font-plex-serif",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#a5342a" },
    { media: "(prefers-color-scheme: dark)", color: "#d9695c" },
  ],
};

export const metadata: Metadata = {
  title: "Scrummy",
  description: "A small task tracker with traceability.",
  appleWebApp: {
    title: "Scrummy",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} ${plexSerif.variable}`}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>
        {children}
        <Toaster />
        <SyncProvider />
        <InstallPrompt />
      </body>
    </html>
  );
}

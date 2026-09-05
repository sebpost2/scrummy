import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Scrummy",
  description: "A small task tracker with traceability.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

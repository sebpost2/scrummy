"use client";

import { Toaster as SonnerToaster } from "sonner";

export default function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      theme="system"
      closeButton
      toastOptions={{
        style: {
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          borderRadius: "var(--radius-card)",
          fontSize: "0.8125rem",
        },
      }}
    />
  );
}

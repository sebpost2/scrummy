"use client";

import { Toaster as SonnerToaster } from "sonner";

export default function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      theme="system"
      closeButton
      // Clear the fixed mobile bottom tab bar (.mobile-nav, 64px+ tall, shown at
      // <=720px). Sonner's own mobileOffset only kicks in under its internal
      // 600px breakpoint, which doesn't match this app's 720px breakpoint, so
      // both offset and mobileOffset are set the same to cover 601-720px too.
      offset={{ bottom: "calc(64px + var(--space-3))" }}
      mobileOffset={{ bottom: "calc(64px + var(--space-3))" }}
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

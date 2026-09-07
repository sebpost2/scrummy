"use client";

import { useEffect, useState } from "react";

export function detectInstallState(userAgent: string, isStandalone: boolean) {
  return { isIOS: /iPad|iPhone|iPod/.test(userAgent), isStandalone };
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

export default function InstallPrompt() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const state = detectInstallState(navigator.userAgent, standalone);
    setIsIOS(state.isIOS);
    setIsStandalone(state.isStandalone);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (isStandalone) return null;
  if (!isIOS && !deferredPrompt) return null;

  return (
    <div style={{ padding: "0.75rem 1rem", fontSize: "0.8125rem" }}>
      {deferredPrompt ? (
        <button
          onClick={async () => {
            await deferredPrompt.prompt();
            setDeferredPrompt(null);
          }}
        >
          Install Scrummy
        </button>
      ) : (
        <p>To install Scrummy, tap the Share button, then &quot;Add to Home Screen&quot;.</p>
      )}
    </div>
  );
}

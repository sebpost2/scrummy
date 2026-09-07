"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import IconButton from "@/app/_components/IconButton";

const DISMISSED_KEY = "scrummy:install-dismissed";

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
  // ponytail: dismissal is permanent (no re-prompt after N days) — revisit if
  // product wants periodic re-nagging.
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const state = detectInstallState(navigator.userAgent, standalone);
    setIsIOS(state.isIOS);
    setIsStandalone(state.isStandalone);
    setDismissed(localStorage.getItem(DISMISSED_KEY) === "1");

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (isStandalone || dismissed) return null;
  if (!isIOS && !deferredPrompt) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    setDismissed(true);
  };

  return (
    <div className="install-prompt">
      {deferredPrompt ? (
        <p className="install-prompt__text">Install Scrummy for quick, offline-ready access.</p>
      ) : (
        <p className="install-prompt__text">
          To install Scrummy, tap the Share button, then &quot;Add to Home Screen&quot;.
        </p>
      )}
      <div className="install-prompt__actions">
        {deferredPrompt && (
          <button
            className="button"
            onClick={async () => {
              await deferredPrompt.prompt();
              setDeferredPrompt(null);
            }}
          >
            Install
          </button>
        )}
        <IconButton label="Dismiss" onClick={dismiss}>
          <X size={14} />
        </IconButton>
      </div>
    </div>
  );
}

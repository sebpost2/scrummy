import { flushOutbox } from "@/lib/sync/replay";

const SYNC_TAG = "scrummy-outbox";

export function registerSyncTriggers(): () => void {
  const onOnline = () => void flushOutbox();
  const onVisible = () => {
    if (document.visibilityState === "visible") void flushOutbox();
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        const reg = registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };
        return reg.sync?.register(SYNC_TAG);
      })
      .catch(() => {
        // No Background Sync support (e.g. iOS Safari) — the online/visibility
        // listeners above are the fallback, per the spec's documented ceiling.
      });
  }

  void flushOutbox();

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}

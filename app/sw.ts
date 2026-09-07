// app/sw.ts
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

import { flushOutbox } from "../lib/sync/replay";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// Background Sync: fires even if no tab is open, on browsers that support it
// (Chrome/Edge desktop + Android). iOS Safari has no Background Sync API, so
// this listener simply never fires there — the online/visibilitychange
// listeners registered from the page (lib/sync/triggers.ts) are the fallback.
self.addEventListener("sync", (event) => {
  const syncEvent = event as unknown as { tag: string; waitUntil(promise: Promise<unknown>): void };
  if (syncEvent.tag === "scrummy-outbox") {
    syncEvent.waitUntil(flushOutbox());
  }
});

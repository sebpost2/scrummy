"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { registerSyncTriggers } from "@/lib/sync/triggers";
import { listPending } from "@/lib/sync/outbox";

export default function SyncProvider() {
  useEffect(() => {
    const unregister = registerSyncTriggers();

    const interval = setInterval(async () => {
      const failed = (await listPending()).filter((item) => item.status === "failed-permanent");
      for (const item of failed) {
        toast.error(`Couldn't sync a change: ${item.failureMessage ?? "unknown error"}`, { id: item.id });
      }
    }, 5000);

    return () => {
      unregister();
      clearInterval(interval);
    };
  }, []);

  return null;
}

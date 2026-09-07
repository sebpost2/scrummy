// lib/sync/replay.ts
import { listPending, markStatus, remove } from "@/lib/sync/outbox";

export async function flushOutbox(): Promise<void> {
  const items = await listPending();

  for (const item of items) {
    if (item.status === "failed-permanent") continue;

    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        type: item.type,
        args: item.args,
        clientTimestamp: item.clientTimestamp,
      }),
    });

    if (response.ok) {
      await remove(item.id);
      continue;
    }

    const body = (await response.json().catch(() => ({}))) as { permanent?: boolean; error?: string };
    if (body.permanent) {
      await markStatus(item.id, "failed-permanent", body.error ?? "UNKNOWN_ERROR");
      continue;
    }

    // Transient failure (still offline, 5xx): stop here, preserving order —
    // don't let a later item sync ahead of one that hasn't yet.
    return;
  }
}

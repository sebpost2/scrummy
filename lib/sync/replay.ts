// lib/sync/replay.ts
import { listPending, markStatus, recordFailedAttempt, remove } from "@/lib/sync/outbox";

// After this many transient failures an item is given up on, so one
// genuinely-stuck mutation stops blocking everything queued behind it.
const MAX_ATTEMPTS = 5;

// ponytail: single-flight guard. flushOutbox has four triggers (mount, online,
// visibilitychange, the SW sync event) plus StrictMode's double-invoke, and two
// overlapping runs would POST the same item twice — the server's dedup is
// check-then-act, so both can pass it. Per-context only: the page and the
// service worker each have their own guard (markApplied swallows the resulting
// P2002 for that case).
let inFlight: Promise<void> | null = null;

export async function flushOutbox(): Promise<void> {
  if (inFlight) return inFlight;
  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function run(): Promise<void> {
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
    // don't let a later item sync ahead of one that hasn't yet. Unless it has
    // failed this way too many times, in which case it isn't transient and
    // holding the whole queue hostage to it helps nobody.
    if ((await recordFailedAttempt(item.id)) >= MAX_ATTEMPTS) {
      await markStatus(item.id, "failed-permanent", "Repeated sync failures — needs attention");
      continue;
    }
    return;
  }
}

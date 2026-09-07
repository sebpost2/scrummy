import { get, set } from "idb-keyval";

import type { OutboxItem, OutboxStatus } from "@/lib/sync/types";

const STORE_KEY = "scrummy-outbox";

// ponytail: enqueue/markStatus/remove each do a read-modify-write; concurrent
// calls (e.g. Promise.all over several removes) raced on stale reads and
// clobbered each other's writes. Serialize them through one queue. Upgrade to
// per-item locking only if outbox writes become a throughput bottleneck.
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task);
  queue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function readAll(): Promise<OutboxItem[]> {
  return (await get<OutboxItem[]>(STORE_KEY)) ?? [];
}

async function writeAll(items: OutboxItem[]): Promise<void> {
  await set(STORE_KEY, items);
}

export async function enqueue(item: Omit<OutboxItem, "status">): Promise<void> {
  await serialize(async () => {
    const items = await readAll();
    items.push({ ...item, status: "pending" });
    await writeAll(items);
  });
}

export async function listPending(): Promise<OutboxItem[]> {
  const items = await readAll();
  return [...items].sort((a, b) => a.clientTimestamp - b.clientTimestamp);
}

export async function markStatus(id: string, status: OutboxStatus, failureMessage?: string): Promise<void> {
  await serialize(async () => {
    const items = await readAll();
    const next = items.map((item) => (item.id === id ? { ...item, status, failureMessage } : item));
    await writeAll(next);
  });
}

/** Counts one transient failure against an item (it stays pending). Returns the new count. */
export async function recordFailedAttempt(id: string): Promise<number> {
  return serialize(async () => {
    const items = await readAll();
    let attempts = 0;
    const next = items.map((item) => {
      if (item.id !== id) return item;
      attempts = (item.attempts ?? 0) + 1;
      return { ...item, attempts };
    });
    await writeAll(next);
    return attempts;
  });
}

export async function remove(id: string): Promise<void> {
  await serialize(async () => {
    const items = await readAll();
    await writeAll(items.filter((item) => item.id !== id));
  });
}

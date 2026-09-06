import { get, set } from "idb-keyval";

import type { OutboxItem, OutboxStatus } from "@/lib/sync/types";

const STORE_KEY = "scrummy-outbox";

async function readAll(): Promise<OutboxItem[]> {
  return (await get<OutboxItem[]>(STORE_KEY)) ?? [];
}

async function writeAll(items: OutboxItem[]): Promise<void> {
  await set(STORE_KEY, items);
}

export async function enqueue(item: Omit<OutboxItem, "status">): Promise<void> {
  const items = await readAll();
  items.push({ ...item, status: "pending" });
  await writeAll(items);
}

export async function listPending(): Promise<OutboxItem[]> {
  const items = await readAll();
  return [...items].sort((a, b) => a.clientTimestamp - b.clientTimestamp);
}

export async function markStatus(id: string, status: OutboxStatus, failureMessage?: string): Promise<void> {
  const items = await readAll();
  const next = items.map((item) => (item.id === id ? { ...item, status, failureMessage } : item));
  await writeAll(next);
}

export async function remove(id: string): Promise<void> {
  const items = await readAll();
  await writeAll(items.filter((item) => item.id !== id));
}

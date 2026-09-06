import { enqueue } from "@/lib/sync/outbox";
import type { OutboxMutationType } from "@/lib/sync/types";

function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError;
}

export async function callAction<T>(
  actionFn: () => Promise<T>,
  meta: { type: OutboxMutationType; args: unknown[]; entityId: string },
): Promise<T | undefined> {
  try {
    return await actionFn();
  } catch (err) {
    if (!isNetworkFailure(err)) throw err;

    await enqueue({
      id: crypto.randomUUID(),
      type: meta.type,
      args: meta.args,
      clientTimestamp: Date.now(),
      entityId: meta.entityId,
    });
    return undefined;
  }
}

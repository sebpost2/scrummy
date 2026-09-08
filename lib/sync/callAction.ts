import { toast } from "@/app/_components/toast";
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

// Shared by every client component whose action returns a { ok, message }
// result rather than throwing. Handles the "queued offline" and "rejected"
// toasts; the caller still handles its own success toast/state, since that
// varies (some carry extra fields, e.g. a regenerated invite URL).
export async function callActionForResult<T extends { ok: boolean; message?: string }>(
  // `| void` covers actions that redirect() on success instead of returning a result.
  actionFn: () => Promise<T | undefined | void>,
  meta: { type: OutboxMutationType; args: unknown[]; entityId: string },
  offlineMessage: string,
): Promise<T | undefined> {
  const res = await callAction(actionFn, meta);
  if (!res) {
    toast.info(offlineMessage);
    return undefined;
  }
  if (!res.ok && res.message) toast.error(res.message);
  return res;
}

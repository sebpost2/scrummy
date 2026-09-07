// tests/sync/replay.test.ts
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { enqueue, listPending, remove } from "@/lib/sync/outbox";
import { flushOutbox } from "@/lib/sync/replay";

beforeEach(async () => {
  const pending = await listPending();
  await Promise.all(pending.map((item) => remove(item.id)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("flushOutbox", () => {
  it("removes an item from the outbox once it syncs successfully", async () => {
    await enqueue({ id: "a", type: "updateTaskStatus", args: ["t1", "DONE"], clientTimestamp: 1, entityId: "t1" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));

    await flushOutbox();

    expect(await listPending()).toHaveLength(0);
  });

  it("stops at the first transient failure, leaving it and later items pending", async () => {
    await enqueue({ id: "a", type: "updateTaskStatus", args: [], clientTimestamp: 1, entityId: "t1" });
    await enqueue({ id: "b", type: "updateTaskStatus", args: [], clientTimestamp: 2, entityId: "t1" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ permanent: false }), { status: 502 })));

    await flushOutbox();

    const pending = await listPending();
    expect(pending.map((i) => i.id)).toEqual(["a", "b"]);
    expect(pending[0].status).toBe("pending");
  });

  it("marks a permanent failure and continues to the next item", async () => {
    await enqueue({ id: "a", type: "updateTaskTitle", args: [], clientTimestamp: 1, entityId: "t1" });
    await enqueue({ id: "b", type: "updateTaskStatus", args: [], clientTimestamp: 2, entityId: "t1" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ permanent: true, error: "TITLE_REQUIRED" }), { status: 400 }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    await flushOutbox();

    const pending = await listPending();
    expect(pending.map((i) => i.id)).toEqual(["a"]);
    expect(pending[0]).toMatchObject({ status: "failed-permanent", failureMessage: "TITLE_REQUIRED" });
  });
});

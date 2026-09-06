import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { callAction } from "@/lib/sync/callAction";
import { listPending, remove } from "@/lib/sync/outbox";

beforeEach(async () => {
  const pending = await listPending();
  await Promise.all(pending.map((item) => remove(item.id)));
});

describe("callAction", () => {
  it("returns the result and queues nothing when the action succeeds", async () => {
    const action = vi.fn().mockResolvedValue("ok");

    const result = await callAction(action, { type: "updateTaskStatus", args: ["t1", "DONE"], entityId: "t1" });

    expect(result).toBe("ok");
    expect(await listPending()).toHaveLength(0);
  });

  it("queues the mutation and returns undefined on a network failure", async () => {
    const action = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await callAction(action, { type: "updateTaskStatus", args: ["t1", "DONE"], entityId: "t1" });

    expect(result).toBeUndefined();
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ type: "updateTaskStatus", args: ["t1", "DONE"], entityId: "t1" });
  });

  it("rethrows a non-network error instead of queuing it", async () => {
    const action = vi.fn().mockRejectedValue(new Error("TITLE_REQUIRED"));

    await expect(
      callAction(action, { type: "updateTaskTitle", args: ["t1", ""], entityId: "t1" }),
    ).rejects.toThrow("TITLE_REQUIRED");
    expect(await listPending()).toHaveLength(0);
  });
});

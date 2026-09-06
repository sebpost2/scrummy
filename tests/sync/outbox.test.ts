import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";

import { enqueue, listPending, markStatus, remove } from "@/lib/sync/outbox";

beforeEach(async () => {
  const pending = await listPending();
  await Promise.all(pending.map((item) => remove(item.id)));
});

describe("outbox", () => {
  it("enqueues an item as pending and lists it", async () => {
    await enqueue({ id: "a", type: "updateTaskStatus", args: ["t1", "DONE"], clientTimestamp: 1, entityId: "t1" });

    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id: "a", status: "pending" });
  });

  it("lists items ordered by clientTimestamp ascending", async () => {
    await enqueue({ id: "b", type: "updateTaskStatus", args: [], clientTimestamp: 200, entityId: "t1" });
    await enqueue({ id: "a", type: "updateTaskStatus", args: [], clientTimestamp: 100, entityId: "t1" });

    const pending = await listPending();
    expect(pending.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("updates status and can record a failure message", async () => {
    await enqueue({ id: "a", type: "updateTaskStatus", args: [], clientTimestamp: 1, entityId: "t1" });

    await markStatus("a", "failed-permanent", "TITLE_REQUIRED");

    const pending = await listPending();
    expect(pending.find((i) => i.id === "a")).toMatchObject({
      status: "failed-permanent",
      failureMessage: "TITLE_REQUIRED",
    });
  });

  it("removes an item", async () => {
    await enqueue({ id: "a", type: "updateTaskStatus", args: [], clientTimestamp: 1, entityId: "t1" });
    await remove("a");

    expect(await listPending()).toHaveLength(0);
  });
});

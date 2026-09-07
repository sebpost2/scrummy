// tests/sync/triggers.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/sync/replay", () => ({ flushOutbox: vi.fn().mockResolvedValue(undefined) }));

import { registerSyncTriggers } from "@/lib/sync/triggers";
import { flushOutbox } from "@/lib/sync/replay";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registerSyncTriggers", () => {
  it("flushes immediately on registration and again on the online event", () => {
    const unregister = registerSyncTriggers();

    expect(flushOutbox).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("online"));
    expect(flushOutbox).toHaveBeenCalledTimes(2);

    unregister();
    window.dispatchEvent(new Event("online"));
    expect(flushOutbox).toHaveBeenCalledTimes(2);
  });
});

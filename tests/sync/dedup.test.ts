import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { alreadyApplied, markApplied } from "@/lib/sync/dedup";

let mutationId: string | undefined;

afterEach(async () => {
  if (mutationId) await prisma.syncedMutation.deleteMany({ where: { id: mutationId } });
  mutationId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("dedup", () => {
  it("reports not-applied before markApplied, and applied after", async () => {
    mutationId = `dedup-${Date.now()}`;
    expect(await alreadyApplied(mutationId)).toBe(false);

    await markApplied(mutationId);

    expect(await alreadyApplied(mutationId)).toBe(true);
  });
});

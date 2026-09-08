import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { hashSessionToken, issueSessionToken } from "@/lib/auth/session";

import { createTestUser, cleanupTestData } from "../helpers";

afterEach(cleanupTestData);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("hashSessionToken", () => {
  it("is deterministic for the same input", () => {
    expect(hashSessionToken("abc")).toBe(hashSessionToken("abc"));
  });

  it("differs for different input", () => {
    expect(hashSessionToken("abc")).not.toBe(hashSessionToken("def"));
  });
});

describe("issueSessionToken", () => {
  it("creates a Session row keyed by the hash of the returned token, not the token itself", async () => {
    const user = await createTestUser({ name: "Test User" });

    const { token, expiresAt } = await issueSessionToken(prisma, user.id);

    const row = await prisma.session.findUnique({ where: { tokenHash: hashSessionToken(token) } });
    expect(row).not.toBeNull();
    expect(row?.userId).toBe(user.id);
    expect(row?.expiresAt.getTime()).toBe(expiresAt.getTime());

    const byRawToken = await prisma.session.findUnique({ where: { tokenHash: token } });
    expect(byRawToken).toBeNull();
  });
});

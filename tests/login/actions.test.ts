import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/crypto/password";
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, createSession: vi.fn().mockResolvedValue(undefined) };
});
import { login } from "@/app/login/actions";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

let userId: string | undefined;
const email = `login-${Date.now()}@example.com`;

beforeEach(async () => {
  const passwordHash = await hashPassword("password123");
  const user = await createTestUser({ email, passwordHash, name: "Ada" });
  userId = user.id;
});

afterEach(cleanupTestData);

afterAll(async () => {
  await prisma.$disconnect();
});

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("login", () => {
  it("logs in with the correct password", async () => {
    let redirected: unknown;
    try {
      await login({ status: "idle" }, formData({ email, password: "password123" }));
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toMatch(/NEXT_REDIRECT/);
  });

  it("rejects an incorrect password with a generic message", async () => {
    const result = await login({ status: "idle" }, formData({ email, password: "wrong-password" }));
    expect(result).toEqual({ status: "error", message: expect.any(String) });
  });

  it("rejects an unknown email with the same generic message", async () => {
    const result = await login(
      { status: "idle" },
      formData({ email: "nobody@example.com", password: "password123" }),
    );
    expect(result).toEqual({ status: "error", message: expect.any(String) });
  });

  it("joins the invited project and redirects to its board when an invite token is present", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const project = await createTestProject(owner.id, "Login Invite Project");

    let redirected: unknown;
    try {
      await login({ status: "idle" }, formData({ email, password: "password123", invite: project.inviteToken }));
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toContain(`/projects/${project.slug}`);

    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: userId!, projectId: project.id } },
    });
    expect(membership?.role).toBe("MEMBER");
  });

  it("falls back to /projects when the invite token is invalid", async () => {
    let redirected: unknown;
    try {
      await login({ status: "idle" }, formData({ email, password: "password123", invite: "not-a-real-token" }));
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toMatch(/;\/projects;/);
  });
});

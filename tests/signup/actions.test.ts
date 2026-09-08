import { describe, it, expect, afterEach, afterAll, vi } from "vitest";

import { prisma } from "@/lib/db/prisma";
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, createSession: vi.fn().mockResolvedValue(undefined) };
});
import { createAccount } from "@/app/signup/actions";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

let createdEmail: string | undefined;

afterEach(async () => {
  if (createdEmail) await prisma.user.deleteMany({ where: { email: createdEmail } });
  createdEmail = undefined;
  await cleanupTestData();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

describe("createAccount", () => {
  it("creates a User with a hashed password on valid input", async () => {
    const email = `signup-${Date.now()}@example.com`;
    createdEmail = email;

    let redirected: unknown;
    try {
      await createAccount(
        { status: "idle" },
        formData({ email, password: "password123", confirmPassword: "password123", name: "Ada" }),
      );
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toMatch(/NEXT_REDIRECT/);

    const user = await prisma.user.findUnique({ where: { email } });
    expect(user).not.toBeNull();
    expect(user?.name).toBe("Ada");
    expect(user?.passwordHash).not.toBe("password123");
  });

  it("rejects a password shorter than 8 characters", async () => {
    const email = `signup-short-${Date.now()}@example.com`;
    const result = await createAccount(
      { status: "idle" },
      formData({ email, password: "short", confirmPassword: "short", name: "Ada" }),
    );
    expect(result.status).toBe("error");
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("rejects mismatched password confirmation", async () => {
    const email = `signup-mismatch-${Date.now()}@example.com`;
    const result = await createAccount(
      { status: "idle" },
      formData({ email, password: "password123", confirmPassword: "different123", name: "Ada" }),
    );
    expect(result.status).toBe("error");
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
  });

  it("rejects a duplicate email with the same generic message", async () => {
    const email = `signup-dupe-${Date.now()}@example.com`;
    createdEmail = email;
    let firstRedirect: unknown;
    try {
      await createAccount(
        { status: "idle" },
        formData({ email, password: "password123", confirmPassword: "password123", name: "Ada" }),
      );
    } catch (err) {
      firstRedirect = err;
    }
    expect((firstRedirect as { digest?: string } | undefined)?.digest).toMatch(/NEXT_REDIRECT/);

    const second = await createAccount(
      { status: "idle" },
      formData({ email, password: "password123", confirmPassword: "password123", name: "Ada 2" }),
    );
    expect(second.status).toBe("error");
  });

  it("joins the invited project and redirects to its board when an invite token is present", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const project = await createTestProject(owner.id, "Signup Invite Project");
    const email = `signup-invite-${Date.now()}@example.com`;
    createdEmail = email;

    let redirected: unknown;
    try {
      await createAccount(
        { status: "idle" },
        formData({
          email,
          password: "password123",
          confirmPassword: "password123",
          name: "Ada",
          invite: project.inviteToken,
        }),
      );
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toContain(`/projects/${project.slug}`);

    const user = await prisma.user.findUnique({ where: { email } });
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: user!.id, projectId: project.id } },
    });
    expect(membership?.role).toBe("MEMBER");
  });

  it("falls back to /projects when the invite token is invalid", async () => {
    const email = `signup-badinvite-${Date.now()}@example.com`;
    createdEmail = email;

    let redirected: unknown;
    try {
      await createAccount(
        { status: "idle" },
        formData({
          email,
          password: "password123",
          confirmPassword: "password123",
          name: "Ada",
          invite: "not-a-real-token",
        }),
      );
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toMatch(/;\/projects;/);
  });
});

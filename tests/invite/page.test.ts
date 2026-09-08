import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { prisma } from "@/lib/db/prisma";
let currentUser: { id: string; name: string; email: string } | null = null;
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, getSessionUser: vi.fn(async () => currentUser) };
});
import InvitePage from "@/app/invite/[token]/page";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

afterEach(async () => {
  await cleanupTestData();
  currentUser = null;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("InvitePage", () => {
  it("shows an invalid-link message for an unknown token", async () => {
    const element = await InvitePage({ params: Promise.resolve({ token: "does-not-exist" }) });
    const html = renderToStaticMarkup(element as ReactElement);
    expect(html).toContain("Invite link not found");
  });

  it("redirects an anonymous visitor to signup with the token attached", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const project = await createTestProject(owner.id, "Invite Project");
    currentUser = null;

    let redirected: unknown;
    try {
      await InvitePage({ params: Promise.resolve({ token: project.inviteToken }) });
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toContain(
      `/signup?invite=${project.inviteToken}`,
    );
  });

  it("joins a logged-in visitor and redirects to the project board", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const project = await createTestProject(owner.id, "Invite Project 2");
    const joiner = await createTestUser({ name: "Joiner" });
    currentUser = joiner;

    let redirected: unknown;
    try {
      await InvitePage({ params: Promise.resolve({ token: project.inviteToken }) });
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toContain(`/projects/${project.slug}`);

    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: joiner.id, projectId: project.id } },
    });
    expect(membership?.role).toBe("MEMBER");
  });
});

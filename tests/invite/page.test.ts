import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { prisma } from "@/lib/db/prisma";
import { createProject } from "@/lib/projects/mutations";

let currentUser: { id: string; name: string; email: string } | null = null;
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, getSessionUser: vi.fn(async () => currentUser) };
});
import InvitePage from "@/app/invite/[token]/page";

let ownerId: string | undefined;
let joinerId: string | undefined;
let projectId: string | undefined;

afterEach(async () => {
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  if (joinerId) await prisma.user.deleteMany({ where: { id: joinerId } });
  ownerId = joinerId = projectId = undefined;
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
    const owner = await prisma.user.create({
      data: { email: `invite-owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const project = await createProject(owner.id, "Invite Project");
    projectId = project.id;
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
    const owner = await prisma.user.create({
      data: { email: `invite-owner2-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const project = await createProject(owner.id, "Invite Project 2");
    projectId = project.id;
    const joiner = await prisma.user.create({
      data: { email: `invite-joiner-${Date.now()}@example.com`, passwordHash: "x", name: "Joiner" },
    });
    joinerId = joiner.id;
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

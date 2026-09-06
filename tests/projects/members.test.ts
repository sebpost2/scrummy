import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { prisma } from "@/lib/db/prisma";
import { createProject, addProjectMemberByEmail } from "@/lib/projects/mutations";
let ownerId: string | undefined;
let memberId: string | undefined;
let projectId: string | undefined;
let currentUserId: string | undefined;
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return {
    ...actual,
    requireUser: vi.fn(async () => ({ id: currentUserId, name: "Ada", email: "nav@example.com" })),
  };
});
import MembersPage from "@/app/projects/[slug]/members/page";

afterEach(async () => {
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  if (memberId) await prisma.user.deleteMany({ where: { id: memberId } });
  ownerId = memberId = projectId = currentUserId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("MembersPage", () => {
  it("lists current members for the owner", async () => {
    const owner = await prisma.user.create({
      data: { email: `members-owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const member = await prisma.user.create({
      data: { email: `members-member-${Date.now()}@example.com`, passwordHash: "x", name: "Member" },
    });
    memberId = member.id;
    const project = await createProject(owner.id, "Members Project");
    projectId = project.id;
    await addProjectMemberByEmail(owner.id, project.id, member.email);
    currentUserId = owner.id;

    const element = await MembersPage({ params: Promise.resolve({ slug: project.slug }) });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Owner");
    expect(html).toContain("Member");
  });

  it("returns notFound for a non-owner", async () => {
    const owner = await prisma.user.create({
      data: { email: `members-owner2-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const member = await prisma.user.create({
      data: { email: `members-member2-${Date.now()}@example.com`, passwordHash: "x", name: "Member" },
    });
    memberId = member.id;
    const project = await createProject(owner.id, "Members Project 2");
    projectId = project.id;
    await addProjectMemberByEmail(owner.id, project.id, member.email);
    currentUserId = member.id;

    let notFound: unknown;
    try {
      await MembersPage({ params: Promise.resolve({ slug: project.slug }) });
    } catch (err) {
      notFound = err;
    }
    expect((notFound as { digest?: string } | undefined)?.digest).toMatch(/NEXT_NOT_FOUND/);
  });
});

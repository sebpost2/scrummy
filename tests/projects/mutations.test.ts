import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { createProject, getProjectMembership, addProjectMemberByEmail } from "@/lib/projects/mutations";

let ownerId: string | undefined;
let memberId: string | undefined;
let projectId: string | undefined;

afterEach(async () => {
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  if (memberId) await prisma.user.deleteMany({ where: { id: memberId } });
  ownerId = memberId = projectId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createProject", () => {
  it("creates a Project and makes the creator its OWNER", async () => {
    const owner = await prisma.user.create({
      data: { email: `owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;

    const project = await createProject(owner.id, "My Project");
    projectId = project.id;

    expect(project.slug).toMatch(/^my-project-[a-f0-9]{6}$/);
    const membership = await getProjectMembership(owner.id, project.id);
    expect(membership?.role).toBe("OWNER");
  });
});

describe("addProjectMemberByEmail", () => {
  it("adds an existing user as a MEMBER", async () => {
    const owner = await prisma.user.create({
      data: { email: `owner2-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const member = await prisma.user.create({
      data: { email: `member-${Date.now()}@example.com`, passwordHash: "x", name: "Member" },
    });
    memberId = member.id;
    const project = await createProject(owner.id, "Shared Project");
    projectId = project.id;

    const result = await addProjectMemberByEmail(owner.id, project.id, member.email);

    expect(result.ok).toBe(true);
    const membership = await getProjectMembership(member.id, project.id);
    expect(membership?.role).toBe("MEMBER");
  });

  it("fails with a helpful message when no account exists for that email", async () => {
    const owner = await prisma.user.create({
      data: { email: `owner3-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const project = await createProject(owner.id, "Solo Project");
    projectId = project.id;

    const result = await addProjectMemberByEmail(owner.id, project.id, "nobody@example.com");

    expect(result).toEqual({ ok: false, message: expect.any(String) });
  });

  it("rejects a non-OWNER trying to add a member", async () => {
    const owner = await prisma.user.create({
      data: { email: `owner4-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const member = await prisma.user.create({
      data: { email: `member2-${Date.now()}@example.com`, passwordHash: "x", name: "Member" },
    });
    memberId = member.id;
    const project = await createProject(owner.id, "Locked Project");
    projectId = project.id;
    await addProjectMemberByEmail(owner.id, project.id, member.email);

    const result = await addProjectMemberByEmail(member.id, project.id, "someoneelse@example.com");

    expect(result).toEqual({ ok: false, message: expect.any(String) });
  });
});

import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";
import {
  createProject,
  getProjectMembership,
  addProjectMemberByEmail,
  removeProjectMember,
  renameProject,
  deleteProject,
  leaveProject,
  updateMemberRole,
} from "@/lib/projects/mutations";

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

  it("generates a unique invite token", async () => {
    const owner = await prisma.user.create({
      data: { email: `owner-invite-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;

    const project = await createProject(owner.id, "Invite Token Project");
    projectId = project.id;

    expect(project.inviteToken).toMatch(/^[a-f0-9]{32}$/);
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

describe("removeProjectMember", () => {
  it("lets an owner remove a member", async () => {
    const owner = await prisma.user.create({
      data: { email: `rm-owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const member = await prisma.user.create({
      data: { email: `rm-member-${Date.now()}@example.com`, passwordHash: "x", name: "Member" },
    });
    memberId = member.id;
    const project = await createProject(owner.id, "Removable Project");
    projectId = project.id;
    await addProjectMemberByEmail(owner.id, project.id, member.email);

    const result = await removeProjectMember(owner.id, project.id, member.id);

    expect(result).toEqual({ ok: true });
    expect(await getProjectMembership(member.id, project.id)).toBeNull();
  });

  it("rejects a non-owner", async () => {
    const owner = await prisma.user.create({
      data: { email: `rm-owner2-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const member = await prisma.user.create({
      data: { email: `rm-member2-${Date.now()}@example.com`, passwordHash: "x", name: "Member" },
    });
    memberId = member.id;
    const project = await createProject(owner.id, "Guarded Project");
    projectId = project.id;
    await addProjectMemberByEmail(owner.id, project.id, member.email);

    const result = await removeProjectMember(member.id, project.id, owner.id);

    expect(result).toEqual({ ok: false, message: expect.any(String) });
    expect(await getProjectMembership(owner.id, project.id)).not.toBeNull();
  });

  it("refuses to remove an owner", async () => {
    const owner = await prisma.user.create({
      data: { email: `rm-owner3-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const project = await createProject(owner.id, "Solo Owner Project");
    projectId = project.id;

    const result = await removeProjectMember(owner.id, project.id, owner.id);

    expect(result).toEqual({ ok: false, message: expect.any(String) });
    expect(await getProjectMembership(owner.id, project.id)).not.toBeNull();
  });
});

async function ownerAndMember(tag: string) {
  const owner = await prisma.user.create({
    data: { email: `${tag}-owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
  });
  ownerId = owner.id;
  const member = await prisma.user.create({
    data: { email: `${tag}-member-${Date.now()}@example.com`, passwordHash: "x", name: "Member" },
  });
  memberId = member.id;
  const project = await createProject(owner.id, `${tag} Project`);
  projectId = project.id;
  await addProjectMemberByEmail(owner.id, project.id, member.email);
  return { owner, member, project };
}

describe("renameProject", () => {
  it("lets an owner rename and rejects a member", async () => {
    const { owner, member, project } = await ownerAndMember("rename");

    expect(await renameProject(owner.id, project.id, "  New Name  ")).toEqual({ ok: true });
    expect((await prisma.project.findUnique({ where: { id: project.id } }))?.name).toBe("New Name");

    expect(await renameProject(member.id, project.id, "Nope")).toEqual({
      ok: false,
      message: expect.any(String),
    });
  });
});

describe("leaveProject", () => {
  it("lets a member leave", async () => {
    const { member, project } = await ownerAndMember("leave");
    expect(await leaveProject(member.id, project.id)).toEqual({ ok: true });
    expect(await getProjectMembership(member.id, project.id)).toBeNull();
  });

  it("blocks the only owner from leaving", async () => {
    const { owner, project } = await ownerAndMember("leave-owner");
    expect(await leaveProject(owner.id, project.id)).toEqual({
      ok: false,
      message: expect.any(String),
    });
  });
});

describe("updateMemberRole", () => {
  it("promotes a member to owner", async () => {
    const { owner, member, project } = await ownerAndMember("role");
    expect(await updateMemberRole(owner.id, project.id, member.id, "OWNER")).toEqual({ ok: true });
    expect((await getProjectMembership(member.id, project.id))?.role).toBe("OWNER");
  });

  it("won't demote the last owner", async () => {
    const { owner, project } = await ownerAndMember("role-last");
    expect(await updateMemberRole(owner.id, project.id, owner.id, "MEMBER")).toEqual({
      ok: false,
      message: expect.any(String),
    });
  });
});

describe("deleteProject", () => {
  it("lets an owner delete the project", async () => {
    const { owner, project } = await ownerAndMember("del");
    expect(await deleteProject(owner.id, project.id)).toEqual({ ok: true });
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull();
  });
});

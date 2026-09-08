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
  regenerateInviteToken,
  joinProjectByInviteToken,
} from "@/lib/projects/mutations";

import { createTestUser, createTestProject, trackProject, cleanupTestData } from "../helpers";

afterEach(cleanupTestData);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createProject", () => {
  it("creates a Project and makes the creator its OWNER", async () => {
    const owner = await createTestUser({ name: "Owner" });

    const project = await createTestProject(owner.id, "My Project");

    expect(project.slug).toMatch(/^my-project-[a-f0-9]{6}$/);
    const membership = await getProjectMembership(owner.id, project.id);
    expect(membership?.role).toBe("OWNER");
  });

  it("generates a unique invite token", async () => {
    const owner = await createTestUser({ name: "Owner" });

    const project = await createTestProject(owner.id, "Invite Token Project");

    expect(project.inviteToken).toMatch(/^[a-f0-9]{32}$/);
  });
});

describe("addProjectMemberByEmail", () => {
  it("adds an existing user as a MEMBER", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const member = await createTestUser({ name: "Member" });
    const project = await createTestProject(owner.id, "Shared Project");

    const result = await addProjectMemberByEmail(owner.id, project.id, member.email);

    expect(result.ok).toBe(true);
    const membership = await getProjectMembership(member.id, project.id);
    expect(membership?.role).toBe("MEMBER");
  });

  it("fails with a helpful message when no account exists for that email", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const project = await createTestProject(owner.id, "Solo Project");

    const result = await addProjectMemberByEmail(owner.id, project.id, "nobody@example.com");

    expect(result).toEqual({ ok: false, message: expect.any(String) });
  });

  it("rejects a non-OWNER trying to add a member", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const member = await createTestUser({ name: "Member" });
    const project = await createTestProject(owner.id, "Locked Project");
    await addProjectMemberByEmail(owner.id, project.id, member.email);

    const result = await addProjectMemberByEmail(member.id, project.id, "someoneelse@example.com");

    expect(result).toEqual({ ok: false, message: expect.any(String) });
  });
});

describe("removeProjectMember", () => {
  it("lets an owner remove a member", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const member = await createTestUser({ name: "Member" });
    const project = await createTestProject(owner.id, "Removable Project");
    await addProjectMemberByEmail(owner.id, project.id, member.email);

    const result = await removeProjectMember(owner.id, project.id, member.id);

    expect(result).toEqual({ ok: true });
    expect(await getProjectMembership(member.id, project.id)).toBeNull();
  });

  it("rejects a non-owner", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const member = await createTestUser({ name: "Member" });
    const project = await createTestProject(owner.id, "Guarded Project");
    await addProjectMemberByEmail(owner.id, project.id, member.email);

    const result = await removeProjectMember(member.id, project.id, owner.id);

    expect(result).toEqual({ ok: false, message: expect.any(String) });
    expect(await getProjectMembership(owner.id, project.id)).not.toBeNull();
  });

  it("refuses to remove an owner", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const project = await createTestProject(owner.id, "Solo Owner Project");

    const result = await removeProjectMember(owner.id, project.id, owner.id);

    expect(result).toEqual({ ok: false, message: expect.any(String) });
    expect(await getProjectMembership(owner.id, project.id)).not.toBeNull();
  });
});

async function ownerAndMember(tag: string) {
  const owner = await createTestUser({ name: "Owner" });
  const member = await createTestUser({ name: "Member" });
  const project = await createTestProject(owner.id, `${tag} Project`);
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

describe("regenerateInviteToken", () => {
  it("lets an owner regenerate the invite token", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const project = await createTestProject(owner.id, "Regen Project");

    const result = await regenerateInviteToken(owner.id, project.id);

    expect(result.ok).toBe(true);
    const updated = await prisma.project.findUnique({ where: { id: project.id } });
    expect(updated?.inviteToken).not.toBe(project.inviteToken);
  });

  it("rejects a non-owner", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const member = await createTestUser({ name: "Member" });
    const project = await createTestProject(owner.id, "Regen Guarded Project");
    await addProjectMemberByEmail(owner.id, project.id, member.email);

    const result = await regenerateInviteToken(member.id, project.id);

    expect(result).toEqual({ ok: false, message: expect.any(String) });
  });
});

describe("joinProjectByInviteToken", () => {
  it("adds the visitor as a MEMBER and returns the project slug", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const project = await createTestProject(owner.id, "Join Project");
    const joiner = await createTestUser({ name: "Joiner" });

    const result = await joinProjectByInviteToken(joiner.id, project.inviteToken);

    expect(result).toEqual({ ok: true, slug: project.slug });
    expect((await getProjectMembership(joiner.id, project.id))?.role).toBe("MEMBER");
  });

  it("returns ok:false for an unknown token", async () => {
    const owner = await createTestUser({ name: "Owner" });
    await createTestProject(owner.id, "Join Guarded Project");

    const result = await joinProjectByInviteToken(owner.id, "not-a-real-token");

    expect(result).toEqual({ ok: false });
  });

  it("is idempotent and never downgrades an existing owner", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const project = await createTestProject(owner.id, "Join Idempotent Project");

    await joinProjectByInviteToken(owner.id, project.inviteToken);
    await joinProjectByInviteToken(owner.id, project.inviteToken);

    expect((await getProjectMembership(owner.id, project.id))?.role).toBe("OWNER");
  });
});

describe("createProject — client-supplied id", () => {
  it("uses a client-supplied id when given (for offline-created projects)", async () => {
    const user = await createTestUser({ name: "Owner" });
    const clientId = `client-project-${Date.now()}`;

    const project = await createProject(user.id, "Offline Project", clientId);
    trackProject(project.id);

    expect(project.id).toBe(clientId);
  });
});

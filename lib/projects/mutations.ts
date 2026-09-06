import { randomBytes } from "node:crypto";

import type { Project, ProjectMember, ProjectRole } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

type Result = { ok: true } | { ok: false; message: string };

function ownerCount(projectId: string): Promise<number> {
  return prisma.projectMember.count({ where: { projectId, role: "OWNER" } });
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return base || "project";
}

export async function createProject(userId: string, name: string): Promise<Project> {
  const slug = `${slugify(name)}-${randomBytes(3).toString("hex")}`;
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ data: { name, slug, createdById: userId } });
    await tx.projectMember.create({ data: { userId, projectId: project.id, role: "OWNER" } });
    return project;
  });
}

export async function getProjectMembership(userId: string, projectId: string): Promise<ProjectMember | null> {
  return prisma.projectMember.findUnique({ where: { userId_projectId: { userId, projectId } } });
}

const CANNOT_ADD_MEMBER = "Couldn't add that person. Check they have an account, and that you own this project.";

export async function addProjectMemberByEmail(
  requestingUserId: string,
  projectId: string,
  email: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const requesterMembership = await getProjectMembership(requestingUserId, projectId);
  if (!requesterMembership || requesterMembership.role !== "OWNER") {
    return { ok: false, message: CANNOT_ADD_MEMBER };
  }

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return { ok: false, message: CANNOT_ADD_MEMBER };

  await prisma.projectMember.upsert({
    where: { userId_projectId: { userId: user.id, projectId } },
    update: {},
    create: { userId: user.id, projectId, role: "MEMBER" },
  });

  return { ok: true };
}

const CANNOT_REMOVE_MEMBER = "Couldn't remove that member. You must own this project, and owners can't be removed.";

export async function removeProjectMember(
  requestingUserId: string,
  projectId: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const requesterMembership = await getProjectMembership(requestingUserId, projectId);
  if (!requesterMembership || requesterMembership.role !== "OWNER") {
    return { ok: false, message: CANNOT_REMOVE_MEMBER };
  }

  const target = await getProjectMembership(targetUserId, projectId);
  if (!target || target.role === "OWNER") {
    return { ok: false, message: CANNOT_REMOVE_MEMBER };
  }

  await prisma.projectMember.delete({
    where: { userId_projectId: { userId: targetUserId, projectId } },
  });

  return { ok: true };
}

export async function renameProject(userId: string, projectId: string, name: string): Promise<Result> {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership || membership.role !== "OWNER") {
    return { ok: false, message: "Only an owner can rename this project." };
  }
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: "Project name is required." };

  await prisma.project.update({ where: { id: projectId }, data: { name: trimmed } });
  return { ok: true };
}

export async function deleteProject(userId: string, projectId: string): Promise<Result> {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership || membership.role !== "OWNER") {
    return { ok: false, message: "Only an owner can delete this project." };
  }

  await prisma.project.delete({ where: { id: projectId } });
  return { ok: true };
}

export async function leaveProject(userId: string, projectId: string): Promise<Result> {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership) return { ok: false, message: "You're not a member of this project." };

  if (membership.role === "OWNER" && (await ownerCount(projectId)) === 1) {
    return {
      ok: false,
      message: "You're the only owner. Make someone else an owner, or delete the project.",
    };
  }

  await prisma.projectMember.delete({ where: { userId_projectId: { userId, projectId } } });
  return { ok: true };
}

export async function updateMemberRole(
  requestingUserId: string,
  projectId: string,
  targetUserId: string,
  role: ProjectRole,
): Promise<Result> {
  const requester = await getProjectMembership(requestingUserId, projectId);
  if (!requester || requester.role !== "OWNER") {
    return { ok: false, message: "Only an owner can change roles." };
  }

  const target = await getProjectMembership(targetUserId, projectId);
  if (!target) return { ok: false, message: "That person isn't a member of this project." };
  if (target.role === role) return { ok: true };

  if (target.role === "OWNER" && (await ownerCount(projectId)) === 1) {
    return { ok: false, message: "You can't demote the last owner." };
  }

  await prisma.projectMember.update({
    where: { userId_projectId: { userId: targetUserId, projectId } },
    data: { role },
  });
  return { ok: true };
}

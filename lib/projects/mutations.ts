import { randomBytes } from "node:crypto";

import type { Project, ProjectMember } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

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

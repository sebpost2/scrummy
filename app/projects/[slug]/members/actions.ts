"use server";

import { revalidatePath } from "next/cache";

import { appOrigin } from "@/lib/auth/google";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { addProjectMemberByEmail, regenerateInviteToken, removeProjectMember } from "@/lib/projects/mutations";

export type AddMemberState = { status: "idle" } | { status: "error"; message: string };

export async function addMemberAction(slug: string, _prev: AddMemberState, formData: FormData): Promise<AddMemberState> {
  const user = await requireUser();
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return { status: "error", message: "Project not found." };

  const email = String(formData.get("email") ?? "").trim();
  const result = await addProjectMemberByEmail(user.id, project.id, email);
  if (!result.ok) return { status: "error", message: result.message };

  revalidatePath(`/projects/${slug}/members`);
  return { status: "idle" };
}

export async function removeMemberAction(
  slug: string,
  targetUserId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const user = await requireUser();
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return { ok: false, message: "Project not found." };

  const result = await removeProjectMember(user.id, project.id, targetUserId);
  if (result.ok) revalidatePath(`/projects/${slug}/members`);
  return result;
}

export async function regenerateInviteTokenAction(
  slug: string,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const user = await requireUser();
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return { ok: false, message: "Project not found." };

  const result = await regenerateInviteToken(user.id, project.id);
  if (!result.ok) return result;

  revalidatePath(`/projects/${slug}/members`);
  return { ok: true, url: `${appOrigin()}/invite/${result.token}` };
}

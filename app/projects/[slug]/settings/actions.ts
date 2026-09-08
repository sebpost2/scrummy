"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ProjectRole } from "@prisma/client";

import { requireUser } from "@/lib/auth/session";
import {
  renameProject,
  deleteProject,
  leaveProject,
  updateMemberRole,
} from "@/lib/projects/mutations";
import { getProjectBySlug } from "@/lib/projects/queries";

type Result = { ok: true } | { ok: false; message: string };

async function projectIdFor(slug: string): Promise<string | null> {
  const project = await getProjectBySlug(slug);
  return project?.id ?? null;
}

export type RenameState = { status: "idle" } | { status: "error"; message: string };

export async function renameProjectAction(
  slug: string,
  _prev: RenameState,
  formData: FormData,
): Promise<RenameState> {
  const user = await requireUser();
  const id = await projectIdFor(slug);
  if (!id) return { status: "error", message: "Project not found." };

  const res = await renameProject(user.id, id, String(formData.get("name") ?? ""));
  if (!res.ok) return { status: "error", message: res.message };

  revalidatePath(`/projects/${slug}/settings`);
  return { status: "idle" };
}

export async function updateMemberRoleAction(
  slug: string,
  targetUserId: string,
  role: ProjectRole,
): Promise<Result> {
  const user = await requireUser();
  const id = await projectIdFor(slug);
  if (!id) return { ok: false, message: "Project not found." };

  const res = await updateMemberRole(user.id, id, targetUserId, role);
  if (res.ok) revalidatePath(`/projects/${slug}/settings`);
  return res;
}

export async function deleteProjectAction(slug: string): Promise<Result | void> {
  const user = await requireUser();
  const id = await projectIdFor(slug);
  if (!id) return { ok: false, message: "Project not found." };

  const res = await deleteProject(user.id, id);
  if (!res.ok) return res;
  redirect("/projects");
}

export async function leaveProjectAction(slug: string): Promise<Result | void> {
  const user = await requireUser();
  const id = await projectIdFor(slug);
  if (!id) return { ok: false, message: "Project not found." };

  const res = await leaveProject(user.id, id);
  if (!res.ok) return res;
  redirect("/projects");
}

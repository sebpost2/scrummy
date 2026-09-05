"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { addProjectMemberByEmail } from "@/lib/projects/mutations";

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

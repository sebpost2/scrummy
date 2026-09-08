"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/auth/session";
import { getProjectBySlug } from "@/lib/projects/queries";
import { createTask } from "@/lib/tasks/mutations";

export type NewTaskState = { status: "idle" } | { status: "error"; message: string };

export async function createTaskAction(
  slug: string,
  _prev: NewTaskState,
  formData: FormData,
): Promise<NewTaskState> {
  const user = await requireUser();
  const project = await getProjectBySlug(slug);
  if (!project) return { status: "error", message: "Project not found." };

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { status: "error", message: "Title is required." };

  await createTask(user.id, project.id, { title });
  revalidatePath(`/projects/${slug}`);
  return { status: "idle" };
}

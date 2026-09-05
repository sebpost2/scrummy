"use server";

import { revalidatePath } from "next/cache";
import type { TaskPriority } from "@prisma/client";

import { requireUser } from "@/lib/auth/session";
import { reassignTask, updateTaskPriority, updateTaskDueDate, updateTaskLabels, addTaskComment } from "@/lib/tasks/mutations";

export async function reassignTaskAction(taskId: string, slug: string, assigneeId: string): Promise<void> {
  const user = await requireUser();
  await reassignTask(user.id, taskId, assigneeId || null);
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
}

export async function updatePriorityAction(taskId: string, slug: string, priority: TaskPriority): Promise<void> {
  const user = await requireUser();
  await updateTaskPriority(user.id, taskId, priority);
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
}

export async function updateDueDateAction(taskId: string, slug: string, dueDate: string): Promise<void> {
  const user = await requireUser();
  await updateTaskDueDate(user.id, taskId, dueDate ? new Date(dueDate) : null);
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
}

export async function updateLabelsAction(taskId: string, slug: string, labels: string): Promise<void> {
  const user = await requireUser();
  await updateTaskLabels(
    user.id,
    taskId,
    labels.split(",").map((l) => l.trim()).filter(Boolean),
  );
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
}

export type CommentState = { status: "idle" } | { status: "error"; message: string };

export async function addCommentAction(
  taskId: string,
  slug: string,
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const user = await requireUser();
  const comment = String(formData.get("comment") ?? "");
  try {
    await addTaskComment(user.id, taskId, comment);
  } catch {
    return { status: "error", message: "Comment can't be empty." };
  }
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
  return { status: "idle" };
}

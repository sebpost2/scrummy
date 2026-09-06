"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { requireUser } from "@/lib/auth/session";
import {
  reassignTask,
  updateTaskStatus,
  updateTaskPriority,
  updateTaskDueDate,
  updateTaskLabels,
  updateTaskTitle,
  updateTaskDescription,
  deleteTask,
  reorderTask,
  addTaskComment,
  editTaskComment,
  deleteTaskComment,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
} from "@/lib/tasks/mutations";

export async function updateTitleAction(taskId: string, slug: string, title: string): Promise<void> {
  const user = await requireUser();
  await updateTaskTitle(user.id, taskId, title);
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
}

export async function updateDescriptionAction(taskId: string, slug: string, description: string): Promise<void> {
  const user = await requireUser();
  await updateTaskDescription(user.id, taskId, description);
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
}

export async function deleteTaskAction(
  taskId: string,
  slug: string,
): Promise<{ ok: false; message: string } | void> {
  const user = await requireUser();
  try {
    await deleteTask(user.id, taskId);
  } catch {
    return { ok: false, message: "Couldn't delete the task." };
  }
  redirect(`/projects/${slug}`);
}

export async function reassignTaskAction(taskId: string, slug: string, assigneeId: string): Promise<void> {
  const user = await requireUser();
  await reassignTask(user.id, taskId, assigneeId || null);
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
}

export async function updateStatusAction(taskId: string, slug: string, status: TaskStatus): Promise<void> {
  const user = await requireUser();
  await updateTaskStatus(user.id, taskId, status);
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

export async function reorderTaskAction(taskId: string, slug: string, rank: number): Promise<void> {
  const user = await requireUser();
  await reorderTask(user.id, taskId, rank);
  revalidatePath(`/projects/${slug}`);
}

export async function editCommentAction(eventId: string, taskId: string, slug: string, comment: string): Promise<void> {
  const user = await requireUser();
  await editTaskComment(user.id, eventId, comment);
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
}

export async function deleteCommentAction(eventId: string, taskId: string, slug: string): Promise<void> {
  const user = await requireUser();
  await deleteTaskComment(user.id, eventId);
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
}

export async function addSubtaskAction(taskId: string, slug: string, title: string): Promise<void> {
  const user = await requireUser();
  await addSubtask(user.id, taskId, title);
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
}

export async function toggleSubtaskAction(subtaskId: string, taskId: string, slug: string, done: boolean): Promise<void> {
  const user = await requireUser();
  await toggleSubtask(user.id, subtaskId, done);
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
}

export async function deleteSubtaskAction(subtaskId: string, taskId: string, slug: string): Promise<void> {
  const user = await requireUser();
  await deleteSubtask(user.id, subtaskId);
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

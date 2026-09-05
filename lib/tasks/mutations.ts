import type { Task, TaskStatus, TaskPriority } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getProjectMembership } from "@/lib/projects/mutations";

async function requireProjectAccess(userId: string, projectId: string): Promise<void> {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership) throw new Error("NOT_A_MEMBER");
}

async function requireTaskAccess(userId: string, taskId: string): Promise<Task> {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("TASK_NOT_FOUND");
  await requireProjectAccess(userId, task.projectId);
  return task;
}

export async function createTask(
  userId: string,
  projectId: string,
  input: { title: string; description?: string },
): Promise<Task> {
  await requireProjectAccess(userId, projectId);
  const title = input.title.trim();
  if (!title) throw new Error("TITLE_REQUIRED");

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: { projectId, title, description: input.description, createdById: userId },
    });
    await tx.taskEvent.create({ data: { taskId: task.id, userId, type: "CREATED" } });
    return task;
  });
}

export async function updateTaskStatus(userId: string, taskId: string, status: TaskStatus): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  if (task.status === status) return task;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data: { status } });
    await tx.taskEvent.create({
      data: { taskId, userId, type: "STATUS_CHANGED", oldValue: task.status, newValue: status },
    });
    return updated;
  });
}

export async function reassignTask(userId: string, taskId: string, assigneeId: string | null): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  if (assigneeId) {
    const assigneeMembership = await getProjectMembership(assigneeId, task.projectId);
    if (!assigneeMembership) throw new Error("ASSIGNEE_NOT_A_MEMBER");
  }
  if (task.assigneeId === assigneeId) return task;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data: { assigneeId } });
    await tx.taskEvent.create({
      data: {
        taskId,
        userId,
        type: "REASSIGNED",
        oldValue: task.assigneeId,
        newValue: assigneeId,
      },
    });
    return updated;
  });
}

export async function updateTaskPriority(userId: string, taskId: string, priority: TaskPriority): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  if (task.priority === priority) return task;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data: { priority } });
    await tx.taskEvent.create({
      data: { taskId, userId, type: "PRIORITY_CHANGED", oldValue: task.priority, newValue: priority },
    });
    return updated;
  });
}

export async function updateTaskDueDate(userId: string, taskId: string, dueDate: Date | null): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  const oldValue = task.dueDate?.toISOString() ?? null;
  const newValue = dueDate?.toISOString() ?? null;
  if (oldValue === newValue) return task;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data: { dueDate } });
    await tx.taskEvent.create({
      data: { taskId, userId, type: "DUE_DATE_CHANGED", oldValue, newValue },
    });
    return updated;
  });
}

export async function updateTaskLabels(userId: string, taskId: string, labels: string[]): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  const cleaned = labels.map((l) => l.trim()).filter(Boolean);
  const oldValue = task.labels.join(",");
  const newValue = cleaned.join(",");
  if (oldValue === newValue) return task;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data: { labels: cleaned } });
    await tx.taskEvent.create({
      data: { taskId, userId, type: "LABELS_CHANGED", oldValue, newValue },
    });
    return updated;
  });
}

export async function addTaskComment(userId: string, taskId: string, comment: string): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  const trimmed = comment.trim();
  if (!trimmed) throw new Error("COMMENT_REQUIRED");

  await prisma.taskEvent.create({
    data: { taskId, userId, type: "COMMENTED", comment: trimmed },
  });
  return task;
}

import type { Task, TaskStatus, TaskPriority, TaskEventType, Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { notifyAssigned, notifyMentions } from "@/lib/notifications/mutations";
import { getProjectMembership } from "@/lib/projects/mutations";
import { isNewer } from "@/lib/sync/lww";

// Upper bounds on free-text input, enforced server-side so a crafted request
// can't store a multi-megabyte field. Generous vs. any real use.
const LIMITS = {
  title: 500,
  description: 20_000,
  comment: 10_000,
  labelCount: 50,
  labelLen: 100,
  subtaskTitle: 500,
  mentions: 50,
} as const;

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

async function latestEventTimestamp(taskId: string, type: TaskEventType): Promise<Date | null> {
  const event = await prisma.taskEvent.findFirst({
    where: { taskId, type },
    orderBy: { clientTimestamp: "desc" },
  });
  return event?.clientTimestamp ?? null;
}

// Shared by every task field that can be edited offline and later synced.
// LWW = last-write-wins: if a newer edit already landed for this field, the
// incoming one is recorded as an overwritten TaskEvent instead of applied.
async function applyLwwFieldChange(
  task: Task,
  userId: string,
  type: TaskEventType,
  data: Prisma.TaskUncheckedUpdateInput,
  oldValue: string | null,
  newValue: string | null,
  clientTimestamp: Date,
): Promise<Task> {
  const current = await latestEventTimestamp(task.id, type);
  if (!isNewer(clientTimestamp, current)) {
    await prisma.taskEvent.create({
      data: {
        taskId: task.id,
        userId,
        type,
        oldValue,
        newValue,
        clientTimestamp,
        comment: "overwritten by a newer edit made elsewhere",
      },
    });
    return task;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: task.id }, data });
    await tx.taskEvent.create({ data: { taskId: task.id, userId, type, oldValue, newValue, clientTimestamp } });
    return updated;
  });
}

export async function createTask(
  userId: string,
  projectId: string,
  input: { title: string; description?: string; id?: string; rank?: number },
): Promise<Task> {
  await requireProjectAccess(userId, projectId);
  const title = input.title.trim();
  if (!title) throw new Error("TITLE_REQUIRED");
  if (title.length > LIMITS.title) throw new Error("TITLE_TOO_LONG");
  if (input.description && input.description.length > LIMITS.description) {
    throw new Error("DESCRIPTION_TOO_LONG");
  }

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        id: input.id,
        projectId,
        title,
        description: input.description,
        createdById: userId,
        rank: input.rank ?? Date.now() / 1000,
      },
    });
    await tx.taskEvent.create({
      data: { taskId: task.id, userId, type: "CREATED", clientTimestamp: new Date() },
    });
    return task;
  });
}

export async function reorderTask(
  userId: string,
  taskId: string,
  rank: number,
  clientTimestamp: Date = new Date(),
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  if (!isNewer(clientTimestamp, task.rankUpdatedAt)) return task;

  return prisma.task.update({ where: { id: taskId }, data: { rank, rankUpdatedAt: clientTimestamp } });
}

export async function updateTaskTitle(userId: string, taskId: string, title: string): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  const trimmed = title.trim();
  if (!trimmed) throw new Error("TITLE_REQUIRED");
  if (trimmed.length > LIMITS.title) throw new Error("TITLE_TOO_LONG");
  if (task.title === trimmed) return task;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data: { title: trimmed } });
    await tx.taskEvent.create({
      data: { taskId, userId, type: "EDITED", oldValue: task.title, newValue: trimmed },
    });
    return updated;
  });
}

export async function updateTaskDescription(userId: string, taskId: string, description: string): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  const next = description.trim() || null;
  if (next && next.length > LIMITS.description) throw new Error("DESCRIPTION_TOO_LONG");
  if ((task.description ?? null) === next) return task;

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data: { description: next } });
    await tx.taskEvent.create({ data: { taskId, userId, type: "EDITED" } });
    return updated;
  });
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  await requireTaskAccess(userId, taskId);
  await prisma.task.delete({ where: { id: taskId } });
}

export async function updateTaskStatus(
  userId: string,
  taskId: string,
  status: TaskStatus,
  clientTimestamp: Date = new Date(),
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  if (task.status === status) return task;

  return applyLwwFieldChange(task, userId, "STATUS_CHANGED", { status }, task.status, status, clientTimestamp);
}

export async function reassignTask(
  userId: string,
  taskId: string,
  assigneeId: string | null,
  clientTimestamp: Date = new Date(),
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  if (assigneeId) {
    const assigneeMembership = await getProjectMembership(assigneeId, task.projectId);
    if (!assigneeMembership) throw new Error("ASSIGNEE_NOT_A_MEMBER");
  }
  if (task.assigneeId === assigneeId) return task;

  const updated = await applyLwwFieldChange(
    task,
    userId,
    "REASSIGNED",
    { assigneeId },
    task.assigneeId,
    assigneeId,
    clientTimestamp,
  );
  if (assigneeId && updated.assigneeId === assigneeId) {
    try {
      await notifyAssigned(userId, taskId, assigneeId);
    } catch (err) {
      console.error("notifyAssigned failed", err);
    }
  }
  return updated;
}

export async function updateTaskPriority(
  userId: string,
  taskId: string,
  priority: TaskPriority,
  clientTimestamp: Date = new Date(),
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  if (task.priority === priority) return task;

  return applyLwwFieldChange(task, userId, "PRIORITY_CHANGED", { priority }, task.priority, priority, clientTimestamp);
}

export async function updateTaskDueDate(
  userId: string,
  taskId: string,
  dueDate: Date | null,
  clientTimestamp: Date = new Date(),
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  const oldValue = task.dueDate?.toISOString() ?? null;
  const newValue = dueDate?.toISOString() ?? null;
  if (oldValue === newValue) return task;

  return applyLwwFieldChange(task, userId, "DUE_DATE_CHANGED", { dueDate }, oldValue, newValue, clientTimestamp);
}

export async function updateTaskLabels(
  userId: string,
  taskId: string,
  labels: string[],
  clientTimestamp: Date = new Date(),
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  const cleaned = labels.map((l) => l.trim()).filter(Boolean);
  if (cleaned.length > LIMITS.labelCount || cleaned.some((l) => l.length > LIMITS.labelLen)) {
    throw new Error("TOO_MANY_LABELS");
  }
  const oldValue = task.labels.join(",");
  const newValue = cleaned.join(",");
  if (oldValue === newValue) return task;

  return applyLwwFieldChange(task, userId, "LABELS_CHANGED", { labels: cleaned }, oldValue, newValue, clientTimestamp);
}

export async function addTaskComment(
  userId: string,
  taskId: string,
  comment: string,
  mentionedUserIds: string[] = [],
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  const trimmed = comment.trim();
  if (!trimmed) throw new Error("COMMENT_REQUIRED");
  if (trimmed.length > LIMITS.comment) throw new Error("COMMENT_TOO_LONG");
  if (mentionedUserIds.length > LIMITS.mentions) throw new Error("TOO_MANY_MENTIONS");

  await prisma.taskEvent.create({
    data: { taskId, userId, type: "COMMENTED", comment: trimmed },
  });

  if (mentionedUserIds.length > 0) {
    try {
      await notifyMentions(userId, task.projectId, taskId, mentionedUserIds);
    } catch (err) {
      console.error("notifyMentions failed", err);
    }
  }

  return task;
}

async function requireOwnComment(userId: string, eventId: string) {
  const event = await prisma.taskEvent.findUnique({ where: { id: eventId } });
  if (!event || event.type !== "COMMENTED") throw new Error("COMMENT_NOT_FOUND");
  if (event.userId !== userId) throw new Error("NOT_COMMENT_AUTHOR");
  await requireTaskAccess(userId, event.taskId);
  return event;
}

export async function editTaskComment(userId: string, eventId: string, comment: string): Promise<void> {
  const event = await requireOwnComment(userId, eventId);
  if (event.deletedAt) throw new Error("COMMENT_DELETED");
  const trimmed = comment.trim();
  if (!trimmed) throw new Error("COMMENT_REQUIRED");
  if (trimmed.length > LIMITS.comment) throw new Error("COMMENT_TOO_LONG");
  if (trimmed === event.comment) return;

  await prisma.taskEvent.update({
    where: { id: eventId },
    data: { comment: trimmed, editedAt: new Date() },
  });
}

export async function deleteTaskComment(userId: string, eventId: string): Promise<void> {
  const event = await requireOwnComment(userId, eventId);
  if (event.deletedAt) return;

  await prisma.taskEvent.update({
    where: { id: eventId },
    data: { deletedAt: new Date() },
  });
}

async function requireSubtaskAccess(userId: string, subtaskId: string) {
  const subtask = await prisma.subtask.findUnique({ where: { id: subtaskId } });
  if (!subtask) throw new Error("SUBTASK_NOT_FOUND");
  await requireTaskAccess(userId, subtask.taskId);
  return subtask;
}

export async function addSubtask(userId: string, taskId: string, title: string) {
  await requireTaskAccess(userId, taskId);
  const trimmed = title.trim();
  if (!trimmed) throw new Error("SUBTASK_TITLE_REQUIRED");
  if (trimmed.length > LIMITS.subtaskTitle) throw new Error("SUBTASK_TITLE_TOO_LONG");
  return prisma.subtask.create({ data: { taskId, title: trimmed } });
}

export async function toggleSubtask(userId: string, subtaskId: string, done: boolean) {
  await requireSubtaskAccess(userId, subtaskId);
  return prisma.subtask.update({ where: { id: subtaskId }, data: { done } });
}

export async function deleteSubtask(userId: string, subtaskId: string): Promise<void> {
  await requireSubtaskAccess(userId, subtaskId);
  await prisma.subtask.delete({ where: { id: subtaskId } });
}

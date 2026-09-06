import type { TaskPriority, TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type BoardFilters = {
  assigneeId?: string;
  label?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  q?: string;
};

export function getBoardTasks(projectId: string, filters: BoardFilters) {
  return prisma.task.findMany({
    where: {
      projectId,
      ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      ...(filters.label ? { labels: { has: filters.label } } : {}),
      ...(filters.priority ? { priority: filters.priority } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.q ? { title: { contains: filters.q, mode: "insensitive" as const } } : {}),
    },
    include: { assignee: true, subtasks: { select: { done: true } } },
    orderBy: [{ rank: "asc" }, { createdAt: "asc" }],
  });
}

export function getMyTasks(userId: string) {
  return prisma.task.findMany({
    where: { assigneeId: userId },
    include: { project: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
  });
}

export function getTaskWithEvents(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: true,
      project: { include: { members: { include: { user: true } } } },
      events: { include: { user: true }, orderBy: { createdAt: "desc" } },
      subtasks: { orderBy: { createdAt: "asc" } },
    },
  });
}

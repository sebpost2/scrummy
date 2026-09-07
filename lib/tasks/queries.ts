import type { TaskPriority, TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export type BoardFilters = {
  assigneeId?: string;
  label?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  q?: string;
};

// Safety ceilings so one huge project/task can't pull an unbounded row set into
// memory and the render. Add real "load more" pagination if a project ever
// legitimately crosses these.
const MAX_BOARD_TASKS = 1000;
const MAX_MY_TASKS = 300;
const MAX_EVENTS = 200;

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
    take: MAX_BOARD_TASKS,
  });
}

export function getMyTasks(userId: string) {
  return prisma.task.findMany({
    where: { assigneeId: userId },
    include: { project: true },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    take: MAX_MY_TASKS,
  });
}

export function getTaskWithEvents(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignee: true,
      project: { include: { members: { include: { user: true } } } },
      events: { include: { user: true }, orderBy: { createdAt: "desc" }, take: MAX_EVENTS },
      subtasks: { orderBy: { createdAt: "asc" } },
    },
  });
}

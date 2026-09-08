import type { NotificationType } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const MAX_ITEMS = 20;
const DUE_SOON_HOURS = 24;

export type NavNotificationItem =
  | {
      kind: "notification";
      id: string;
      type: NotificationType;
      taskId: string;
      taskTitle: string;
      projectSlug: string;
      actorName: string | null;
      readAt: Date | null;
      createdAt: Date;
    }
  | {
      kind: "due";
      taskId: string;
      taskTitle: string;
      projectSlug: string;
      dueDate: Date;
    };

export async function getNavNotifications(
  userId: string,
): Promise<{ unreadCount: number; items: NavNotificationItem[] }> {
  const [stored, dueSoon, unreadStoredCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      include: { task: { include: { project: true } }, actor: true },
      orderBy: { createdAt: "desc" },
      take: MAX_ITEMS,
    }),
    prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: { not: "DONE" },
        dueDate: { lte: new Date(Date.now() + DUE_SOON_HOURS * 60 * 60 * 1000) },
      },
      include: { project: true },
      orderBy: { dueDate: "asc" },
      take: MAX_ITEMS,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  const items: NavNotificationItem[] = [
    ...stored.map((n) => ({
      kind: "notification" as const,
      id: n.id,
      type: n.type,
      taskId: n.taskId,
      taskTitle: n.task.title,
      projectSlug: n.task.project.slug,
      actorName: n.actor?.name ?? null,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
    ...dueSoon.map((t) => ({
      kind: "due" as const,
      taskId: t.id,
      taskTitle: t.title,
      projectSlug: t.project.slug,
      dueDate: t.dueDate as Date,
    })),
  ];

  return { unreadCount: unreadStoredCount + dueSoon.length, items };
}

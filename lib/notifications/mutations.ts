import { prisma } from "@/lib/db/prisma";

export async function notifyAssigned(actorId: string, taskId: string, assigneeId: string): Promise<void> {
  if (assigneeId === actorId) return;
  await prisma.notification.create({
    data: { userId: assigneeId, type: "ASSIGNED", taskId, actorId },
  });
}

export async function notifyMentions(
  actorId: string,
  projectId: string,
  taskId: string,
  mentionedUserIds: string[],
): Promise<void> {
  const candidateIds = [...new Set(mentionedUserIds)].filter((id) => id !== actorId);
  if (candidateIds.length === 0) return;

  const members = await prisma.projectMember.findMany({
    where: { projectId, userId: { in: candidateIds } },
    select: { userId: true },
  });
  if (members.length === 0) return;

  await prisma.notification.createMany({
    data: members.map((m) => ({ userId: m.userId, type: "MENTIONED" as const, taskId, actorId })),
  });
}

// Scoped by userId in the WHERE clause, not a separate ownership check: if the
// notification belongs to someone else, this updates zero rows instead of
// throwing — the caller can't tell the difference between "not yours" and
// "already read", which is fine, both are no-ops from their perspective.
export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

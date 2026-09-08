"use server";

import { requireUser } from "@/lib/auth/session";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/notifications/mutations";

export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const user = await requireUser();
  await markNotificationRead(user.id, notificationId);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  await markAllNotificationsRead(user.id);
}

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import type { NavNotificationItem } from "@/lib/notifications/queries";

import Avatar from "./Avatar";
import RelativeTime from "./RelativeTime";
import Menu, { MenuItem, MenuSeparator } from "./Menu";
import { markNotificationReadAction, markAllNotificationsReadAction } from "./notificationsActions";

const TRIGGER_LABEL: Record<"ASSIGNED" | "MENTIONED", string> = {
  ASSIGNED: "assigned you",
  MENTIONED: "mentioned you",
};

export default function NotificationsBell({
  unreadCount,
  items,
}: {
  unreadCount: number;
  items: NavNotificationItem[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function markRead(id: string) {
    startTransition(async () => {
      await markNotificationReadAction(id);
      router.refresh();
    });
  }

  function markAllRead() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  return (
    <Menu
      align="end"
      label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
      trigger={
        <span className="notif-trigger">
          <Bell size={16} />
          {unreadCount > 0 && <span className="notif-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>}
        </span>
      }
    >
      <div className="menu__header">
        <span className="menu__header-name">Notifications</span>
      </div>
      {items.length === 0 ? (
        <p className="notif-empty">You&apos;re all caught up.</p>
      ) : (
        items.map((item) =>
          item.kind === "notification" ? (
            <MenuItem
              key={item.id}
              href={`/projects/${item.projectSlug}/tasks/${item.taskId}`}
              onSelect={() => markRead(item.id)}
            >
              <span className={`notif-item${item.readAt ? "" : " notif-item--unread"}`}>
                {item.actorName && <Avatar name={item.actorName} size="sm" />}
                <span className="notif-item__body">
                  <span className="notif-item__text">
                    {item.actorName ?? "Someone"} {TRIGGER_LABEL[item.type as "ASSIGNED" | "MENTIONED"]} on{" "}
                    <strong>{item.taskTitle}</strong>
                  </span>
                  <RelativeTime date={item.createdAt} className="notif-item__time" />
                </span>
              </span>
            </MenuItem>
          ) : (
            <MenuItem key={`due-${item.taskId}`} href={`/projects/${item.projectSlug}/tasks/${item.taskId}`}>
              <span className="notif-item notif-item--unread">
                <span className="notif-item__body">
                  <span className="notif-item__text">
                    <strong>{item.taskTitle}</strong> is due soon
                  </span>
                  <RelativeTime date={item.dueDate} className="notif-item__time" />
                </span>
              </span>
            </MenuItem>
          ),
        )
      )}
      {unreadCount > 0 && (
        <>
          <MenuSeparator />
          <MenuItem onSelect={markAllRead}>Mark all as read</MenuItem>
        </>
      )}
    </Menu>
  );
}

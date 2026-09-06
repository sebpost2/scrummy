import type { TaskEventType } from "@prisma/client";
import {
  Plus, ArrowRight, UserRound, Flag, Calendar, Tag, Pencil, MessageSquare,
  type LucideIcon,
} from "lucide-react";

import RelativeTime from "@/app/_components/RelativeTime";

import { CommentActions } from "./CommentActions";

const VERB: Record<TaskEventType, string> = {
  CREATED: "created this task",
  STATUS_CHANGED: "changed the status",
  REASSIGNED: "reassigned it",
  PRIORITY_CHANGED: "changed the priority",
  DUE_DATE_CHANGED: "changed the due date",
  LABELS_CHANGED: "updated the labels",
  EDITED: "edited the task",
  COMMENTED: "commented",
};

const ICON: Record<TaskEventType, LucideIcon> = {
  CREATED: Plus,
  STATUS_CHANGED: ArrowRight,
  REASSIGNED: UserRound,
  PRIORITY_CHANGED: Flag,
  DUE_DATE_CHANGED: Calendar,
  LABELS_CHANGED: Tag,
  EDITED: Pencil,
  COMMENTED: MessageSquare,
};

export type TimelineEvent = {
  id: string;
  type: TaskEventType;
  userId: string;
  userName: string;
  comment: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
};

export default function Timeline({
  events,
  currentUserId,
  slug,
  taskId,
}: {
  events: TimelineEvent[];
  currentUserId: string;
  slug: string;
  taskId: string;
}) {
  return (
    <ul className="timeline">
      {events.map((e, i) => {
        const showDay =
          i === 0 || events[i - 1].createdAt.toDateString() !== e.createdAt.toDateString();
        const Icon = ICON[e.type];
        return (
          <li key={e.id}>
            {showDay && (
              <div className="timeline__day">
                {e.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
            <div className={`timeline__item${e.type === "COMMENTED" ? " timeline__item--comment" : ""}`}>
              <span className="timeline__icon"><Icon size={13} /></span>
              <div className="timeline__body">
                <div className="timeline__head">
                  <span className="timeline__actor">{e.userName}</span>
                  <span className="timeline__event">{VERB[e.type]}</span>
                  <RelativeTime className="timeline__time" date={e.createdAt} />
                </div>
                {e.type === "COMMENTED" && e.deletedAt ? (
                  <p className="timeline__comment timeline__comment--deleted">comment deleted</p>
                ) : (
                  e.comment && (
                    <div>
                      <p className="timeline__comment">{e.comment}</p>
                      <div className="timeline__comment-foot">
                        {e.editedAt && <span className="timeline__edited">(edited)</span>}
                        {e.type === "COMMENTED" && e.userId === currentUserId && (
                          <CommentActions
                            eventId={e.id}
                            taskId={taskId}
                            slug={slug}
                            initial={e.comment ?? ""}
                          />
                        )}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

import Link from "next/link";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { Badge, PriorityBadge, StatusBadge } from "./Badge";
import RelativeTime from "./RelativeTime";

export function TaskCard({
  href,
  title,
  priority,
  status,
  assigneeName,
  dueDate,
  labels = [],
}: {
  href: string;
  title: string;
  priority: TaskPriority;
  status?: TaskStatus;
  assigneeName?: string | null;
  dueDate?: Date | null;
  labels?: string[];
}) {
  return (
    <Link href={href} className={`card card--${priority.toLowerCase()}`}>
      <div className="card__title">{title}</div>
      <div className="card__meta">
        {status && <StatusBadge value={status} />}
        <PriorityBadge value={priority} />
        {assigneeName && <Badge>{assigneeName}</Badge>}
        {dueDate && <Badge mono>{dueDate.toISOString().slice(0, 10)}</Badge>}
        {labels.map((label) => (
          <Badge key={label}>{label}</Badge>
        ))}
      </div>
    </Link>
  );
}

export function TaskRow({
  href,
  title,
  status,
  priority,
  projectName,
  dueDate,
}: {
  href: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  projectName?: string;
  dueDate?: Date | null;
}) {
  const overdue = dueDate ? dueDate < new Date() : false;
  return (
    <Link href={href} className={`taskrow taskrow--${priority.toLowerCase()}`}>
      <span className={`taskrow__dot taskrow__dot--${status.toLowerCase()}`} aria-hidden="true" />
      <span className="taskrow__title">{title}</span>
      {projectName && <span className="taskrow__project">{projectName}</span>}
      {dueDate && (
        <span className={`taskrow__due${overdue ? " taskrow__due--overdue" : ""}`}>
          <RelativeTime date={dueDate} />
        </span>
      )}
    </Link>
  );
}

import Link from "next/link";
import type { TaskPriority, TaskStatus } from "@prisma/client";

import { Badge, PriorityBadge, StatusBadge } from "./Badge";

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

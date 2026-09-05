import type { TaskPriority, TaskStatus } from "@prisma/client";

const PRIORITY_LABEL: Record<TaskPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export function PriorityBadge({ value }: { value: TaskPriority }) {
  return <span className={`badge badge--${value.toLowerCase()}`}>{PRIORITY_LABEL[value]}</span>;
}

export function StatusBadge({ value }: { value: TaskStatus }) {
  return <span className={`badge badge--status-${value.toLowerCase()}`}>{STATUS_LABEL[value]}</span>;
}

export function Badge({ children, mono = false }: { children: React.ReactNode; mono?: boolean }) {
  return <span className={mono ? "badge badge--date" : "badge"}>{children}</span>;
}

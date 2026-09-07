"use client";

import type { CSSProperties } from "react";
import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import type { TaskStatus } from "@prisma/client";
import { MoreHorizontal, ListChecks } from "lucide-react";

import Avatar from "@/app/_components/Avatar";
import RelativeTime from "@/app/_components/RelativeTime";
import { PriorityBadge } from "@/app/_components/Badge";
import Menu, { MenuItem, MenuSeparator } from "@/app/_components/Menu";
import { toast } from "@/app/_components/toast";
import { callAction } from "@/lib/sync/callAction";

import type { BoardTask } from "./board-state";
import { reassignTaskAction } from "./tasks/[id]/actions";

type Member = { id: string; name: string };

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "TODO", label: "To do" },
  { value: "IN_PROGRESS", label: "In progress" },
  { value: "DONE", label: "Done" },
];

function CardMenu({
  task,
  slug,
  members,
  onMove,
}: {
  task: BoardTask;
  slug: string;
  members: Member[];
  onMove: (taskId: string, toStatus: TaskStatus) => void;
}) {
  const router = useRouter();
  const [, start] = useTransition();

  function reassign(assigneeId: string) {
    start(async () => {
      try {
        await callAction(() => reassignTaskAction(task.id, slug, assigneeId), {
          type: "reassignTask",
          args: [task.id, assigneeId],
          entityId: task.id,
        });
        router.refresh();
      } catch {
        toast.error("Couldn't reassign that task");
      }
    });
  }

  return (
    <Menu label="Task actions" trigger={<MoreHorizontal size={14} />}>
      {STATUS_OPTIONS.filter((o) => o.value !== task.status).map((o) => (
        <MenuItem key={o.value} onSelect={() => onMove(task.id, o.value)}>
          Move to {o.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem onSelect={() => reassign("")}>Unassign</MenuItem>
      {members.map((m) => (
        <MenuItem key={m.id} onSelect={() => reassign(m.id)}>
          Assign to {m.name}
        </MenuItem>
      ))}
    </Menu>
  );
}

function CardShell({
  task,
  slug,
  overlay,
  members,
  onMove,
  setNodeRef,
  style,
  attributes,
  listeners,
}: {
  task: BoardTask;
  slug: string;
  overlay: boolean;
  members?: Member[];
  onMove?: (taskId: string, toStatus: TaskStatus) => void;
  setNodeRef?: (node: HTMLElement | null) => void;
  style?: CSSProperties;
  attributes?: DraggableAttributes;
  listeners?: DraggableSyntheticListeners;
}) {
  const overdue = task.dueDate ? new Date(task.dueDate) < new Date() : false;
  const shown = task.labels.slice(0, 2);
  const extra = task.labels.length - shown.length;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`card card--${task.priority.toLowerCase()}${overlay ? " card--overlay" : ""}`}
      {...attributes}
      {...listeners}
    >
      {!overlay && members && onMove && (
        <span
          className="card__menu"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <CardMenu task={task} slug={slug} members={members} onMove={onMove} />
        </span>
      )}
      <Link href={`/projects/${slug}/tasks/${task.id}`} className="card__link">
        <span className="card__title">{task.title}</span>
      </Link>
      <div className="card__meta">
        <PriorityBadge value={task.priority} />
        {task.assigneeName && (
          <span title={task.assigneeName}>
            <Avatar name={task.assigneeName} size="sm" />
          </span>
        )}
        {task.dueDate && (
          <span className={`card__due${overdue ? " card__due--overdue" : ""}`}>
            <RelativeTime date={task.dueDate} />
          </span>
        )}
        {task.subtaskTotal > 0 && (
          <span className="badge" title="Subtasks done">
            <ListChecks size={11} /> {task.subtaskDone}/{task.subtaskTotal}
          </span>
        )}
        {shown.map((l) => (
          <span key={l} className="badge">{l}</span>
        ))}
        {extra > 0 && <span className="badge">+{extra}</span>}
      </div>
    </div>
  );
}

function SortableBoardCard({
  task,
  slug,
  members,
  onMove,
}: {
  task: BoardTask;
  slug: string;
  members: Member[];
  onMove: (taskId: string, toStatus: TaskStatus) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <CardShell
      task={task}
      slug={slug}
      overlay={false}
      members={members}
      onMove={onMove}
      setNodeRef={setNodeRef}
      style={style}
      attributes={attributes}
      listeners={listeners}
    />
  );
}

export default function BoardCard({
  task,
  slug,
  overlay = false,
  members = [],
  onMove,
}: {
  task: BoardTask;
  slug: string;
  overlay?: boolean;
  members?: Member[];
  onMove?: (taskId: string, toStatus: TaskStatus) => void;
}) {
  if (overlay || !onMove) return <CardShell task={task} slug={slug} overlay />;
  return <SortableBoardCard task={task} slug={slug} members={members} onMove={onMove} />;
}

"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { GripVertical } from "lucide-react";

import Avatar from "@/app/_components/Avatar";
import RelativeTime from "@/app/_components/RelativeTime";
import { PriorityBadge } from "@/app/_components/Badge";

import type { BoardTask } from "./board-state";

function CardShell({
  task,
  slug,
  overlay,
  setNodeRef,
  style,
  attributes,
  listeners,
}: {
  task: BoardTask;
  slug: string;
  overlay: boolean;
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
    >
      {overlay ? (
        <span className="card__grip" aria-hidden="true">
          <GripVertical size={14} />
        </span>
      ) : (
        <button
          type="button"
          className="card__grip"
          aria-label="Drag task"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} />
        </button>
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
        {shown.map((l) => (
          <span key={l} className="badge">{l}</span>
        ))}
        {extra > 0 && <span className="badge">+{extra}</span>}
      </div>
    </div>
  );
}

function SortableBoardCard({ task, slug }: { task: BoardTask; slug: string }) {
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
}: {
  task: BoardTask;
  slug: string;
  overlay?: boolean;
}) {
  if (overlay) return <CardShell task={task} slug={slug} overlay />;
  return <SortableBoardCard task={task} slug={slug} />;
}

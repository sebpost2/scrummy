"use client";

import { useOptimistic, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDroppable,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { TaskStatus } from "@prisma/client";

import { toast } from "@/app/_components/toast";

import { updateStatusAction } from "./tasks/[id]/actions";
import { boardReducer, columnTasks, type BoardTask } from "./board-state";
import BoardCard from "./BoardCard";
import InlineTaskComposer from "./InlineTaskComposer";

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: "TODO", label: "To do" },
  { status: "IN_PROGRESS", label: "In progress" },
  { status: "DONE", label: "Done" },
];

function ColumnBody({ status, children }: { status: TaskStatus; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <div ref={setNodeRef} className="board__column-body">
      {children}
    </div>
  );
}

export default function Board({ slug, tasks }: { slug: string; tasks: BoardTask[] }) {
  const [optimistic, dispatch] = useOptimistic(tasks, boardReducer);
  const [, startTransition] = useTransition();
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const active = optimistic.find((t) => t.id === activeId) ?? null;

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const taskId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    // `over` is either a column droppable id (a TaskStatus) or another card id.
    const toStatus = COLUMNS.some((c) => c.status === overId)
      ? (overId as TaskStatus)
      : optimistic.find((t) => t.id === overId)?.status;
    const task = optimistic.find((t) => t.id === taskId);
    if (!task || !toStatus || task.status === toStatus) return;

    const label = COLUMNS.find((c) => c.status === toStatus)!.label;
    startTransition(async () => {
      dispatch({ type: "move", taskId, toStatus });
      try {
        await updateStatusAction(taskId, slug, toStatus);
        toast.success(`Moved “${task.title}” to ${label}`);
      } catch {
        toast.error("Couldn't move that task");
      }
    });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <div className="board">
        {COLUMNS.map((col) => {
          const items = columnTasks(optimistic, col.status);
          return (
            <section key={col.status} className="board__column" data-status={col.status}>
              <div className="board__column-head">
                <h2>{col.label}</h2>
                <span className="count">{items.length}</span>
              </div>
              {col.status === "TODO" && <InlineTaskComposer slug={slug} />}
              <SortableContext id={col.status} items={items.map((t) => t.id)}>
                <ColumnBody status={col.status}>
                  {items.length === 0 ? (
                    <p className="board__empty">Nothing here</p>
                  ) : (
                    items.map((t) => <BoardCard key={t.id} task={t} slug={slug} />)
                  )}
                </ColumnBody>
              </SortableContext>
            </section>
          );
        })}
      </div>
      <DragOverlay>{active && <BoardCard task={active} slug={slug} overlay />}</DragOverlay>
    </DndContext>
  );
}

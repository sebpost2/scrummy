"use client";

import { useOptimistic } from "react";
import type { Task } from "@prisma/client";

import { toast } from "@/app/_components/toast";
import { callAction } from "@/lib/sync/callAction";
import { useSyncedAction } from "@/lib/sync/useSyncedAction";

import {
  reassignTaskAction,
  updateStatusAction,
  updatePriorityAction,
  updateDueDateAction,
  updateLabelsAction,
} from "./actions";

type PropTask = {
  id: string;
  status: Task["status"];
  assigneeId: string | null;
  priority: Task["priority"];
  dueDate: Date | null;
  labels: string[];
};

export function TaskProperties({
  task,
  slug,
  members,
}: {
  task: PropTask;
  slug: string;
  members: { id: string; name: string }[];
}) {
  const [opt, setOpt] = useOptimistic(task);
  const [, syncedRun] = useSyncedAction();

  function run(patch: Partial<PropTask>, label: string, fn: () => Promise<void>) {
    syncedRun(fn, `Couldn't update ${label}`, {
      optimistic: () => setOpt({ ...opt, ...patch }),
      onSuccess: () => toast.success(`Updated ${label}`),
    });
  }

  return (
    <div className="props">
      <label className="props__row">
        <span className="props__label">Status</span>
        <select
          className="input"
          value={opt.status}
          onChange={(e) => {
            const v = e.target.value as Task["status"];
            run({ status: v }, "status", () =>
              callAction(() => updateStatusAction(task.id, slug, v), {
                type: "updateTaskStatus",
                args: [task.id, v],
                entityId: task.id,
              }),
            );
          }}
        >
          <option value="TODO">To do</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="DONE">Done</option>
        </select>
      </label>

      <label className="props__row">
        <span className="props__label">Assignee</span>
        <select
          className="input"
          value={opt.assigneeId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            run({ assigneeId: v || null }, "assignee", () =>
              callAction(() => reassignTaskAction(task.id, slug, v), {
                type: "reassignTask",
                args: [task.id, v || null],
                entityId: task.id,
              }),
            );
          }}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>

      <label className="props__row">
        <span className="props__label">Priority</span>
        <select
          className="input"
          value={opt.priority}
          onChange={(e) => {
            const v = e.target.value as Task["priority"];
            run({ priority: v }, "priority", () =>
              callAction(() => updatePriorityAction(task.id, slug, v), {
                type: "updateTaskPriority",
                args: [task.id, v],
                entityId: task.id,
              }),
            );
          }}
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </label>

      <label className="props__row">
        <span className="props__label">Due date</span>
        <input
          type="date"
          className="input"
          defaultValue={opt.dueDate ? opt.dueDate.toISOString().slice(0, 10) : ""}
          onChange={(e) =>
            run({}, "due date", () =>
              callAction(() => updateDueDateAction(task.id, slug, e.target.value), {
                type: "updateTaskDueDate",
                args: [task.id, e.target.value ? new Date(e.target.value) : null],
                entityId: task.id,
              }),
            )
          }
        />
      </label>

      <label className="props__row">
        <span className="props__label">Labels</span>
        <input
          type="text"
          className="input"
          placeholder="comma-separated"
          defaultValue={opt.labels.join(", ")}
          onBlur={(e) =>
            run({}, "labels", () =>
              callAction(() => updateLabelsAction(task.id, slug, e.target.value), {
                type: "updateTaskLabels",
                args: [task.id, e.target.value.split(",").map((l) => l.trim()).filter(Boolean)],
                entityId: task.id,
              }),
            )
          }
        />
      </label>
    </div>
  );
}

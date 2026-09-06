"use client";

import { useOptimistic, useTransition } from "react";
import type { Task } from "@prisma/client";

import { toast } from "@/app/_components/toast";

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
  const [, start] = useTransition();

  function run(patch: Partial<PropTask>, label: string, fn: () => Promise<void>) {
    start(async () => {
      setOpt({ ...opt, ...patch });
      try {
        await fn();
        toast.success(`Updated ${label}`);
      } catch {
        toast.error(`Couldn't update ${label}`);
      }
    });
  }

  return (
    <div className="props">
      <div className="props__row">
        <span className="props__label">Status</span>
        <select
          className="input"
          value={opt.status}
          onChange={(e) => {
            const v = e.target.value as Task["status"];
            run({ status: v }, "status", () => updateStatusAction(task.id, slug, v));
          }}
        >
          <option value="TODO">To do</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="DONE">Done</option>
        </select>
      </div>

      <div className="props__row">
        <span className="props__label">Assignee</span>
        <select
          className="input"
          value={opt.assigneeId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            run({ assigneeId: v || null }, "assignee", () => reassignTaskAction(task.id, slug, v));
          }}
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="props__row">
        <span className="props__label">Priority</span>
        <select
          className="input"
          value={opt.priority}
          onChange={(e) => {
            const v = e.target.value as Task["priority"];
            run({ priority: v }, "priority", () => updatePriorityAction(task.id, slug, v));
          }}
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </div>

      <div className="props__row">
        <span className="props__label">Due date</span>
        <input
          type="date"
          className="input"
          defaultValue={opt.dueDate ? opt.dueDate.toISOString().slice(0, 10) : ""}
          onChange={(e) =>
            run({}, "due date", () => updateDueDateAction(task.id, slug, e.target.value))
          }
        />
      </div>

      <div className="props__row">
        <span className="props__label">Labels</span>
        <input
          type="text"
          className="input"
          placeholder="comma-separated"
          defaultValue={opt.labels.join(", ")}
          onBlur={(e) =>
            run({}, "labels", () => updateLabelsAction(task.id, slug, e.target.value))
          }
        />
      </div>
    </div>
  );
}

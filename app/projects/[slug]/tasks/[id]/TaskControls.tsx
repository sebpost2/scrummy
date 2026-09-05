"use client";

import type { Task } from "@prisma/client";

import { reassignTaskAction, updateStatusAction, updatePriorityAction, updateDueDateAction, updateLabelsAction } from "./actions";

export function TaskControls({
  task,
  slug,
  members,
}: {
  task: {
    id: string;
    status: Task["status"];
    assigneeId: string | null;
    priority: Task["priority"];
    dueDate: Date | null;
    labels: string[];
  };
  slug: string;
  members: { id: string; name: string }[];
}) {
  return (
    <div className="controls">
      <select
        className="input"
        defaultValue={task.status}
        onChange={(e) => updateStatusAction(task.id, slug, e.target.value as Task["status"])}
      >
        <option value="TODO">To do</option>
        <option value="IN_PROGRESS">In progress</option>
        <option value="DONE">Done</option>
      </select>
      <select
        className="input"
        defaultValue={task.assigneeId ?? ""}
        onChange={(e) => reassignTaskAction(task.id, slug, e.target.value)}
      >
        <option value="">Unassigned</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <select
        className="input"
        defaultValue={task.priority}
        onChange={(e) => updatePriorityAction(task.id, slug, e.target.value as Task["priority"])}
      >
        <option value="LOW">Low</option>
        <option value="MEDIUM">Medium</option>
        <option value="HIGH">High</option>
      </select>
      <input
        type="date"
        className="input"
        defaultValue={task.dueDate ? task.dueDate.toISOString().slice(0, 10) : ""}
        onChange={(e) => updateDueDateAction(task.id, slug, e.target.value)}
      />
      <input
        type="text"
        className="input"
        placeholder="labels, comma-separated"
        defaultValue={task.labels.join(", ")}
        onBlur={(e) => updateLabelsAction(task.id, slug, e.target.value)}
      />
    </div>
  );
}

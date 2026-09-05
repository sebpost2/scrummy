"use client";

import type { Task, User } from "@prisma/client";

import { reassignTaskAction, updatePriorityAction, updateDueDateAction, updateLabelsAction } from "./actions";

export function TaskControls({
  task,
  slug,
  members,
}: {
  task: Task;
  slug: string;
  members: User[];
}) {
  return (
    <div className="filter-bar">
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

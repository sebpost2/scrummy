import type { TaskStatus, TaskPriority } from "@prisma/client";

export type BoardTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeName: string | null;
  dueDate: string | null;
  labels: string[];
};

export type BoardAction = { type: "move"; taskId: string; toStatus: TaskStatus };

export function boardReducer(tasks: BoardTask[], action: BoardAction): BoardTask[] {
  switch (action.type) {
    case "move":
      return tasks.map((t) =>
        t.id === action.taskId ? { ...t, status: action.toStatus } : t,
      );
    default:
      return tasks;
  }
}

export function columnTasks(tasks: BoardTask[], status: TaskStatus): BoardTask[] {
  return tasks.filter((t) => t.status === status);
}

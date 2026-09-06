import type { TaskStatus, TaskPriority } from "@prisma/client";

export type BoardTask = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  rank: number;
  assigneeName: string | null;
  dueDate: string | null;
  labels: string[];
  subtaskDone: number;
  subtaskTotal: number;
};

export type BoardAction =
  | { type: "move"; taskId: string; toStatus: TaskStatus }
  | { type: "reorder"; taskId: string; rank: number };

export function boardReducer(tasks: BoardTask[], action: BoardAction): BoardTask[] {
  switch (action.type) {
    case "move":
      return tasks.map((t) =>
        t.id === action.taskId ? { ...t, status: action.toStatus } : t,
      );
    case "reorder":
      return tasks.map((t) =>
        t.id === action.taskId ? { ...t, rank: action.rank } : t,
      );
    default:
      return tasks;
  }
}

export function columnTasks(tasks: BoardTask[], status: TaskStatus): BoardTask[] {
  return tasks.filter((t) => t.status === status).sort((a, b) => a.rank - b.rank);
}

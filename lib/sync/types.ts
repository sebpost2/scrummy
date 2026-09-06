export type OutboxMutationType =
  | "createTask"
  | "updateTaskTitle"
  | "updateTaskDescription"
  | "deleteTask"
  | "reassignTask"
  | "updateTaskStatus"
  | "updateTaskPriority"
  | "updateTaskDueDate"
  | "updateTaskLabels"
  | "reorderTask"
  | "addTaskComment"
  | "editTaskComment"
  | "deleteTaskComment"
  | "addSubtask"
  | "toggleSubtask"
  | "deleteSubtask"
  | "createProject"
  | "addProjectMemberByEmail"
  | "regenerateInviteToken"
  | "removeProjectMember"
  | "renameProject"
  | "deleteProject"
  | "leaveProject"
  | "updateMemberRole";

export type OutboxStatus = "pending" | "syncing" | "failed-permanent";

export interface OutboxItem {
  id: string;
  type: OutboxMutationType;
  args: unknown[];
  clientTimestamp: number;
  entityId: string;
  status: OutboxStatus;
  failureMessage?: string;
}

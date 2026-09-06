import type { TaskStatus, TaskPriority, ProjectRole } from "@prisma/client";

import {
  createTask,
  updateTaskTitle,
  updateTaskDescription,
  deleteTask,
  reassignTask,
  updateTaskStatus,
  updateTaskPriority,
  updateTaskDueDate,
  updateTaskLabels,
  reorderTask,
  addTaskComment,
  editTaskComment,
  deleteTaskComment,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
} from "@/lib/tasks/mutations";
import {
  createProject,
  addProjectMemberByEmail,
  regenerateInviteToken,
  removeProjectMember,
  renameProject,
  deleteProject,
  leaveProject,
  updateMemberRole,
} from "@/lib/projects/mutations";
import type { OutboxMutationType } from "@/lib/sync/types";

type Handler = (userId: string, args: unknown[], clientTimestamp: Date) => Promise<unknown>;

export const MUTATION_REGISTRY: Record<OutboxMutationType, Handler> = {
  createTask: (userId, args) =>
    createTask(
      userId,
      args[0] as string,
      args[1] as { title: string; description?: string; id?: string; rank?: number },
    ),
  updateTaskTitle: (userId, args) => updateTaskTitle(userId, args[0] as string, args[1] as string),
  updateTaskDescription: (userId, args) => updateTaskDescription(userId, args[0] as string, args[1] as string),
  deleteTask: (userId, args) => deleteTask(userId, args[0] as string),
  reassignTask: (userId, args, ts) => reassignTask(userId, args[0] as string, args[1] as string | null, ts),
  updateTaskStatus: (userId, args, ts) => updateTaskStatus(userId, args[0] as string, args[1] as TaskStatus, ts),
  updateTaskPriority: (userId, args, ts) => updateTaskPriority(userId, args[0] as string, args[1] as TaskPriority, ts),
  updateTaskDueDate: (userId, args, ts) => updateTaskDueDate(userId, args[0] as string, args[1] as Date | null, ts),
  updateTaskLabels: (userId, args, ts) => updateTaskLabels(userId, args[0] as string, args[1] as string[], ts),
  reorderTask: (userId, args, ts) => reorderTask(userId, args[0] as string, args[1] as number, ts),
  addTaskComment: (userId, args) => addTaskComment(userId, args[0] as string, args[1] as string),
  editTaskComment: (userId, args) => editTaskComment(userId, args[0] as string, args[1] as string),
  deleteTaskComment: (userId, args) => deleteTaskComment(userId, args[0] as string),
  addSubtask: (userId, args) => addSubtask(userId, args[0] as string, args[1] as string),
  toggleSubtask: (userId, args) => toggleSubtask(userId, args[0] as string, args[1] as boolean),
  deleteSubtask: (userId, args) => deleteSubtask(userId, args[0] as string),
  createProject: (userId, args) => createProject(userId, args[0] as string, args[1] as string | undefined),
  addProjectMemberByEmail: (userId, args) => addProjectMemberByEmail(userId, args[0] as string, args[1] as string),
  regenerateInviteToken: (userId, args) => regenerateInviteToken(userId, args[0] as string),
  removeProjectMember: (userId, args) => removeProjectMember(userId, args[0] as string, args[1] as string),
  renameProject: (userId, args) => renameProject(userId, args[0] as string, args[1] as string),
  deleteProject: (userId, args) => deleteProject(userId, args[0] as string),
  leaveProject: (userId, args) => leaveProject(userId, args[0] as string),
  updateMemberRole: (userId, args) =>
    updateMemberRole(userId, args[0] as string, args[1] as string, args[2] as ProjectRole),
};

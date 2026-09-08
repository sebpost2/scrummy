import type { TaskStatus, TaskPriority, ProjectRole } from "@prisma/client";

import { getProjectBySlug } from "@/lib/projects/queries";
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

type Handler = (userId: string, args: unknown[], clientTimestamp: Date) => Promise<unknown>;

async function projectIdFor(slug: string): Promise<string> {
  const project = await getProjectBySlug(slug);
  if (!project) throw new Error("PROJECT_NOT_FOUND");
  return project.id;
}

// To add a new offline-syncable mutation:
// 1. Write the mutation function (lib/tasks or lib/projects).
// 2. Add a key + handler below — its name becomes the new OutboxMutationType automatically.
// 3. Add a server action that calls the mutation function directly (for the online path).
// 4. Call the action through callAction() from the client, passing { type, args, entityId }
//    matching the key and argument order used here.
export const MUTATION_REGISTRY = {
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
  updateTaskDueDate: (userId, args, ts) =>
    updateTaskDueDate(userId, args[0] as string, args[1] ? new Date(args[1] as string) : null, ts),
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
  regenerateInviteToken: async (userId, args) => regenerateInviteToken(userId, await projectIdFor(args[0] as string)),
  removeProjectMember: async (userId, args) =>
    removeProjectMember(userId, await projectIdFor(args[0] as string), args[1] as string),
  renameProject: (userId, args) => renameProject(userId, args[0] as string, args[1] as string),
  deleteProject: async (userId, args) => deleteProject(userId, await projectIdFor(args[0] as string)),
  leaveProject: async (userId, args) => leaveProject(userId, await projectIdFor(args[0] as string)),
  updateMemberRole: async (userId, args) =>
    updateMemberRole(userId, await projectIdFor(args[0] as string), args[1] as string, args[2] as ProjectRole),
} satisfies Record<string, Handler>;

export type OutboxMutationType = keyof typeof MUTATION_REGISTRY;

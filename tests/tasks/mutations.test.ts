import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { addProjectMemberByEmail } from "@/lib/projects/mutations";
import {
  createTask,
  updateTaskStatus,
  reassignTask,
  updateTaskPriority,
  updateTaskDueDate,
  updateTaskLabels,
  updateTaskTitle,
  updateTaskDescription,
  deleteTask,
  reorderTask,
  addTaskComment,
  editTaskComment,
  deleteTaskComment,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
} from "@/lib/tasks/mutations";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

afterEach(cleanupTestData);

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const owner = await createTestUser({ name: "Owner" });
  const outsider = await createTestUser({ name: "Outsider" });
  const project = await createTestProject(owner.id, "Task Project");
  return { owner, outsider, project };
}

describe("createTask", () => {
  it("creates a task and a CREATED event", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Write docs" });

    expect(task.status).toBe("TODO");
    const events = await prisma.taskEvent.findMany({ where: { taskId: task.id } });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("CREATED");
  });

  it("rejects a non-member", async () => {
    const { project, outsider } = await setup();
    await expect(createTask(outsider.id, project.id, { title: "Nope" })).rejects.toThrow("NOT_A_MEMBER");
  });
});

describe("updateTaskStatus", () => {
  it("updates status and records old/new values", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Ship it" });

    const updated = await updateTaskStatus(owner.id, task.id, "IN_PROGRESS");

    expect(updated.status).toBe("IN_PROGRESS");
    const event = await prisma.taskEvent.findFirst({ where: { taskId: task.id, type: "STATUS_CHANGED" } });
    expect(event?.oldValue).toBe("TODO");
    expect(event?.newValue).toBe("IN_PROGRESS");
  });

  it("does not write an event when the status is unchanged", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Ship it" });

    await updateTaskStatus(owner.id, task.id, "TODO");

    const events = await prisma.taskEvent.findMany({ where: { taskId: task.id } });
    expect(events).toHaveLength(1); // only CREATED
  });
});

describe("updateTaskStatus — offline LWW", () => {
  it("applies a status change with a newer clientTimestamp", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "LWW task" });
    const later = new Date(Date.now() + 60_000);

    const updated = await updateTaskStatus(owner.id, task.id, "IN_PROGRESS", later);

    expect(updated.status).toBe("IN_PROGRESS");
  });

  it("drops a status change with an older clientTimestamp than the last one applied, but logs it", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "LWW task 2" });
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    await updateTaskStatus(owner.id, task.id, "IN_PROGRESS", now);
    const result = await updateTaskStatus(owner.id, task.id, "DONE", earlier);

    expect(result.status).toBe("IN_PROGRESS");
    const events = await prisma.taskEvent.findMany({
      where: { taskId: task.id, type: "STATUS_CHANGED" },
      orderBy: { clientTimestamp: "desc" },
    });
    expect(events).toHaveLength(2);
    expect(events[1].newValue).toBe("DONE");
    expect(events[1].comment).toBe("overwritten by a newer edit made elsewhere");
  });
});

describe("reassignTask", () => {
  it("assigns a member and records a REASSIGNED event", async () => {
    const { owner, project, outsider } = await setup();
    await addProjectMemberByEmail(owner.id, project.id, outsider.email);
    const task = await createTask(owner.id, project.id, { title: "Assign me" });

    const updated = await reassignTask(owner.id, task.id, outsider.id);

    expect(updated.assigneeId).toBe(outsider.id);
    const event = await prisma.taskEvent.findFirst({ where: { taskId: task.id, type: "REASSIGNED" } });
    expect(event?.newValue).toBe(outsider.id);
  });

  it("rejects assigning to someone who isn't a project member", async () => {
    const { owner, project, outsider } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Assign me" });

    await expect(reassignTask(owner.id, task.id, outsider.id)).rejects.toThrow("ASSIGNEE_NOT_A_MEMBER");
  });
});

describe("reassignTask — notifications", () => {
  it("notifies the new assignee", async () => {
    const { owner, project, outsider } = await setup();
    await addProjectMemberByEmail(owner.id, project.id, outsider.email);
    const task = await createTask(owner.id, project.id, { title: "Assign me" });

    await reassignTask(owner.id, task.id, outsider.id);

    const notifs = await prisma.notification.findMany({ where: { userId: outsider.id, type: "ASSIGNED" } });
    expect(notifs).toHaveLength(1);
  });

  it("does not notify on self-assignment", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Assign me" });

    await reassignTask(owner.id, task.id, owner.id);

    const notifs = await prisma.notification.findMany({ where: { userId: owner.id, type: "ASSIGNED" } });
    expect(notifs).toHaveLength(0);
  });

  it("does not notify when an older offline reassignment is overwritten by a newer one", async () => {
    const { owner, project, outsider } = await setup();
    await addProjectMemberByEmail(owner.id, project.id, outsider.email);
    const task = await createTask(owner.id, project.id, { title: "LWW assign" });
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    await reassignTask(owner.id, task.id, outsider.id, now);
    await prisma.notification.deleteMany(); // isolate the second call
    await reassignTask(owner.id, task.id, null, earlier);

    const notifs = await prisma.notification.findMany();
    expect(notifs).toHaveLength(0);
  });
});

describe("addTaskComment — mentions", () => {
  it("notifies mentioned project members", async () => {
    const { owner, project, outsider } = await setup();
    await addProjectMemberByEmail(owner.id, project.id, outsider.email);
    const task = await createTask(owner.id, project.id, { title: "Comment me" });

    await addTaskComment(owner.id, task.id, "cc @Outsider", [outsider.id]);

    const notifs = await prisma.notification.findMany({ where: { userId: outsider.id, type: "MENTIONED" } });
    expect(notifs).toHaveLength(1);
  });

  it("works with no mentions, unchanged from before", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Comment me" });

    await addTaskComment(owner.id, task.id, "no mentions here");

    const notifs = await prisma.notification.findMany();
    expect(notifs).toHaveLength(0);
  });
});

describe("updateTaskPriority", () => {
  it("updates priority and records old/new values", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Prioritize me" });

    const updated = await updateTaskPriority(owner.id, task.id, "HIGH");

    expect(updated.priority).toBe("HIGH");
    const event = await prisma.taskEvent.findFirst({ where: { taskId: task.id, type: "PRIORITY_CHANGED" } });
    expect(event?.oldValue).toBe("MEDIUM");
    expect(event?.newValue).toBe("HIGH");
  });
});

describe("updateTaskDueDate", () => {
  it("sets a due date and records it as an ISO string", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Due soon" });
    const due = new Date("2026-12-01T00:00:00.000Z");

    const updated = await updateTaskDueDate(owner.id, task.id, due);

    expect(updated.dueDate?.toISOString()).toBe(due.toISOString());
    const event = await prisma.taskEvent.findFirst({ where: { taskId: task.id, type: "DUE_DATE_CHANGED" } });
    expect(event?.oldValue).toBeNull();
    expect(event?.newValue).toBe(due.toISOString());
  });

  it("clears a due date", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Due soon" });
    await updateTaskDueDate(owner.id, task.id, new Date("2026-12-01T00:00:00.000Z"));

    const updated = await updateTaskDueDate(owner.id, task.id, null);

    expect(updated.dueDate).toBeNull();
  });
});

describe("updateTaskLabels", () => {
  it("replaces labels and records them as a comma-joined string", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Label me" });

    const updated = await updateTaskLabels(owner.id, task.id, ["bug", "urgent"]);

    expect(updated.labels).toEqual(["bug", "urgent"]);
    const event = await prisma.taskEvent.findFirst({ where: { taskId: task.id, type: "LABELS_CHANGED" } });
    expect(event?.oldValue).toBe("");
    expect(event?.newValue).toBe("bug,urgent");
  });
});

describe("updateTaskTitle", () => {
  it("updates the title and records an EDITED event with old/new values", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Old title" });

    const updated = await updateTaskTitle(owner.id, task.id, "  New title  ");

    expect(updated.title).toBe("New title");
    const event = await prisma.taskEvent.findFirst({ where: { taskId: task.id, type: "EDITED" } });
    expect(event?.oldValue).toBe("Old title");
    expect(event?.newValue).toBe("New title");
  });

  it("rejects an empty title", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Keep me" });

    await expect(updateTaskTitle(owner.id, task.id, "   ")).rejects.toThrow("TITLE_REQUIRED");
  });

  it("does not write an event when the title is unchanged", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Same" });

    await updateTaskTitle(owner.id, task.id, "Same");

    const events = await prisma.taskEvent.findMany({ where: { taskId: task.id } });
    expect(events).toHaveLength(1); // only CREATED
  });
});

describe("updateTaskDescription", () => {
  it("sets a description and records an EDITED event", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Describe me" });

    const updated = await updateTaskDescription(owner.id, task.id, "Now with detail");

    expect(updated.description).toBe("Now with detail");
    const event = await prisma.taskEvent.findFirst({ where: { taskId: task.id, type: "EDITED" } });
    expect(event).not.toBeNull();
  });

  it("clears the description when given blank text", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Describe me" });
    await updateTaskDescription(owner.id, task.id, "temp");

    const updated = await updateTaskDescription(owner.id, task.id, "   ");

    expect(updated.description).toBeNull();
  });

  it("rejects a non-member", async () => {
    const { owner, project, outsider } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Guarded" });

    await expect(updateTaskDescription(outsider.id, task.id, "hi")).rejects.toThrow("NOT_A_MEMBER");
  });
});

describe("deleteTask", () => {
  it("removes the task and its events", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Delete me" });

    await deleteTask(owner.id, task.id);

    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull();
    expect(await prisma.taskEvent.findMany({ where: { taskId: task.id } })).toHaveLength(0);
  });

  it("rejects a non-member", async () => {
    const { owner, project, outsider } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Guarded" });

    await expect(deleteTask(outsider.id, task.id)).rejects.toThrow("NOT_A_MEMBER");
  });
});

describe("addTaskComment", () => {
  it("appends a COMMENTED event without changing the Task row", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Discuss me" });

    await addTaskComment(owner.id, task.id, "Looks good to me.");

    const event = await prisma.taskEvent.findFirst({ where: { taskId: task.id, type: "COMMENTED" } });
    expect(event?.comment).toBe("Looks good to me.");
  });

  it("rejects an empty comment", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Discuss me" });

    await expect(addTaskComment(owner.id, task.id, "   ")).rejects.toThrow("COMMENT_REQUIRED");
  });
});

describe("reorderTask", () => {
  it("sets rank and rejects a non-member", async () => {
    const { owner, project, outsider } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Rank me" });

    const updated = await reorderTask(owner.id, task.id, 42.5);
    expect(updated.rank).toBe(42.5);

    await expect(reorderTask(outsider.id, task.id, 1)).rejects.toThrow("NOT_A_MEMBER");
  });
});

describe("editTaskComment / deleteTaskComment", () => {
  async function commentEvent(userId: string, taskId: string, body: string) {
    await addTaskComment(userId, taskId, body);
    const ev = await prisma.taskEvent.findFirst({
      where: { taskId, type: "COMMENTED" },
      orderBy: { createdAt: "desc" },
    });
    return ev!;
  }

  it("lets the author edit and stamps editedAt", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "T" });
    const ev = await commentEvent(owner.id, task.id, "first");

    await editTaskComment(owner.id, ev.id, "second");

    const after = await prisma.taskEvent.findUnique({ where: { id: ev.id } });
    expect(after?.comment).toBe("second");
    expect(after?.editedAt).not.toBeNull();
  });

  it("rejects a non-author editor", async () => {
    const { owner, project, outsider } = await setup();
    const task = await createTask(owner.id, project.id, { title: "T" });
    const ev = await commentEvent(owner.id, task.id, "mine");

    await expect(editTaskComment(outsider.id, ev.id, "hijack")).rejects.toThrow();
  });

  it("soft-deletes with deletedAt and is idempotent", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "T" });
    const ev = await commentEvent(owner.id, task.id, "bye");

    await deleteTaskComment(owner.id, ev.id);
    await deleteTaskComment(owner.id, ev.id);

    const after = await prisma.taskEvent.findUnique({ where: { id: ev.id } });
    expect(after?.deletedAt).not.toBeNull();
  });
});

describe("subtasks", () => {
  it("adds, toggles, and deletes a subtask; blocks outsiders", async () => {
    const { owner, project, outsider } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Parent" });

    const sub = await addSubtask(owner.id, task.id, "  step one  ");
    expect(sub.title).toBe("step one");
    expect(sub.done).toBe(false);

    await expect(addSubtask(outsider.id, task.id, "nope")).rejects.toThrow("NOT_A_MEMBER");

    const toggled = await toggleSubtask(owner.id, sub.id, true);
    expect(toggled.done).toBe(true);

    await deleteSubtask(owner.id, sub.id);
    expect(await prisma.subtask.findUnique({ where: { id: sub.id } })).toBeNull();
  });

  it("rejects an empty subtask title", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Parent" });

    await expect(addSubtask(owner.id, task.id, "   ")).rejects.toThrow("SUBTASK_TITLE_REQUIRED");
  });
});

describe("reorderTask — offline LWW", () => {
  it("applies a reorder with a newer clientTimestamp", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Reorder task" });
    const later = new Date(Date.now() + 60_000);

    const updated = await reorderTask(owner.id, task.id, 5, later);

    expect(updated.rank).toBe(5);
    expect(updated.rankUpdatedAt?.getTime()).toBe(later.getTime());
  });

  it("drops a reorder with an older clientTimestamp than the last one applied", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Reorder task 2" });
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    await reorderTask(owner.id, task.id, 5, now);
    const result = await reorderTask(owner.id, task.id, 9, earlier);

    expect(result.rank).toBe(5);
  });
});

describe("createTask — client-supplied id and rank", () => {
  it("uses a client-supplied id and rank when given (for offline-created tasks)", async () => {
    const { owner, project } = await setup();
    const clientId = `client-${Date.now()}`;

    const task = await createTask(owner.id, project.id, { title: "Offline task", id: clientId, rank: 42 });

    expect(task.id).toBe(clientId);
    expect(task.rank).toBe(42);
  });
});

import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { createProject, addProjectMemberByEmail } from "@/lib/projects/mutations";
import {
  createTask,
  updateTaskStatus,
  reassignTask,
  updateTaskPriority,
  updateTaskDueDate,
  updateTaskLabels,
  addTaskComment,
} from "@/lib/tasks/mutations";

let ownerId: string | undefined;
let outsiderId: string | undefined;
let projectId: string | undefined;

afterEach(async () => {
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  if (outsiderId) await prisma.user.deleteMany({ where: { id: outsiderId } });
  ownerId = outsiderId = projectId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const owner = await prisma.user.create({
    data: { email: `task-owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
  });
  ownerId = owner.id;
  const outsider = await prisma.user.create({
    data: { email: `task-outsider-${Date.now()}@example.com`, passwordHash: "x", name: "Outsider" },
  });
  outsiderId = outsider.id;
  const project = await createProject(owner.id, "Task Project");
  projectId = project.id;
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

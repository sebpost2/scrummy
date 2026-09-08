import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { addProjectMemberByEmail } from "@/lib/projects/mutations";
import { createTask, reassignTask, updateTaskDueDate, updateTaskStatus } from "@/lib/tasks/mutations";
import { getNavNotifications } from "@/lib/notifications/queries";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

afterEach(cleanupTestData);
afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const owner = await createTestUser({ name: "Owner" });
  const teammate = await createTestUser({ name: "Teammate" });
  const project = await createTestProject(owner.id, "Query Project");
  await addProjectMemberByEmail(owner.id, project.id, teammate.email);
  return { owner, teammate, project };
}

describe("getNavNotifications — stored notifications", () => {
  it("counts unread and lists recent notifications for that user only", async () => {
    const { owner, teammate, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Assign me" });
    await reassignTask(owner.id, task.id, teammate.id);

    const teammateResult = await getNavNotifications(teammate.id);
    expect(teammateResult.unreadCount).toBe(1);
    expect(teammateResult.items).toHaveLength(1);
    expect(teammateResult.items[0]).toMatchObject({ kind: "notification", type: "ASSIGNED", taskId: task.id });

    const ownerResult = await getNavNotifications(owner.id);
    expect(ownerResult.unreadCount).toBe(0);
  });
});

describe("getNavNotifications — due-soon/overdue", () => {
  it("includes a task due within 24h and an overdue task, for the assignee only", async () => {
    const { owner, teammate, project } = await setup();
    const dueSoon = await createTask(owner.id, project.id, { title: "Due soon" });
    await reassignTask(owner.id, dueSoon.id, teammate.id);
    await updateTaskDueDate(teammate.id, dueSoon.id, new Date(Date.now() + 23 * 60 * 60 * 1000));

    const overdue = await createTask(owner.id, project.id, { title: "Overdue" });
    await reassignTask(owner.id, overdue.id, teammate.id);
    await updateTaskDueDate(teammate.id, overdue.id, new Date(Date.now() - 60 * 60 * 1000));

    const result = await getNavNotifications(teammate.id);
    const dueItems = result.items.filter((i) => i.kind === "due");
    expect(dueItems.map((i) => i.taskId).sort()).toEqual([dueSoon.id, overdue.id].sort());
  });

  it("excludes a task due more than 24h out", async () => {
    const { owner, teammate, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Not yet" });
    await reassignTask(owner.id, task.id, teammate.id);
    await updateTaskDueDate(teammate.id, task.id, new Date(Date.now() + 25 * 60 * 60 * 1000));

    const result = await getNavNotifications(teammate.id);
    expect(result.items.filter((i) => i.kind === "due")).toHaveLength(0);
  });

  it("excludes a DONE task even if overdue", async () => {
    const { owner, teammate, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Finished" });
    await reassignTask(owner.id, task.id, teammate.id);
    await updateTaskDueDate(teammate.id, task.id, new Date(Date.now() - 60 * 60 * 1000));
    await updateTaskStatus(teammate.id, task.id, "DONE");

    const result = await getNavNotifications(teammate.id);
    expect(result.items.filter((i) => i.kind === "due")).toHaveLength(0);
  });
});

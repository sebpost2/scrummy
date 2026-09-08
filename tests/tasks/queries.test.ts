import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { addProjectMemberByEmail } from "@/lib/projects/mutations";
import {
  createTask,
  reassignTask,
  updateTaskPriority,
  updateTaskStatus,
  updateTaskLabels,
  addTaskComment,
} from "@/lib/tasks/mutations";
import { getBoardTasks, getMyTasks, getTaskWithEvents } from "@/lib/tasks/queries";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

afterEach(cleanupTestData);

afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const owner = await createTestUser({ name: "Owner" });
  const member = await createTestUser({ name: "Member" });
  const project = await createTestProject(owner.id, "Query Project");
  await addProjectMemberByEmail(owner.id, project.id, member.email);
  return { owner, member, project };
}

describe("getBoardTasks", () => {
  it("filters by assignee, label, and priority", async () => {
    const { owner, member, project } = await setup();
    const taskA = await createTask(owner.id, project.id, { title: "A" });
    await reassignTask(owner.id, taskA.id, member.id);
    await updateTaskLabels(owner.id, taskA.id, ["bug"]);
    await updateTaskPriority(owner.id, taskA.id, "HIGH");
    await createTask(owner.id, project.id, { title: "B" });

    const byAssignee = await getBoardTasks(project.id, { assigneeId: member.id });
    expect(byAssignee.map((t) => t.title)).toEqual(["A"]);

    const byLabel = await getBoardTasks(project.id, { label: "bug" });
    expect(byLabel.map((t) => t.title)).toEqual(["A"]);

    const byPriority = await getBoardTasks(project.id, { priority: "HIGH" });
    expect(byPriority.map((t) => t.title)).toEqual(["A"]);

    const all = await getBoardTasks(project.id, {});
    expect(all).toHaveLength(2);
  });

  it("filters by status and by a case-insensitive title search", async () => {
    const { owner, project } = await setup();
    const done = await createTask(owner.id, project.id, { title: "Ship the Widget" });
    await updateTaskStatus(owner.id, done.id, "DONE");
    await createTask(owner.id, project.id, { title: "Plan the offsite" });

    const byStatus = await getBoardTasks(project.id, { status: "DONE" });
    expect(byStatus.map((t) => t.title)).toEqual(["Ship the Widget"]);

    const bySearch = await getBoardTasks(project.id, { q: "widget" });
    expect(bySearch.map((t) => t.title)).toEqual(["Ship the Widget"]);

    const noMatch = await getBoardTasks(project.id, { q: "nonexistent" });
    expect(noMatch).toHaveLength(0);
  });
});

describe("getMyTasks", () => {
  it("returns tasks assigned to the user, sorted by due date with nulls last", async () => {
    const { owner, member, project } = await setup();
    const task1 = await createTask(owner.id, project.id, { title: "No due date" });
    await reassignTask(owner.id, task1.id, member.id);
    const task2 = await createTask(owner.id, project.id, { title: "Due soon" });
    await reassignTask(owner.id, task2.id, member.id);
    await prisma.task.update({ where: { id: task2.id }, data: { dueDate: new Date("2026-12-01") } });

    const mine = await getMyTasks(member.id);

    expect(mine.map((t) => t.title)).toEqual(["Due soon", "No due date"]);
    expect(mine[0].project.id).toBe(project.id);
  });
});

describe("getTaskWithEvents", () => {
  it("returns the task with its events newest-first", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Timeline me" });
    await addTaskComment(owner.id, task.id, "First comment");
    await updateTaskPriority(owner.id, task.id, "LOW");

    const detail = await getTaskWithEvents(task.id);

    expect(detail?.events.map((e) => e.type)).toEqual(["PRIORITY_CHANGED", "COMMENTED", "CREATED"]);
  });

  it("returns null for a nonexistent task", async () => {
    expect(await getTaskWithEvents("does-not-exist")).toBeNull();
  });
});

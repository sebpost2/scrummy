import { randomBytes } from "node:crypto";

import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";

let userId: string | undefined;
let projectId: string | undefined;
let mutationId: string | undefined;

afterEach(async () => {
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  if (mutationId) await prisma.syncedMutation.deleteMany({ where: { id: mutationId } });
  userId = undefined;
  projectId = undefined;
  mutationId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("schema", () => {
  it("creates a User, Project, ProjectMember, Task, and TaskEvent that all relate correctly", async () => {
    const user = await prisma.user.create({
      data: { email: `schema-${Date.now()}@example.com`, passwordHash: "x", name: "Test User" },
    });
    userId = user.id;

    const project = await prisma.project.create({
      data: {
        name: "Test Project",
        slug: `test-project-${Date.now()}`,
        inviteToken: randomBytes(16).toString("hex"),
        createdById: user.id,
      },
    });
    projectId = project.id;

    await prisma.projectMember.create({
      data: { userId: user.id, projectId: project.id, role: "OWNER" },
    });

    const task = await prisma.task.create({
      data: { projectId: project.id, title: "First task", createdById: user.id },
    });

    await prisma.taskEvent.create({
      data: { taskId: task.id, userId: user.id, type: "CREATED", clientTimestamp: new Date() },
    });

    const found = await prisma.task.findUnique({
      where: { id: task.id },
      include: { project: { include: { members: true } }, events: true },
    });

    expect(found?.status).toBe("TODO");
    expect(found?.priority).toBe("MEDIUM");
    expect(found?.project.members).toHaveLength(1);
    expect(found?.events).toHaveLength(1);
    expect(found?.events[0].type).toBe("CREATED");
  });

  it("tracks clientTimestamp on TaskEvent, rankUpdatedAt on Task, and dedups via SyncedMutation", async () => {
    const user = await prisma.user.create({
      data: { email: `schema2-${Date.now()}@example.com`, passwordHash: "x", name: "Test User 2" },
    });
    userId = user.id;

    const project = await prisma.project.create({
      data: {
        name: "Test Project 2",
        slug: `test-project-2-${Date.now()}`,
        inviteToken: randomBytes(16).toString("hex"),
        createdById: user.id,
      },
    });
    projectId = project.id;

    const task = await prisma.task.create({
      data: { projectId: project.id, title: "Second task", createdById: user.id },
    });

    const clientTimestamp = new Date("2026-01-01T00:00:00Z");
    const event = await prisma.taskEvent.create({
      data: { taskId: task.id, userId: user.id, type: "CREATED", clientTimestamp },
    });
    expect(event.clientTimestamp.toISOString()).toBe(clientTimestamp.toISOString());

    const reordered = await prisma.task.update({
      where: { id: task.id },
      data: { rankUpdatedAt: clientTimestamp },
    });
    expect(reordered.rankUpdatedAt?.toISOString()).toBe(clientTimestamp.toISOString());

    mutationId = `mut-${Date.now()}`;
    await prisma.syncedMutation.create({ data: { id: mutationId } });
    await expect(prisma.syncedMutation.create({ data: { id: mutationId } })).rejects.toThrow();
  });
});

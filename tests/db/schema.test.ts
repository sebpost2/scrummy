import { randomBytes } from "node:crypto";

import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";

let userId: string | undefined;
let projectId: string | undefined;

afterEach(async () => {
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  userId = undefined;
  projectId = undefined;
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
      data: { taskId: task.id, userId: user.id, type: "CREATED" },
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
});

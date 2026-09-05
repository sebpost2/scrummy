import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { prisma } from "@/lib/db/prisma";
import { createProject } from "@/lib/projects/mutations";
import { createTask, reassignTask } from "@/lib/tasks/mutations";
let userId: string | undefined;
let projectId: string | undefined;
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, requireUser: vi.fn(async () => ({ id: userId })) };
});
import MyTasksPage from "@/app/my-tasks/page";

afterEach(async () => {
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  userId = projectId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("MyTasksPage", () => {
  it("lists tasks assigned to the current user, grouped by project", async () => {
    const user = await prisma.user.create({
      data: { email: `mytasks-${Date.now()}@example.com`, passwordHash: "x", name: "Ada" },
    });
    userId = user.id;
    const project = await createProject(user.id, "My Tasks Project");
    projectId = project.id;
    const task = await createTask(user.id, project.id, { title: "Mine to do" });
    await reassignTask(user.id, task.id, user.id);

    const element = await MyTasksPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Mine to do");
    expect(html).toContain("My Tasks Project");
  });

  it("shows an empty state when nothing is assigned", async () => {
    const user = await prisma.user.create({
      data: { email: `mytasks2-${Date.now()}@example.com`, passwordHash: "x", name: "Ada" },
    });
    userId = user.id;

    const element = await MyTasksPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("nothing assigned");
  });
});

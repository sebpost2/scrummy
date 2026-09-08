import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { prisma } from "@/lib/db/prisma";
import { createTask, reassignTask } from "@/lib/tasks/mutations";
let userId: string | undefined;
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return {
    ...actual,
    requireUser: vi.fn(async () => ({ id: userId, name: "Ada", email: "nav@example.com" })),
  };
});
import MyTasksPage from "@/app/my-tasks/page";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

afterEach(async () => {
  await cleanupTestData();
  userId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("MyTasksPage", () => {
  it("lists tasks assigned to the current user, grouped by project", async () => {
    const user = await createTestUser({ name: "Ada" });
    userId = user.id;
    const project = await createTestProject(user.id, "My Tasks Project");
    const task = await createTask(user.id, project.id, { title: "Mine to do" });
    await reassignTask(user.id, task.id, user.id);

    const element = await MyTasksPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Mine to do");
    expect(html).toContain("My Tasks Project");
  });

  it("shows an empty state when nothing is assigned", async () => {
    const user = await createTestUser({ name: "Ada" });
    userId = user.id;

    const element = await MyTasksPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Nothing assigned");
  });
});

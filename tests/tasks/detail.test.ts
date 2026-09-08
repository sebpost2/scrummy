import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { prisma } from "@/lib/db/prisma";
import { createTask, updateTaskPriority, addTaskComment } from "@/lib/tasks/mutations";
let userId: string | undefined;
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return {
    ...actual,
    requireUser: vi.fn(async () => ({ id: userId, name: "Ada", email: "nav@example.com" })),
  };
});
import TaskDetailPage from "@/app/projects/[slug]/tasks/[id]/page";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

afterEach(async () => {
  await cleanupTestData();
  userId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("TaskDetailPage", () => {
  it("renders the task and its activity timeline newest-first", async () => {
    const user = await createTestUser({ name: "Ada" });
    userId = user.id;
    const project = await createTestProject(user.id, "Detail Project");
    const task = await createTask(user.id, project.id, { title: "Review the PR" });
    await addTaskComment(user.id, task.id, "Looks good");
    await updateTaskPriority(user.id, task.id, "HIGH");

    const element = await TaskDetailPage({
      params: Promise.resolve({ slug: project.slug, id: task.id }),
    });
    const html = renderToStaticMarkup(element);

    const priorityChangeIndex = html.indexOf("changed the priority");
    const commentIndex = html.indexOf("Looks good");
    expect(html).toContain("Review the PR");
    expect(priorityChangeIndex).toBeGreaterThan(-1);
    expect(commentIndex).toBeGreaterThan(-1);
    expect(priorityChangeIndex).toBeLessThan(commentIndex); // newest (priority change) before older (comment)
  });

  it("returns notFound for a nonexistent task", async () => {
    const user = await createTestUser({ name: "Ada" });
    userId = user.id;
    const project = await createTestProject(user.id, "Detail Project 2");

    let notFound: unknown;
    try {
      await TaskDetailPage({ params: Promise.resolve({ slug: project.slug, id: "does-not-exist" }) });
    } catch (err) {
      notFound = err;
    }
    expect((notFound as { digest?: string } | undefined)?.digest).toMatch(/NEXT_NOT_FOUND/);
  });
});

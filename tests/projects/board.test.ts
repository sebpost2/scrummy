import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { prisma } from "@/lib/db/prisma";
import { createTask } from "@/lib/tasks/mutations";
let userId: string | undefined;
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return {
    ...actual,
    requireUser: vi.fn(async () => ({ id: userId, name: "Ada", email: "nav@example.com" })),
  };
});
import BoardPage from "@/app/projects/[slug]/page";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

afterEach(async () => {
  await cleanupTestData();
  userId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("BoardPage", () => {
  it("renders tasks grouped under their status column", async () => {
    const user = await createTestUser({ name: "Ada" });
    userId = user.id;
    const project = await createTestProject(user.id, "Board Project");
    await createTask(user.id, project.id, { title: "Do the thing" });

    const element = await BoardPage({
      params: Promise.resolve({ slug: project.slug }),
      searchParams: Promise.resolve({}),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Do the thing");
    expect(html).toContain("To do");
  });

  it("returns notFound for a non-member", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const outsider = await createTestUser({ name: "Outsider" });
    userId = outsider.id;
    const project = await createTestProject(owner.id, "Private Project");

    let notFound: unknown;
    try {
      await BoardPage({ params: Promise.resolve({ slug: project.slug }), searchParams: Promise.resolve({}) });
    } catch (err) {
      notFound = err;
    }
    expect((notFound as { digest?: string } | undefined)?.digest).toMatch(/NEXT_NOT_FOUND/);
  });
});

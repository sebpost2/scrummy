import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { prisma } from "@/lib/db/prisma";
let userId: string | undefined;
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return {
    ...actual,
    requireUser: vi.fn(async () => ({ id: userId, name: "Ada", email: "nav@example.com" })),
  };
});
import ProjectsPage from "@/app/projects/page";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

afterEach(async () => {
  await cleanupTestData();
  userId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("ProjectsPage", () => {
  it("lists the current user's projects", async () => {
    const user = await createTestUser({ name: "Ada" });
    userId = user.id;
    await createTestProject(user.id, "Gastly Tasks");

    const element = await ProjectsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Gastly Tasks");
  });

  it("shows no projects for a brand-new user", async () => {
    const user = await createTestUser({ name: "Ada" });
    userId = user.id;

    const element = await ProjectsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("No projects yet");
  });
});

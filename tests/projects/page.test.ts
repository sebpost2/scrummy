import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { prisma } from "@/lib/db/prisma";
import { createProject } from "@/lib/projects/mutations";
let userId: string | undefined;
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, requireUser: vi.fn(async () => ({ id: userId })) };
});
import ProjectsPage from "@/app/projects/page";

afterEach(async () => {
  if (userId) {
    await prisma.project.deleteMany({ where: { createdById: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  userId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("ProjectsPage", () => {
  it("lists the current user's projects", async () => {
    const user = await prisma.user.create({
      data: { email: `projpage-${Date.now()}@example.com`, passwordHash: "x", name: "Ada" },
    });
    userId = user.id;
    await createProject(user.id, "Gastly Tasks");

    const element = await ProjectsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Gastly Tasks");
  });

  it("shows no projects for a brand-new user", async () => {
    const user = await prisma.user.create({
      data: { email: `projpage2-${Date.now()}@example.com`, passwordHash: "x", name: "Ada" },
    });
    userId = user.id;

    const element = await ProjectsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("No projects yet");
  });
});

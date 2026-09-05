import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { prisma } from "@/lib/db/prisma";
import { createProject } from "@/lib/projects/mutations";
import { createTask } from "@/lib/tasks/mutations";

let userId: string | undefined;
let outsiderId: string | undefined;
let ownerId: string | undefined;
let projectId: string | undefined;

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, requireUser: vi.fn(async () => ({ id: userId })) };
});

import BoardPage from "@/app/projects/[slug]/page";

afterEach(async () => {
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  if (outsiderId) await prisma.user.deleteMany({ where: { id: outsiderId } });
  if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  userId = outsiderId = ownerId = projectId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("BoardPage", () => {
  it("renders tasks grouped under their status column", async () => {
    const user = await prisma.user.create({
      data: { email: `board-${Date.now()}@example.com`, passwordHash: "x", name: "Ada" },
    });
    userId = user.id;
    const project = await createProject(user.id, "Board Project");
    projectId = project.id;
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
    const owner = await prisma.user.create({
      data: { email: `board-owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    const outsider = await prisma.user.create({
      data: { email: `board-outsider-${Date.now()}@example.com`, passwordHash: "x", name: "Outsider" },
    });
    outsiderId = outsider.id;
    userId = outsider.id;
    const project = await createProject(owner.id, "Private Project");
    projectId = project.id;
    ownerId_cleanup: {
      await prisma.user.deleteMany({ where: { id: owner.id, NOT: { id: owner.id } } }); // no-op guard, owner cleaned below
    }

    let notFound: unknown;
    try {
      await BoardPage({ params: Promise.resolve({ slug: project.slug }), searchParams: Promise.resolve({}) });
    } catch (err) {
      notFound = err;
    }
    expect((notFound as { digest?: string } | undefined)?.digest).toMatch(/NEXT_NOT_FOUND/);

    await prisma.project.deleteMany({ where: { id: project.id } });
    await prisma.user.deleteMany({ where: { id: owner.id } });
  });
});

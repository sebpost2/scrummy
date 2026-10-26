import { describe, it, expect, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { createDemoWorkspace, DEMO_EMAIL_DOMAIN } from "@/lib/demo/workspace";

const start = new Date();
const created: { userId: string; slug: string }[] = [];

afterAll(async () => {
  // Projects first: tasks and events cascade from them, and events still point at the users.
  for (const { slug } of created) await prisma.project.deleteMany({ where: { slug } });
  await prisma.user.deleteMany({
    where: { email: { endsWith: `@${DEMO_EMAIL_DOMAIN}` }, createdAt: { gte: start } },
  });
  await prisma.$disconnect();
});

describe("createDemoWorkspace", () => {
  it("builds a private board with a teammate and a real history", async () => {
    const ws = await createDemoWorkspace();
    created.push(ws);

    const project = await prisma.project.findUniqueOrThrow({
      where: { slug: ws.slug },
      include: { members: { include: { user: true } }, tasks: { include: { events: true } } },
    });

    expect(project.members.map((m) => [m.user.name, m.role]).sort()).toEqual([
      ["Dev", "OWNER"],
      ["Priya", "MEMBER"],
    ]);
    expect(project.members.find((m) => m.role === "OWNER")?.userId).toBe(ws.userId);

    const byTitle = Object.fromEntries(project.tasks.map((t) => [t.title, t]));
    expect(Object.keys(byTitle).sort()).toEqual([
      "Auth flow",
      "Board filters",
      "Fix timezone bug",
      "Write release notes",
    ]);
    expect(byTitle["Auth flow"].status).toBe("DONE");
    expect(byTitle["Board filters"].status).toBe("IN_PROGRESS");
    expect(byTitle["Board filters"].assigneeId).toBe(ws.userId);
    expect(byTitle["Fix timezone bug"].priority).toBe("HIGH");
    expect(byTitle["Board filters"].events.map((e) => e.type).sort()).toEqual([
      "COMMENTED",
      "CREATED",
      "REASSIGNED",
      "STATUS_CHANGED",
    ]);
  });

  it("gives every visitor their own copy", async () => {
    const a = await createDemoWorkspace();
    const b = await createDemoWorkspace();
    created.push(a, b);
    expect(a.slug).not.toBe(b.slug);
    expect(a.userId).not.toBe(b.userId);
  });
});

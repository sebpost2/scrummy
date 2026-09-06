import { describe, it, expect, afterEach, afterAll, vi } from "vitest";

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, getSessionUser: vi.fn() };
});

import { prisma } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { createProject } from "@/lib/projects/mutations";
import { createTask } from "@/lib/tasks/mutations";
import { POST } from "@/app/api/sync/route";

let ownerId: string | undefined;
let outsiderId: string | undefined;
let projectId: string | undefined;

afterEach(async () => {
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  if (outsiderId) await prisma.user.deleteMany({ where: { id: outsiderId } });
  ownerId = outsiderId = projectId = undefined;
  vi.mocked(getSessionUser).mockReset();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function request(body: unknown): Request {
  return new Request("http://localhost/api/sync", { method: "POST", body: JSON.stringify(body) });
}

describe("POST /api/sync", () => {
  it("returns 401 when there's no session", async () => {
    vi.mocked(getSessionUser).mockResolvedValue(null);

    const res = await POST(request({ id: "m1", type: "updateTaskStatus", args: [], clientTimestamp: Date.now() }));

    expect(res.status).toBe(401);
  });

  it("applies a registered mutation and dedups a repeat with the same id", async () => {
    const owner = await prisma.user.create({
      data: { email: `sync-owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    vi.mocked(getSessionUser).mockResolvedValue(owner);
    const project = await createProject(owner.id, "Sync Project");
    projectId = project.id;
    const task = await createTask(owner.id, project.id, { title: "Sync task" });

    const body = {
      id: `mut-${Date.now()}`,
      type: "updateTaskStatus" as const,
      args: [task.id, "IN_PROGRESS"],
      clientTimestamp: Date.now(),
    };

    const first = await POST(request(body));
    expect(first.status).toBe(200);
    const updated = await prisma.task.findUnique({ where: { id: task.id } });
    expect(updated?.status).toBe("IN_PROGRESS");

    const second = await POST(request(body));
    const secondJson = await second.json();
    expect(secondJson.deduped).toBe(true);
  });

  it("buckets a domain error as permanent, not transient", async () => {
    const owner = await prisma.user.create({
      data: { email: `sync-owner2-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const outsider = await prisma.user.create({
      data: { email: `sync-outsider-${Date.now()}@example.com`, passwordHash: "x", name: "Outsider" },
    });
    outsiderId = outsider.id;
    vi.mocked(getSessionUser).mockResolvedValue(owner);
    const project = await createProject(owner.id, "Sync Project 2");
    projectId = project.id;
    const task = await createTask(owner.id, project.id, { title: "Sync task 2" });

    const res = await POST(
      request({
        id: `mut-${Date.now()}`,
        type: "reassignTask",
        args: [task.id, outsider.id],
        clientTimestamp: Date.now(),
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.permanent).toBe(true);
    expect(json.error).toBe("ASSIGNEE_NOT_A_MEMBER");
  });

  it("returns 400 for an unknown mutation type", async () => {
    const owner = await prisma.user.create({
      data: { email: `sync-owner3-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    vi.mocked(getSessionUser).mockResolvedValue(owner);

    const res = await POST(
      // deliberately invalid type for the test — `request` takes `unknown`, so no ts-expect-error applies here
      request({ id: "m1", type: "notARealMutation", args: [], clientTimestamp: Date.now() }),
    );

    expect(res.status).toBe(400);
  });
});

import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import type { User } from "@prisma/client";

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, getSessionUser: vi.fn() };
});

import { prisma } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { createTask } from "@/lib/tasks/mutations";
import { POST } from "@/app/api/sync/route";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

afterEach(async () => {
  await cleanupTestData();
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
    const owner = await createTestUser({ name: "Owner" });
    vi.mocked(getSessionUser).mockResolvedValue(owner);
    const project = await createTestProject(owner.id, "Sync Project");
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
    const owner = await createTestUser({ name: "Owner" });
    const outsider = await createTestUser({ name: "Outsider" });
    vi.mocked(getSessionUser).mockResolvedValue(owner);
    const project = await createTestProject(owner.id, "Sync Project 2");
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

  it("parses a due-date string from the JSON wire format (not a Date instance)", async () => {
    const owner = await createTestUser({ name: "Owner" });
    vi.mocked(getSessionUser).mockResolvedValue(owner);
    const project = await createTestProject(owner.id, "Sync Project 4");
    const task = await createTask(owner.id, project.id, { title: "Sync task 4" });

    const t0 = Date.now();
    const setRes = await POST(
      request({
        id: `mut-set-${t0}`,
        type: "updateTaskDueDate",
        args: [task.id, "2026-06-01T00:00:00.000Z"],
        clientTimestamp: t0,
      }),
    );
    expect(setRes.status).toBe(200);
    const afterSet = await prisma.task.findUnique({ where: { id: task.id } });
    expect(afterSet?.dueDate?.toISOString()).toBe("2026-06-01T00:00:00.000Z");

    const t1 = t0 + 1000;
    const clearRes = await POST(
      request({
        id: `mut-clear-${t1}`,
        type: "updateTaskDueDate",
        args: [task.id, null],
        clientTimestamp: t1,
      }),
    );
    expect(clearRes.status).toBe(200);
    const afterClear = await prisma.task.findUnique({ where: { id: task.id } });
    expect(afterClear?.dueDate).toBeNull();
  });

  it("resolves a project slug to id and applies removeProjectMember", async () => {
    const owner = await createTestUser({ name: "Owner" });
    const member = await createTestUser({ name: "Member" });
    vi.mocked(getSessionUser).mockResolvedValue(owner);
    const project = await createTestProject(owner.id, "Sync Project 5");
    await prisma.projectMember.create({ data: { userId: member.id, projectId: project.id, role: "MEMBER" } });

    const res = await POST(
      request({
        id: `mut-${Date.now()}`,
        type: "removeProjectMember",
        args: [project.slug, member.id],
        clientTimestamp: Date.now(),
      }),
    );

    expect(res.status).toBe(200);
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: member.id, projectId: project.id } },
    });
    expect(membership).toBeNull();
  });

  it("buckets an unresolvable project slug as permanent, not transient", async () => {
    const owner = await createTestUser({ name: "Owner" });
    vi.mocked(getSessionUser).mockResolvedValue(owner);

    const res = await POST(
      request({
        id: `mut-${Date.now()}`,
        type: "regenerateInviteToken",
        args: ["no-such-project-slug"],
        clientTimestamp: Date.now(),
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.permanent).toBe(true);
    expect(json.error).toBe("PROJECT_NOT_FOUND");
  });

  it("returns 400 for an unknown mutation type", async () => {
    const owner = await createTestUser({ name: "Owner" });
    vi.mocked(getSessionUser).mockResolvedValue(owner);

    const res = await POST(
      // deliberately invalid type for the test — `request` takes `unknown`, so no ts-expect-error applies here
      request({ id: "m1", type: "notARealMutation", args: [], clientTimestamp: Date.now() }),
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 for a malformed body instead of throwing", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1" } as User);

    const res = await POST(new Request("http://localhost/api/sync", { method: "POST", body: "not json" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("INVALID_BODY");
  });

  it("does not treat an Object.prototype key as a registered mutation", async () => {
    vi.mocked(getSessionUser).mockResolvedValue({ id: "u1" } as User);

    const res = await POST(request({ id: "m1", type: "toString", args: [], clientTimestamp: Date.now() }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("UNKNOWN_MUTATION_TYPE");
  });
});

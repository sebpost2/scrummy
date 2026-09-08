import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { addProjectMemberByEmail } from "@/lib/projects/mutations";
import { createTask } from "@/lib/tasks/mutations";
import {
  notifyAssigned,
  notifyMentions,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/notifications/mutations";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

afterEach(cleanupTestData);
afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const owner = await createTestUser({ name: "Owner" });
  const teammate = await createTestUser({ name: "Teammate" });
  const project = await createTestProject(owner.id, "Notif Project");
  await addProjectMemberByEmail(owner.id, project.id, teammate.email);
  const task = await createTask(owner.id, project.id, { title: "Do the thing" });
  return { owner, teammate, project, task };
}

describe("notifyAssigned", () => {
  it("creates an ASSIGNED notification for the assignee", async () => {
    const { owner, teammate, task } = await setup();

    await notifyAssigned(owner.id, task.id, teammate.id);

    const notifs = await prisma.notification.findMany({ where: { userId: teammate.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("ASSIGNED");
    expect(notifs[0].taskId).toBe(task.id);
    expect(notifs[0].actorId).toBe(owner.id);
  });

  it("does not notify when assigning to yourself", async () => {
    const { owner, task } = await setup();

    await notifyAssigned(owner.id, task.id, owner.id);

    const notifs = await prisma.notification.findMany({ where: { userId: owner.id } });
    expect(notifs).toHaveLength(0);
  });
});

describe("notifyMentions", () => {
  it("creates a MENTIONED notification for each mentioned project member", async () => {
    const { owner, teammate, project, task } = await setup();

    await notifyMentions(owner.id, project.id, task.id, [teammate.id]);

    const notifs = await prisma.notification.findMany({ where: { userId: teammate.id } });
    expect(notifs).toHaveLength(1);
    expect(notifs[0].type).toBe("MENTIONED");
  });

  it("ignores the actor's own id and ids that aren't project members", async () => {
    const { owner, project, task } = await setup();
    const outsider = await createTestUser({ name: "Outsider" });

    await notifyMentions(owner.id, project.id, task.id, [owner.id, outsider.id]);

    const notifs = await prisma.notification.findMany({ where: { taskId: task.id } });
    expect(notifs).toHaveLength(0);
  });
});

describe("markNotificationRead", () => {
  it("marks the caller's own notification read", async () => {
    const { owner, teammate, task } = await setup();
    await notifyAssigned(owner.id, task.id, teammate.id);
    const [notif] = await prisma.notification.findMany({ where: { userId: teammate.id } });

    await markNotificationRead(teammate.id, notif.id);

    const updated = await prisma.notification.findUnique({ where: { id: notif.id } });
    expect(updated?.readAt).not.toBeNull();
  });

  it("does not let another user mark it read", async () => {
    const { owner, teammate, task } = await setup();
    await notifyAssigned(owner.id, task.id, teammate.id);
    const [notif] = await prisma.notification.findMany({ where: { userId: teammate.id } });

    await markNotificationRead(owner.id, notif.id);

    const updated = await prisma.notification.findUnique({ where: { id: notif.id } });
    expect(updated?.readAt).toBeNull();
  });
});

describe("markAllNotificationsRead", () => {
  it("marks every unread notification for that user read, and no one else's", async () => {
    const { owner, teammate, task } = await setup();
    await notifyAssigned(owner.id, task.id, teammate.id);
    await notifyMentions(owner.id, task.projectId, task.id, [teammate.id]);
    const other = await createTestUser({ name: "Other" });
    await prisma.notification.create({
      data: { userId: other.id, type: "ASSIGNED", taskId: task.id },
    });

    await markAllNotificationsRead(teammate.id);

    const teammateNotifs = await prisma.notification.findMany({ where: { userId: teammate.id } });
    expect(teammateNotifs.every((n) => n.readAt !== null)).toBe(true);
    const otherNotif = await prisma.notification.findFirst({ where: { userId: other.id } });
    expect(otherNotif?.readAt).toBeNull();
  });
});

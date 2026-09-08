# Notifications + @mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app notifications (assigned-to-you, @mentioned-in-a-comment) plus a live-computed due-soon/overdue reminder, surfaced via a bell icon in the nav.

**Architecture:** A new `Notification` table stores real, persisted events (`ASSIGNED`, `MENTIONED`), written from the single shared mutation module (`lib/tasks/mutations.ts`) that all task mutations already route through. Due-soon/overdue reminders are computed live at read time from existing `Task` rows — never stored. A new `NotificationsBell` client component (reusing the existing `Menu` dropdown primitive) reads both, merged, via a `getNavNotifications(userId)` query called from each of the six pages that already render `<Nav>`.

**Tech Stack:** Next.js App Router, Prisma/PostgreSQL, Vitest — matches the rest of the repo. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-07-notifications-mentions-design.md`

## Global Constraints

- In-app only. No email delivery, no new email-sending dependency.
- No cron/background job. Due-soon/overdue is computed on every read, never persisted.
- Triggers are exactly `ASSIGNED` and `MENTIONED`. No "commented on your task" trigger.
- Notification actions (mark read / mark all read) are **not** added to `lib/sync/mutationRegistry.ts` — they are not part of the offline outbox. Losing a "mark as read" while offline is inconsequential; it doesn't need offline replay.
- Bell + dropdown in `Nav`, not a dedicated `/notifications` page.
- Badge count refreshes on next navigation/page load (the app's existing `revalidatePath` + refetch pattern) — not a live push count.

---

## Task 1: Notification data model

**Files:**
- Modify: `prisma/schema.prisma`
- Migration: `prisma/migrations/<timestamp>_add_notifications/migration.sql` (generated)

**Interfaces:**
- Produces: Prisma model `Notification` with fields `id, userId, type (NotificationType: ASSIGNED | MENTIONED), taskId, actorId (nullable), readAt (nullable), createdAt`. Relations: `User.notifications` (recipient, cascade delete), `User.triggeredNotifications` (actor, set-null delete), `Task.notifications` (cascade delete). Index on `[userId, readAt]`.

- [ ] **Step 1: Add the enum and model to `prisma/schema.prisma`**

Add this enum near the other enums (after `TaskEventType`):

```prisma
enum NotificationType {
  ASSIGNED
  MENTIONED
}
```

Add this model at the end of the file:

```prisma
model Notification {
  id        String           @id @default(cuid())
  userId    String
  user      User             @relation("NotificationRecipient", fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  taskId    String
  task      Task             @relation(fields: [taskId], references: [id], onDelete: Cascade)
  actorId   String?
  actor     User?            @relation("NotificationActor", fields: [actorId], references: [id], onDelete: SetNull)
  readAt    DateTime?
  createdAt DateTime         @default(now())

  @@index([userId, readAt])
}
```

- [ ] **Step 2: Wire the relations on `User` and `Task`**

In `model User`, add two lines after `taskEvents      TaskEvent[]`:

```prisma
  notifications          Notification[] @relation("NotificationRecipient")
  triggeredNotifications Notification[] @relation("NotificationActor")
```

In `model Task`, add one line after `subtasks Subtask[]`:

```prisma
  notifications Notification[]
```

- [ ] **Step 3: Generate and apply the migration**

Run: `npx prisma migrate dev --name add_notifications`

Expected: a new folder `prisma/migrations/<timestamp>_add_notifications/migration.sql` is created containing `CREATE TYPE "NotificationType"` and `CREATE TABLE "Notification"` statements, and the command exits 0.

- [ ] **Step 4: Verify the client regenerated cleanly**

Run: `npx prisma validate`

Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(notifications): add Notification model"
```

---

## Task 2: Notification mutations

**Files:**
- Create: `lib/notifications/mutations.ts`
- Test: `tests/notifications/mutations.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db/prisma`; `Notification`/`NotificationType` types from `@prisma/client`.
- Produces:
  - `notifyAssigned(actorId: string, taskId: string, assigneeId: string): Promise<void>`
  - `notifyMentions(actorId: string, projectId: string, taskId: string, mentionedUserIds: string[]): Promise<void>`
  - `markNotificationRead(userId: string, notificationId: string): Promise<void>`
  - `markAllNotificationsRead(userId: string): Promise<void>`

- [ ] **Step 1: Write the failing tests**

Create `tests/notifications/mutations.test.ts`:

```ts
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

    const notifs = await prisma.notification.findMany();
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notifications/mutations.test.ts`
Expected: FAIL — `Cannot find module '@/lib/notifications/mutations'`

- [ ] **Step 3: Implement `lib/notifications/mutations.ts`**

```ts
import { prisma } from "@/lib/db/prisma";

export async function notifyAssigned(actorId: string, taskId: string, assigneeId: string): Promise<void> {
  if (assigneeId === actorId) return;
  await prisma.notification.create({
    data: { userId: assigneeId, type: "ASSIGNED", taskId, actorId },
  });
}

export async function notifyMentions(
  actorId: string,
  projectId: string,
  taskId: string,
  mentionedUserIds: string[],
): Promise<void> {
  const candidateIds = [...new Set(mentionedUserIds)].filter((id) => id !== actorId);
  if (candidateIds.length === 0) return;

  const members = await prisma.projectMember.findMany({
    where: { projectId, userId: { in: candidateIds } },
    select: { userId: true },
  });
  if (members.length === 0) return;

  await prisma.notification.createMany({
    data: members.map((m) => ({ userId: m.userId, type: "MENTIONED" as const, taskId, actorId })),
  });
}

// Scoped by userId in the WHERE clause, not a separate ownership check: if the
// notification belongs to someone else, this updates zero rows instead of
// throwing — the caller can't tell the difference between "not yours" and
// "already read", which is fine, both are no-ops from their perspective.
export async function markNotificationRead(userId: string, notificationId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data: { readAt: new Date() },
  });
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notifications/mutations.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/mutations.ts tests/notifications/mutations.test.ts
git commit -m "feat(notifications): add notification create/read mutations"
```

---

## Task 3: Wire assignment and mention triggers into task mutations

**Files:**
- Modify: `lib/tasks/mutations.ts` (`reassignTask`, `addTaskComment`)
- Modify: `lib/sync/mutationRegistry.ts` (`addTaskComment` handler)
- Modify: `tests/tasks/mutations.test.ts` (append new `describe` blocks)

**Interfaces:**
- Consumes: `notifyAssigned`, `notifyMentions` from `@/lib/notifications/mutations` (Task 2).
- Produces: `addTaskComment(userId, taskId, comment, mentionedUserIds?: string[])` — the 4th parameter is new and optional, so every existing call site (`addCommentAction`, `tests/tasks/detail.test.ts`, the mutation registry) keeps compiling unchanged unless updated in a later task.

- [ ] **Step 1: Write the failing tests**

Append to `tests/tasks/mutations.test.ts` (after the existing `describe("reassignTask", ...)` block, using the same `setup()` helper already defined in that file):

```ts
describe("reassignTask — notifications", () => {
  it("notifies the new assignee", async () => {
    const { owner, project, outsider } = await setup();
    await addProjectMemberByEmail(owner.id, project.id, outsider.email);
    const task = await createTask(owner.id, project.id, { title: "Assign me" });

    await reassignTask(owner.id, task.id, outsider.id);

    const notifs = await prisma.notification.findMany({ where: { userId: outsider.id, type: "ASSIGNED" } });
    expect(notifs).toHaveLength(1);
  });

  it("does not notify on self-assignment", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Assign me" });

    await reassignTask(owner.id, task.id, owner.id);

    const notifs = await prisma.notification.findMany({ where: { userId: owner.id, type: "ASSIGNED" } });
    expect(notifs).toHaveLength(0);
  });

  it("does not notify when an older offline reassignment is overwritten by a newer one", async () => {
    const { owner, project, outsider } = await setup();
    await addProjectMemberByEmail(owner.id, project.id, outsider.email);
    const task = await createTask(owner.id, project.id, { title: "LWW assign" });
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    await reassignTask(owner.id, task.id, outsider.id, now);
    await prisma.notification.deleteMany(); // isolate the second call
    await reassignTask(owner.id, task.id, null, earlier);

    const notifs = await prisma.notification.findMany();
    expect(notifs).toHaveLength(0);
  });
});

describe("addTaskComment — mentions", () => {
  it("notifies mentioned project members", async () => {
    const { owner, project, outsider } = await setup();
    await addProjectMemberByEmail(owner.id, project.id, outsider.email);
    const task = await createTask(owner.id, project.id, { title: "Comment me" });

    await addTaskComment(owner.id, task.id, "cc @Outsider", [outsider.id]);

    const notifs = await prisma.notification.findMany({ where: { userId: outsider.id, type: "MENTIONED" } });
    expect(notifs).toHaveLength(1);
  });

  it("works with no mentions, unchanged from before", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Comment me" });

    await addTaskComment(owner.id, task.id, "no mentions here");

    const notifs = await prisma.notification.findMany();
    expect(notifs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/tasks/mutations.test.ts`
Expected: FAIL — the new tests find 0 `ASSIGNED`/`MENTIONED` notifications where they expect 1 (the trigger code doesn't exist yet).

- [ ] **Step 3: Wire the triggers in `lib/tasks/mutations.ts`**

Add the import at the top, alongside the existing imports:

```ts
import { notifyAssigned, notifyMentions } from "@/lib/notifications/mutations";
```

Replace the body of `reassignTask` (the final `return applyLwwFieldChange(...)` line) with:

```ts
  const updated = await applyLwwFieldChange(
    task,
    userId,
    "REASSIGNED",
    { assigneeId },
    task.assigneeId,
    assigneeId,
    clientTimestamp,
  );
  if (assigneeId && updated.assigneeId === assigneeId) {
    await notifyAssigned(userId, taskId, assigneeId);
  }
  return updated;
```

Replace `addTaskComment`'s signature and body with:

```ts
export async function addTaskComment(
  userId: string,
  taskId: string,
  comment: string,
  mentionedUserIds: string[] = [],
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  const trimmed = comment.trim();
  if (!trimmed) throw new Error("COMMENT_REQUIRED");
  if (trimmed.length > LIMITS.comment) throw new Error("COMMENT_TOO_LONG");

  await prisma.taskEvent.create({
    data: { taskId, userId, type: "COMMENTED", comment: trimmed },
  });

  if (mentionedUserIds.length > 0) {
    await notifyMentions(userId, task.projectId, taskId, mentionedUserIds);
  }

  return task;
}
```

- [ ] **Step 4: Update the sync mutation registry**

In `lib/sync/mutationRegistry.ts`, replace the `addTaskComment` line with:

```ts
  addTaskComment: (userId, args) =>
    addTaskComment(userId, args[0] as string, args[1] as string, args[2] as string[] | undefined),
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/tasks/mutations.test.ts`
Expected: PASS (all tests in the file, old and new)

- [ ] **Step 6: Commit**

```bash
git add lib/tasks/mutations.ts lib/sync/mutationRegistry.ts tests/tasks/mutations.test.ts
git commit -m "feat(notifications): trigger notifications on assignment and mentions"
```

---

## Task 4: Nav notification query (stored + computed due-soon)

**Files:**
- Create: `lib/notifications/queries.ts`
- Test: `tests/notifications/queries.test.ts`

**Interfaces:**
- Consumes: `prisma` from `@/lib/db/prisma`.
- Produces: `getNavNotifications(userId: string): Promise<{ unreadCount: number; items: NavNotificationItem[] }>` and the exported type `NavNotificationItem` — a discriminated union on `kind: "notification" | "due"`, consumed by `NotificationsBell` (Task 6) and every page that renders `<Nav>` (Task 7).

- [ ] **Step 1: Write the failing tests**

Create `tests/notifications/queries.test.ts`:

```ts
import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { addProjectMemberByEmail } from "@/lib/projects/mutations";
import { createTask, reassignTask, updateTaskDueDate, updateTaskStatus } from "@/lib/tasks/mutations";
import { getNavNotifications } from "@/lib/notifications/queries";

import { createTestUser, createTestProject, cleanupTestData } from "../helpers";

afterEach(cleanupTestData);
afterAll(async () => {
  await prisma.$disconnect();
});

async function setup() {
  const owner = await createTestUser({ name: "Owner" });
  const teammate = await createTestUser({ name: "Teammate" });
  const project = await createTestProject(owner.id, "Query Project");
  await addProjectMemberByEmail(owner.id, project.id, teammate.email);
  return { owner, teammate, project };
}

describe("getNavNotifications — stored notifications", () => {
  it("counts unread and lists recent notifications for that user only", async () => {
    const { owner, teammate, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Assign me" });
    await reassignTask(owner.id, task.id, teammate.id);

    const teammateResult = await getNavNotifications(teammate.id);
    expect(teammateResult.unreadCount).toBe(1);
    expect(teammateResult.items).toHaveLength(1);
    expect(teammateResult.items[0]).toMatchObject({ kind: "notification", type: "ASSIGNED", taskId: task.id });

    const ownerResult = await getNavNotifications(owner.id);
    expect(ownerResult.unreadCount).toBe(0);
  });
});

describe("getNavNotifications — due-soon/overdue", () => {
  it("includes a task due within 24h and an overdue task, for the assignee only", async () => {
    const { owner, teammate, project } = await setup();
    const dueSoon = await createTask(owner.id, project.id, { title: "Due soon" });
    await reassignTask(owner.id, dueSoon.id, teammate.id);
    await updateTaskDueDate(teammate.id, dueSoon.id, new Date(Date.now() + 23 * 60 * 60 * 1000));

    const overdue = await createTask(owner.id, project.id, { title: "Overdue" });
    await reassignTask(owner.id, overdue.id, teammate.id);
    await updateTaskDueDate(teammate.id, overdue.id, new Date(Date.now() - 60 * 60 * 1000));

    const result = await getNavNotifications(teammate.id);
    const dueItems = result.items.filter((i) => i.kind === "due");
    expect(dueItems.map((i) => i.taskId).sort()).toEqual([dueSoon.id, overdue.id].sort());
  });

  it("excludes a task due more than 24h out", async () => {
    const { owner, teammate, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Not yet" });
    await reassignTask(owner.id, task.id, teammate.id);
    await updateTaskDueDate(teammate.id, task.id, new Date(Date.now() + 25 * 60 * 60 * 1000));

    const result = await getNavNotifications(teammate.id);
    expect(result.items.filter((i) => i.kind === "due")).toHaveLength(0);
  });

  it("excludes a DONE task even if overdue", async () => {
    const { owner, teammate, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Finished" });
    await reassignTask(owner.id, task.id, teammate.id);
    await updateTaskDueDate(teammate.id, task.id, new Date(Date.now() - 60 * 60 * 1000));
    await updateTaskStatus(teammate.id, task.id, "DONE");

    const result = await getNavNotifications(teammate.id);
    expect(result.items.filter((i) => i.kind === "due")).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/notifications/queries.test.ts`
Expected: FAIL — `Cannot find module '@/lib/notifications/queries'`

- [ ] **Step 3: Implement `lib/notifications/queries.ts`**

```ts
import type { NotificationType } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

const MAX_ITEMS = 20;
const DUE_SOON_HOURS = 24;

export type NavNotificationItem =
  | {
      kind: "notification";
      id: string;
      type: NotificationType;
      taskId: string;
      taskTitle: string;
      projectSlug: string;
      actorName: string | null;
      readAt: Date | null;
      createdAt: Date;
    }
  | {
      kind: "due";
      taskId: string;
      taskTitle: string;
      projectSlug: string;
      dueDate: Date;
    };

export async function getNavNotifications(
  userId: string,
): Promise<{ unreadCount: number; items: NavNotificationItem[] }> {
  const [stored, dueSoon, unreadStoredCount] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      include: { task: { include: { project: true } }, actor: true },
      orderBy: { createdAt: "desc" },
      take: MAX_ITEMS,
    }),
    prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: { not: "DONE" },
        dueDate: { lte: new Date(Date.now() + DUE_SOON_HOURS * 60 * 60 * 1000) },
      },
      include: { project: true },
      orderBy: { dueDate: "asc" },
      take: MAX_ITEMS,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  const items: NavNotificationItem[] = [
    ...stored.map((n) => ({
      kind: "notification" as const,
      id: n.id,
      type: n.type,
      taskId: n.taskId,
      taskTitle: n.task.title,
      projectSlug: n.task.project.slug,
      actorName: n.actor?.name ?? null,
      readAt: n.readAt,
      createdAt: n.createdAt,
    })),
    ...dueSoon.map((t) => ({
      kind: "due" as const,
      taskId: t.id,
      taskTitle: t.title,
      projectSlug: t.project.slug,
      dueDate: t.dueDate as Date,
    })),
  ];

  return { unreadCount: unreadStoredCount + dueSoon.length, items };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/notifications/queries.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/notifications/queries.ts tests/notifications/queries.test.ts
git commit -m "feat(notifications): add nav notification query with live due-soon computation"
```

---

## Task 5: Mark-read server actions

**Files:**
- Create: `app/_components/notificationsActions.ts`

**Interfaces:**
- Consumes: `requireUser` from `@/lib/auth/session`; `markNotificationRead`, `markAllNotificationsRead` from `@/lib/notifications/mutations` (Task 2).
- Produces: `markNotificationReadAction(notificationId: string): Promise<void>`, `markAllNotificationsReadAction(): Promise<void>` — consumed by `NotificationsBell` in Task 6.

Not registered in `lib/sync/mutationRegistry.ts` — see Global Constraints. No test file: this is a two-line pass-through over already-tested mutations (Task 2), matching how thin server actions elsewhere in the repo (e.g. `updateTitleAction` in `app/projects/[slug]/tasks/[id]/actions.ts`) aren't separately unit-tested — their coverage comes from the mutation-layer tests plus the page-render tests in Task 7.

- [ ] **Step 1: Implement `app/_components/notificationsActions.ts`**

```ts
"use server";

import { requireUser } from "@/lib/auth/session";
import { markNotificationRead, markAllNotificationsRead } from "@/lib/notifications/mutations";

export async function markNotificationReadAction(notificationId: string): Promise<void> {
  const user = await requireUser();
  await markNotificationRead(user.id, notificationId);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await requireUser();
  await markAllNotificationsRead(user.id);
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (the functions aren't called from anywhere yet, so this just confirms the file itself compiles).

- [ ] **Step 3: Commit**

```bash
git add app/_components/notificationsActions.ts
git commit -m "feat(notifications): add mark-read server actions"
```

---

## Task 6: NotificationsBell UI + Nav wiring

**Files:**
- Create: `app/_components/NotificationsBell.tsx`
- Modify: `app/_components/Nav.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `NavNotificationItem` type from `@/lib/notifications/queries` (Task 4); `markNotificationReadAction`, `markAllNotificationsReadAction` from `./notificationsActions` (Task 5); existing `Menu`/`MenuItem`/`MenuSeparator` (`./Menu`), `Avatar` (`./Avatar`), `RelativeTime` (`./RelativeTime`).
- Produces: `Nav` now requires a `notifications: { unreadCount: number; items: NavNotificationItem[] }` prop — every caller must be updated (done in Task 7). Making it required rather than optional is intentional: it forces the compiler to catch every page that still needs updating.

- [ ] **Step 1: Create `app/_components/NotificationsBell.tsx`**

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";

import type { NavNotificationItem } from "@/lib/notifications/queries";

import Avatar from "./Avatar";
import RelativeTime from "./RelativeTime";
import Menu, { MenuItem, MenuSeparator } from "./Menu";
import { markNotificationReadAction, markAllNotificationsReadAction } from "./notificationsActions";

const TRIGGER_LABEL: Record<"ASSIGNED" | "MENTIONED", string> = {
  ASSIGNED: "assigned you",
  MENTIONED: "mentioned you",
};

export default function NotificationsBell({
  unreadCount,
  items,
}: {
  unreadCount: number;
  items: NavNotificationItem[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  function markRead(id: string) {
    startTransition(async () => {
      await markNotificationReadAction(id);
      router.refresh();
    });
  }

  function markAllRead() {
    startTransition(async () => {
      await markAllNotificationsReadAction();
      router.refresh();
    });
  }

  return (
    <Menu
      align="end"
      label={unreadCount > 0 ? `Notifications (${unreadCount} unread)` : "Notifications"}
      trigger={
        <span className="notif-trigger">
          <Bell size={16} />
          {unreadCount > 0 && <span className="notif-dot">{unreadCount > 9 ? "9+" : unreadCount}</span>}
        </span>
      }
    >
      <div className="menu__header">
        <span className="menu__header-name">Notifications</span>
      </div>
      {items.length === 0 ? (
        <p className="notif-empty">You&apos;re all caught up.</p>
      ) : (
        items.map((item) =>
          item.kind === "notification" ? (
            <MenuItem
              key={item.id}
              href={`/projects/${item.projectSlug}/tasks/${item.taskId}`}
              onSelect={() => markRead(item.id)}
            >
              <span className={`notif-item${item.readAt ? "" : " notif-item--unread"}`}>
                {item.actorName && <Avatar name={item.actorName} size="sm" />}
                <span className="notif-item__body">
                  <span className="notif-item__text">
                    {item.actorName ?? "Someone"} {TRIGGER_LABEL[item.type as "ASSIGNED" | "MENTIONED"]} on{" "}
                    <strong>{item.taskTitle}</strong>
                  </span>
                  <RelativeTime date={item.createdAt} className="notif-item__time" />
                </span>
              </span>
            </MenuItem>
          ) : (
            <MenuItem key={`due-${item.taskId}`} href={`/projects/${item.projectSlug}/tasks/${item.taskId}`}>
              <span className="notif-item notif-item--unread">
                <span className="notif-item__body">
                  <span className="notif-item__text">
                    <strong>{item.taskTitle}</strong> is due soon
                  </span>
                  <RelativeTime date={item.dueDate} className="notif-item__time" />
                </span>
              </span>
            </MenuItem>
          ),
        )
      )}
      {unreadCount > 0 && (
        <>
          <MenuSeparator />
          <MenuItem onSelect={markAllRead}>Mark all as read</MenuItem>
        </>
      )}
    </Menu>
  );
}
```

- [ ] **Step 2: Wire it into `app/_components/Nav.tsx`**

Add the import:

```tsx
import type { NavNotificationItem } from "@/lib/notifications/queries";

import NotificationsBell from "./NotificationsBell";
```

Change the `Nav` props type to add `notifications`:

```tsx
export function Nav({
  user,
  projects = [],
  currentSlug,
  notifications,
}: {
  user: { name: string; email: string };
  projects?: { name: string; slug: string }[];
  currentSlug?: string;
  notifications: { unreadCount: number; items: NavNotificationItem[] };
}) {
```

In the JSX, add `<NotificationsBell>` inside `.nav__links`, before `<ThemeToggle />`:

```tsx
          <NotificationsBell unreadCount={notifications.unreadCount} items={notifications.items} />
          <ThemeToggle />
```

- [ ] **Step 3: Add the CSS**

Append to `app/globals.css`, near the existing `.menu__*` rules:

```css
.notif-trigger {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.notif-dot {
  position: absolute;
  top: -4px;
  right: -6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 15px;
  height: 15px;
  padding: 0 3px;
  font-size: 0.625rem;
  font-weight: 600;
  line-height: 1;
  color: white;
  background: var(--danger);
  border-radius: 999px;
}

.notif-empty {
  padding: 12px 8px;
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.notif-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
  width: 100%;
}

.notif-item--unread .notif-item__text {
  font-weight: 500;
  color: var(--text);
}

.notif-item__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.notif-item__text {
  font-size: var(--text-sm);
  color: var(--text-muted);
  white-space: normal;
}

.notif-item__time {
  font-size: 0.6875rem;
  color: var(--text-muted);
}
```

Note: `NotificationsBell`'s trigger button already gets `.menu__trigger` styling from `Menu`; this only styles the bell icon's badge and the dropdown row contents, matching how `ProjectSwitcher`/`UserMenu` layer their own classes on top of `.menu__*`.

- [ ] **Step 4: Typecheck (Nav's new required prop will show every caller still needing an update — expected, resolved in Task 7)**

Run: `npx tsc --noEmit`
Expected: errors listing the 6 `<Nav ...>` call sites missing the `notifications` prop. This confirms the compiler caught them; Task 7 fixes each one.

- [ ] **Step 5: Commit**

```bash
git add app/_components/NotificationsBell.tsx app/_components/Nav.tsx app/globals.css
git commit -m "feat(notifications): add NotificationsBell UI"
```

---

## Task 7: Fetch notifications on every page that renders Nav

**Files:**
- Modify: `app/my-tasks/page.tsx`
- Modify: `app/projects/page.tsx`
- Modify: `app/projects/[slug]/page.tsx`
- Modify: `app/projects/[slug]/members/page.tsx`
- Modify: `app/projects/[slug]/settings/page.tsx`
- Modify: `app/projects/[slug]/tasks/[id]/page.tsx`

**Interfaces:**
- Consumes: `getNavNotifications` from `@/lib/notifications/queries` (Task 4).

This task's steps are the same six-line mechanical edit repeated per file — one import added, one call added, one prop passed. Each file's edit is shown in full since they differ in exact surrounding context.

- [ ] **Step 1: `app/my-tasks/page.tsx`**

Add the import alongside `getNavProjects`:

```tsx
import { getNavProjects } from "@/lib/projects/queries";
import { getNavNotifications } from "@/lib/notifications/queries";
```

After `const navProjects = await getNavProjects(user.id);`, add:

```tsx
  const notifications = await getNavNotifications(user.id);
```

Update the `<Nav>` call:

```tsx
      <Nav
        user={{ name: user.name, email: user.email }}
        projects={navProjects.map((m) => ({ name: m.project.name, slug: m.project.slug }))}
        notifications={notifications}
      />
```

- [ ] **Step 2: `app/projects/page.tsx`, `app/projects/[slug]/page.tsx`, `app/projects/[slug]/members/page.tsx`, `app/projects/[slug]/settings/page.tsx`, `app/projects/[slug]/tasks/[id]/page.tsx`**

For each file: add `import { getNavNotifications } from "@/lib/notifications/queries";` near its other `lib` imports, add `const notifications = await getNavNotifications(user.id);` right after that file's existing `requireUser()`/`navProjects` fetch, and add `notifications={notifications}` as a prop on that file's `<Nav ...>` call — following the exact pattern from Step 1. Read each file first to match its existing variable names and import grouping before editing.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors — all six `<Nav>` call sites now satisfy the required `notifications` prop.

- [ ] **Step 4: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, including the pre-existing page-render tests (`tests/myTasks/page.test.ts`, `tests/projects/page.test.ts`, `tests/projects/board.test.ts`, `tests/projects/members.test.ts`, `tests/tasks/detail.test.ts`, `tests/invite/page.test.ts`) — these call the page functions directly via `renderToStaticMarkup`, so they now also exercise `getNavNotifications` for a user with zero notifications and must not throw.

- [ ] **Step 5: Commit**

```bash
git add app/my-tasks/page.tsx app/projects/page.tsx "app/projects/[slug]/page.tsx" "app/projects/[slug]/members/page.tsx" "app/projects/[slug]/settings/page.tsx" "app/projects/[slug]/tasks/[id]/page.tsx"
git commit -m "feat(notifications): fetch and pass nav notifications on every page"
```

---

## Task 8: @mention autocomplete in the comment box

**Files:**
- Modify: `app/projects/[slug]/tasks/[id]/CommentForm.tsx`
- Modify: `app/projects/[slug]/tasks/[id]/actions.ts` (`addCommentAction`)
- Modify: `app/projects/[slug]/tasks/[id]/page.tsx` (pass `members` to `CommentForm`)
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `addTaskComment`'s new `mentionedUserIds` parameter (Task 3); `detail.project.members` already loaded by the task detail page (same data already passed to `TaskProperties`).

- [ ] **Step 1: Pass `members` from the page to `CommentForm`**

In `app/projects/[slug]/tasks/[id]/page.tsx`, change:

```tsx
              <section className="stack">
                <h2>Add a comment</h2>
                <CommentForm taskId={id} slug={slug} />
              </section>
```

to:

```tsx
              <section className="stack">
                <h2>Add a comment</h2>
                <CommentForm
                  taskId={id}
                  slug={slug}
                  members={detail.project.members.map((m) => ({ id: m.user.id, name: m.user.name }))}
                />
              </section>
```

- [ ] **Step 2: Read `formData.getAll("mentionedUserIds")` in `addCommentAction`**

In `app/projects/[slug]/tasks/[id]/actions.ts`, replace `addCommentAction`'s body:

```ts
export async function addCommentAction(
  taskId: string,
  slug: string,
  _prev: CommentState,
  formData: FormData,
): Promise<CommentState> {
  const user = await requireUser();
  const comment = String(formData.get("comment") ?? "");
  const mentionedUserIds = formData.getAll("mentionedUserIds").map(String);
  try {
    await addTaskComment(user.id, taskId, comment, mentionedUserIds);
  } catch {
    return { status: "error", message: "Comment can't be empty." };
  }
  revalidatePath(`/projects/${slug}/tasks/${taskId}`);
  return { status: "idle" };
}
```

- [ ] **Step 3: Add the mention picker to `CommentForm.tsx`**

Replace the full contents of `app/projects/[slug]/tasks/[id]/CommentForm.tsx`:

```tsx
"use client";

import { useActionState, useRef, useState, useEffect } from "react";

import Kbd from "@/app/_components/Kbd";

import { addCommentAction, type CommentState } from "./actions";

const initialState: CommentState = { status: "idle" };

type Member = { id: string; name: string };

export function CommentForm({
  taskId,
  slug,
  members,
}: {
  taskId: string;
  slug: string;
  members: Member[];
}) {
  const [state, formAction, pending] = useActionState(addCommentAction.bind(null, taskId, slug), initialState);
  const [mentioned, setMentioned] = useState<Member[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wasPending = useRef(false);

  // React resets uncontrolled form fields after a successful action, but
  // `mentioned` is separate component state, not a form field — it needs its
  // own reset on the pending->idle-success transition, or a mention would
  // leak into the next comment.
  useEffect(() => {
    if (wasPending.current && !pending && state.status === "idle") setMentioned([]);
    wasPending.current = pending;
  }, [pending, state]);

  const matches =
    query === null
      ? []
      : members.filter((m) => m.name.toLowerCase().startsWith(query.toLowerCase())).slice(0, 5);

  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;

    const upToCursor = el.value.slice(0, el.selectionStart ?? 0);
    const match = /(?:^|\s)@(\w*)$/.exec(upToCursor);
    setQuery(match ? match[1] : null);
  }

  function pickMention(member: Member) {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart ?? el.value.length;
    const upToCursor = el.value.slice(0, cursor);
    const start = upToCursor.search(/@(\w*)$/);
    if (start === -1) return;
    const before = el.value.slice(0, start);
    const after = el.value.slice(cursor);
    const insertion = `@${member.name} `;
    el.value = `${before}${insertion}${after}`;
    const nextCursor = before.length + insertion.length;
    el.selectionStart = el.selectionEnd = nextCursor;
    el.focus();
    setQuery(null);
    setMentioned((prev) => (prev.some((m) => m.id === member.id) ? prev : [...prev, member]));
  }

  return (
    <form action={formAction} className="form">
      <div className="composer">
        <textarea
          ref={textareaRef}
          name="comment"
          placeholder="Add a comment… (@ to mention)"
          required
          className="input"
          onInput={handleInput}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit();
            if (e.key === "Escape") setQuery(null);
          }}
        />
        {matches.length > 0 && (
          <ul className="mention-picker" role="listbox">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" className="mention-picker__item" onClick={() => pickMention(m)}>
                  {m.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {mentioned.map((m) => (
        <input key={m.id} type="hidden" name="mentionedUserIds" value={m.id} />
      ))}
      <button type="submit" className="button" disabled={pending}>
        {pending ? "Posting…" : "Comment"}
      </button>
      <p className="composer__hint"><Kbd>⌘</Kbd><Kbd>↵</Kbd> to send</p>
      {state.status === "error" && <p className="form-error">{state.message}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Add the mention picker CSS**

Append to `app/globals.css`:

```css
.composer {
  position: relative;
}

.mention-picker {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  z-index: 40;
  min-width: 160px;
  padding: 4px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  box-shadow: var(--shadow-lg);
}

.mention-picker__item {
  display: block;
  width: 100%;
  padding: 7px 8px;
  font: inherit;
  font-size: var(--text-sm);
  text-align: left;
  color: var(--text);
  background: none;
  border: 0;
  border-radius: 5px;
  cursor: pointer;
}

.mention-picker__item:hover {
  background: var(--surface-hover);
}
```

- [ ] **Step 5: Manual verification**

Run: `npm run dev`

In a browser, open a task detail page for a project with at least one other member, type `@` in the comment box, confirm the picker appears and filters as you type, click a suggestion, confirm `@Name` is inserted, and submit the comment. Then, as that mentioned member, confirm a `MENTIONED` notification appears in their bell dropdown.

- [ ] **Step 6: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — `tests/tasks/detail.test.ts` still renders the task detail page correctly with the updated `CommentForm` (it doesn't post a comment through the form, only through `addTaskComment` directly, so it's unaffected by this UI change).

- [ ] **Step 7: Commit**

```bash
git add "app/projects/[slug]/tasks/[id]/CommentForm.tsx" "app/projects/[slug]/tasks/[id]/actions.ts" "app/projects/[slug]/tasks/[id]/page.tsx" app/globals.css
git commit -m "feat(notifications): add @mention autocomplete to the comment box"
```

---

## Task 9: Full verification pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS, all files.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: builds successfully (this also runs `prisma migrate deploy`, confirming the Task 1 migration applies cleanly).

- [ ] **Step 5: Manual smoke test**

Run: `npm run dev`. As one user, assign a task to a second test account; log in as that account and confirm the bell badge shows an unread count and the dropdown links to the task. Click it, confirm it's marked read and the badge decrements on next navigation. Set a task's due date to tomorrow and confirm it shows as a due-soon item without being dismissable.

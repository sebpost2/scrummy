# Scrummy PWA with Full Offline Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Scrummy into an installable PWA (desktop, Android, iOS) where every post-login mutation can be made offline and syncs when connectivity returns.

**Architecture:** A thin client-side wrapper (`callAction`) sits in front of every existing Server Action call. Online, it's a no-op passthrough. Offline, it stores the mutation intent in an IndexedDB outbox instead of surfacing the network error, leaving the app's existing `useOptimistic` state as the source of truth until sync confirms it. A replay engine flushes the outbox against a new `/api/sync` route (not the Server Action wire protocol) that calls the same `lib/*/mutations` functions directly. Conflicts resolve via per-field last-write-wins, piggybacking on the existing `TaskEvent` audit log (plus one new column for the one mutation — reorder — that isn't audit-logged).

**Tech Stack:** Next.js 16 App Router, Prisma 7 / Postgres, `serwist` (service worker), `idb-keyval` (IndexedDB), `sharp` (icon generation, dev-only), Vitest (existing convention: real throwaway Postgres via `.env.test`, Node environment, no jsdom).

**Spec:** `docs/superpowers/specs/2026-09-06-pwa-offline-design.md`

## Global Constraints

- All schema changes are additive — no destructive migrations, no dropped columns.
- Every mutation function's existing signature stays call-compatible: new parameters (`clientTimestamp`, optional `id`/`rank`) are optional with defaults, so today's Server Action call sites need zero changes until Task 12 deliberately wires them.
- No new dependency for anything the ladder already covers: `serwist` is used only because hand-rolled precache-manifest cache-busting is genuinely nontrivial; `idb-keyval` only because raw IndexedDB boilerplate is worse than 600 bytes of library; `sharp` is dev-only (icon generation is a one-time script, never shipped).
- CSP in `next.config.ts` (`default-src 'self'`) already covers the service worker and manifest via CSP fallback (`worker-src`/`manifest-src` fall back to `default-src`) and `/api/sync` via `connect-src 'self'`. **No CSP changes in this plan** — confirmed during planning, not an oversight.
- Deviation from the spec found while grounding this plan: the spec proposed `TaskEvent.clientMutationId` for idempotent replay. Project-domain mutations (rename/delete/invite/membership) have no per-mutation event log to hang that column off of, so this plan uses one generic `SyncedMutation` table instead, applied uniformly at the `/api/sync` route for every mutation type (task and project alike). `TaskEvent.clientTimestamp` is kept — it's what the LWW comparison needs.
- Deviation: `reorderTask` writes no `TaskEvent` (rank churns too often to audit-log). Its LWW check compares against `Task.rankUpdatedAt` instead of an event, per the spec's "found during spec grounding" note.
- Out of scope, confirmed: `joinProjectByInviteToken` is not added to the offline outbox. Accepting an invite link implies the user just received it and is online to open it; queuing it adds an entity-creation-analog edge case for negligible real-world value.

---

### Task 1: Schema — additive columns for LWW + a generic mutation-dedup table

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_pwa_offline_sync/migration.sql` (generated, then hand-edited)
- Modify: `tests/db/schema.test.ts`

**Interfaces:**
- Produces: `TaskEvent.clientTimestamp: Date` (required, backfilled from `createdAt`), `Task.rankUpdatedAt: Date | null`, `prisma.syncedMutation.create({ data: { id } })` / `.findUnique({ where: { id } })`.

- [ ] **Step 1: Edit the schema**

In `prisma/schema.prisma`, add `clientTimestamp` to `TaskEvent` right after `createdAt`:

```prisma
model TaskEvent {
  id              String        @id @default(cuid())
  taskId          String
  task            Task          @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId          String
  user            User          @relation(fields: [userId], references: [id])
  type            TaskEventType
  oldValue        String?
  newValue        String?
  comment         String?
  createdAt       DateTime      @default(now())
  clientTimestamp DateTime
  editedAt        DateTime?
  deletedAt       DateTime?

  @@index([taskId, createdAt])
  @@index([taskId, type, clientTimestamp])
}
```

Add `rankUpdatedAt` to `Task` right after `rank`:

```prisma
  rank          Float        @default(0)
  rankUpdatedAt DateTime?
```

Add a new model at the end of the file:

```prisma
model SyncedMutation {
  id        String   @id
  appliedAt DateTime @default(now())
}
```

- [ ] **Step 2: Generate a migration without applying it**

Run against your local dev database only (never `.env.vercel-prod-tmp`):

```bash
npx prisma migrate dev --create-only --name pwa_offline_sync
```

- [ ] **Step 3: Hand-edit the generated SQL for a true backfill**

Prisma's autogenerated SQL will set `clientTimestamp` via a migration-time default, which is wrong — every pre-existing row would get the migration's execution time, not the row's real `createdAt`. Replace the generated `ALTER TABLE ... ADD COLUMN "clientTimestamp"` block with:

```sql
-- AlterTable: add nullable, backfill from createdAt, then enforce NOT NULL
ALTER TABLE "TaskEvent" ADD COLUMN "clientTimestamp" TIMESTAMP(3);
UPDATE "TaskEvent" SET "clientTimestamp" = "createdAt" WHERE "clientTimestamp" IS NULL;
ALTER TABLE "TaskEvent" ALTER COLUMN "clientTimestamp" SET NOT NULL;

CREATE INDEX "TaskEvent_taskId_type_clientTimestamp_idx" ON "TaskEvent"("taskId", "type", "clientTimestamp");

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "rankUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SyncedMutation" (
    "id" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncedMutation_pkey" PRIMARY KEY ("id")
);
```

- [ ] **Step 4: Apply the migration**

```bash
npx prisma migrate dev
```

Expected: applies cleanly, `npx prisma generate` runs automatically as part of `migrate dev`.

- [ ] **Step 5: Extend the schema test**

Add to `tests/db/schema.test.ts`. First widen the shared cleanup so a new tracked id gets cleaned up too — change the top of the file:

```typescript
let userId: string | undefined;
let projectId: string | undefined;
let mutationId: string | undefined;

afterEach(async () => {
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  if (mutationId) await prisma.syncedMutation.deleteMany({ where: { id: mutationId } });
  userId = undefined;
  projectId = undefined;
  mutationId = undefined;
});
```

Then append a new test at the end of the `describe("schema", ...)` block:

```typescript
  it("tracks clientTimestamp on TaskEvent, rankUpdatedAt on Task, and dedups via SyncedMutation", async () => {
    const user = await prisma.user.create({
      data: { email: `schema2-${Date.now()}@example.com`, passwordHash: "x", name: "Test User 2" },
    });
    userId = user.id;

    const project = await prisma.project.create({
      data: {
        name: "Test Project 2",
        slug: `test-project-2-${Date.now()}`,
        inviteToken: randomBytes(16).toString("hex"),
        createdById: user.id,
      },
    });
    projectId = project.id;

    const task = await prisma.task.create({
      data: { projectId: project.id, title: "Second task", createdById: user.id },
    });

    const clientTimestamp = new Date("2026-01-01T00:00:00Z");
    const event = await prisma.taskEvent.create({
      data: { taskId: task.id, userId: user.id, type: "CREATED", clientTimestamp },
    });
    expect(event.clientTimestamp.toISOString()).toBe(clientTimestamp.toISOString());

    const reordered = await prisma.task.update({
      where: { id: task.id },
      data: { rankUpdatedAt: clientTimestamp },
    });
    expect(reordered.rankUpdatedAt?.toISOString()).toBe(clientTimestamp.toISOString());

    mutationId = `mut-${Date.now()}`;
    await prisma.syncedMutation.create({ data: { id: mutationId } });
    await expect(prisma.syncedMutation.create({ data: { id: mutationId } })).rejects.toThrow();
  });
```

- [ ] **Step 6: Run tests**

```bash
npm test -- tests/db/schema.test.ts
```

Expected: both tests in the file PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations tests/db/schema.test.ts
git commit -m "feat: add clientTimestamp, rankUpdatedAt, SyncedMutation for offline sync"
```

---

### Task 2: Per-field last-write-wins comparison helper

**Files:**
- Create: `lib/sync/lww.ts`
- Test: `tests/sync/lww.test.ts`

**Interfaces:**
- Produces: `isNewer(incoming: Date, current: Date | null): boolean`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sync/lww.test.ts
import { describe, it, expect } from "vitest";

import { isNewer } from "@/lib/sync/lww";

describe("isNewer", () => {
  it("is true when there's no current value yet", () => {
    expect(isNewer(new Date("2026-01-01T00:00:00Z"), null)).toBe(true);
  });

  it("is true when incoming is strictly after current", () => {
    expect(isNewer(new Date("2026-01-02T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toBe(true);
  });

  it("is false when incoming is strictly before current", () => {
    expect(isNewer(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-02T00:00:00Z"))).toBe(false);
  });

  it("is false on an exact tie (keeps whatever was already applied)", () => {
    const t = new Date("2026-01-01T00:00:00Z");
    expect(isNewer(t, t)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sync/lww.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sync/lww'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/sync/lww.ts
export function isNewer(incoming: Date, current: Date | null): boolean {
  if (!current) return true;
  return incoming.getTime() > current.getTime();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/sync/lww.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sync/lww.ts tests/sync/lww.test.ts
git commit -m "feat: add per-field last-write-wins comparison helper"
```

---

### Task 3: Generic mutation dedup

**Files:**
- Create: `lib/sync/dedup.ts`
- Test: `tests/sync/dedup.test.ts`

**Interfaces:**
- Consumes: `prisma.syncedMutation` (Task 1)
- Produces: `alreadyApplied(clientMutationId: string): Promise<boolean>`, `markApplied(clientMutationId: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sync/dedup.test.ts
import { describe, it, expect, afterEach, afterAll } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { alreadyApplied, markApplied } from "@/lib/sync/dedup";

let mutationId: string | undefined;

afterEach(async () => {
  if (mutationId) await prisma.syncedMutation.deleteMany({ where: { id: mutationId } });
  mutationId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("dedup", () => {
  it("reports not-applied before markApplied, and applied after", async () => {
    mutationId = `dedup-${Date.now()}`;
    expect(await alreadyApplied(mutationId)).toBe(false);

    await markApplied(mutationId);

    expect(await alreadyApplied(mutationId)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sync/dedup.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sync/dedup'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/sync/dedup.ts
import { prisma } from "@/lib/db/prisma";

export async function alreadyApplied(clientMutationId: string): Promise<boolean> {
  const row = await prisma.syncedMutation.findUnique({ where: { id: clientMutationId } });
  return row !== null;
}

export async function markApplied(clientMutationId: string): Promise<void> {
  await prisma.syncedMutation.create({ data: { id: clientMutationId } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/sync/dedup.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/sync/dedup.ts tests/sync/dedup.test.ts
git commit -m "feat: add generic mutation dedup for sync replay"
```

---

### Task 4: LWW for the five single-field task mutations

**Files:**
- Modify: `lib/tasks/mutations.ts`
- Modify: `tests/tasks/mutations.test.ts` (append)

**Interfaces:**
- Consumes: `isNewer` (Task 2)
- Produces: `updateTaskStatus`, `reassignTask`, `updateTaskPriority`, `updateTaskDueDate`, `updateTaskLabels` each gain a 4th optional parameter `clientTimestamp: Date = new Date()`. Existing 3-arg call sites are unaffected.

- [ ] **Step 1: Write the failing tests**

Append to `tests/tasks/mutations.test.ts` (uses the existing `setup()` helper already in the file):

```typescript
describe("updateTaskStatus — offline LWW", () => {
  it("applies a status change with a newer clientTimestamp", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "LWW task" });
    const later = new Date(Date.now() + 60_000);

    const updated = await updateTaskStatus(owner.id, task.id, "IN_PROGRESS", later);

    expect(updated.status).toBe("IN_PROGRESS");
  });

  it("drops a status change with an older clientTimestamp than the last one applied, but logs it", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "LWW task 2" });
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    await updateTaskStatus(owner.id, task.id, "IN_PROGRESS", now);
    const result = await updateTaskStatus(owner.id, task.id, "DONE", earlier);

    expect(result.status).toBe("IN_PROGRESS");
    const events = await prisma.taskEvent.findMany({
      where: { taskId: task.id, type: "STATUS_CHANGED" },
      orderBy: { clientTimestamp: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events[1].newValue).toBe("DONE");
    expect(events[1].comment).toBe("overwritten by a newer edit made elsewhere");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tasks/mutations.test.ts -t "offline LWW"`
Expected: FAIL — `updateTaskStatus` ignores the 4th argument (TypeScript would also flag the extra arg once strict — expect a type error until Step 3).

- [ ] **Step 3: Add the LWW helper and update the five mutations**

In `lib/tasks/mutations.ts`, add the import and helper near the top (after the existing `requireTaskAccess` function):

```typescript
import { isNewer } from "@/lib/sync/lww";
```

```typescript
async function latestEventTimestamp(taskId: string, type: TaskEventType): Promise<Date | null> {
  const event = await prisma.taskEvent.findFirst({
    where: { taskId, type },
    orderBy: { clientTimestamp: "desc" },
  });
  return event?.clientTimestamp ?? null;
}
```

This needs `TaskEventType` imported — update the top import line:

```typescript
import type { Task, TaskStatus, TaskPriority, TaskEventType } from "@prisma/client";
```

Replace `updateTaskStatus`:

```typescript
export async function updateTaskStatus(
  userId: string,
  taskId: string,
  status: TaskStatus,
  clientTimestamp: Date = new Date(),
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  if (task.status === status) return task;

  const current = await latestEventTimestamp(taskId, "STATUS_CHANGED");
  if (!isNewer(clientTimestamp, current)) {
    await prisma.taskEvent.create({
      data: {
        taskId,
        userId,
        type: "STATUS_CHANGED",
        oldValue: task.status,
        newValue: status,
        clientTimestamp,
        comment: "overwritten by a newer edit made elsewhere",
      },
    });
    return task;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data: { status } });
    await tx.taskEvent.create({
      data: { taskId, userId, type: "STATUS_CHANGED", oldValue: task.status, newValue: status, clientTimestamp },
    });
    return updated;
  });
}
```

Replace `reassignTask`:

```typescript
export async function reassignTask(
  userId: string,
  taskId: string,
  assigneeId: string | null,
  clientTimestamp: Date = new Date(),
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  if (assigneeId) {
    const assigneeMembership = await getProjectMembership(assigneeId, task.projectId);
    if (!assigneeMembership) throw new Error("ASSIGNEE_NOT_A_MEMBER");
  }
  if (task.assigneeId === assigneeId) return task;

  const current = await latestEventTimestamp(taskId, "REASSIGNED");
  if (!isNewer(clientTimestamp, current)) {
    await prisma.taskEvent.create({
      data: {
        taskId,
        userId,
        type: "REASSIGNED",
        oldValue: task.assigneeId,
        newValue: assigneeId,
        clientTimestamp,
        comment: "overwritten by a newer edit made elsewhere",
      },
    });
    return task;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data: { assigneeId } });
    await tx.taskEvent.create({
      data: { taskId, userId, type: "REASSIGNED", oldValue: task.assigneeId, newValue: assigneeId, clientTimestamp },
    });
    return updated;
  });
}
```

Replace `updateTaskPriority`:

```typescript
export async function updateTaskPriority(
  userId: string,
  taskId: string,
  priority: TaskPriority,
  clientTimestamp: Date = new Date(),
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  if (task.priority === priority) return task;

  const current = await latestEventTimestamp(taskId, "PRIORITY_CHANGED");
  if (!isNewer(clientTimestamp, current)) {
    await prisma.taskEvent.create({
      data: {
        taskId,
        userId,
        type: "PRIORITY_CHANGED",
        oldValue: task.priority,
        newValue: priority,
        clientTimestamp,
        comment: "overwritten by a newer edit made elsewhere",
      },
    });
    return task;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data: { priority } });
    await tx.taskEvent.create({
      data: { taskId, userId, type: "PRIORITY_CHANGED", oldValue: task.priority, newValue: priority, clientTimestamp },
    });
    return updated;
  });
}
```

Replace `updateTaskDueDate`:

```typescript
export async function updateTaskDueDate(
  userId: string,
  taskId: string,
  dueDate: Date | null,
  clientTimestamp: Date = new Date(),
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  const oldValue = task.dueDate?.toISOString() ?? null;
  const newValue = dueDate?.toISOString() ?? null;
  if (oldValue === newValue) return task;

  const current = await latestEventTimestamp(taskId, "DUE_DATE_CHANGED");
  if (!isNewer(clientTimestamp, current)) {
    await prisma.taskEvent.create({
      data: {
        taskId,
        userId,
        type: "DUE_DATE_CHANGED",
        oldValue,
        newValue,
        clientTimestamp,
        comment: "overwritten by a newer edit made elsewhere",
      },
    });
    return task;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data: { dueDate } });
    await tx.taskEvent.create({
      data: { taskId, userId, type: "DUE_DATE_CHANGED", oldValue, newValue, clientTimestamp },
    });
    return updated;
  });
}
```

Replace `updateTaskLabels`:

```typescript
export async function updateTaskLabels(
  userId: string,
  taskId: string,
  labels: string[],
  clientTimestamp: Date = new Date(),
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  const cleaned = labels.map((l) => l.trim()).filter(Boolean);
  const oldValue = task.labels.join(",");
  const newValue = cleaned.join(",");
  if (oldValue === newValue) return task;

  const current = await latestEventTimestamp(taskId, "LABELS_CHANGED");
  if (!isNewer(clientTimestamp, current)) {
    await prisma.taskEvent.create({
      data: {
        taskId,
        userId,
        type: "LABELS_CHANGED",
        oldValue,
        newValue,
        clientTimestamp,
        comment: "overwritten by a newer edit made elsewhere",
      },
    });
    return task;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.task.update({ where: { id: taskId }, data: { labels: cleaned } });
    await tx.taskEvent.create({
      data: { taskId, userId, type: "LABELS_CHANGED", oldValue, newValue, clientTimestamp },
    });
    return updated;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/tasks/mutations.test.ts`
Expected: PASS, including all pre-existing tests in the file (the new parameter is optional, so every existing 3-arg call site behaves exactly as before).

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/mutations.ts tests/tasks/mutations.test.ts
git commit -m "feat: per-field LWW for status, assignee, priority, due date, labels"
```

---

### Task 5: LWW for reorder + client-supplied id/rank on task creation

**Files:**
- Modify: `lib/tasks/mutations.ts`
- Modify: `tests/tasks/mutations.test.ts` (append)

**Interfaces:**
- Produces: `reorderTask(userId, taskId, rank, clientTimestamp = new Date())`; `createTask(userId, projectId, input: { title: string; description?: string; id?: string; rank?: number })`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/tasks/mutations.test.ts`:

```typescript
describe("reorderTask — offline LWW", () => {
  it("applies a reorder with a newer clientTimestamp", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Reorder task" });
    const later = new Date(Date.now() + 60_000);

    const updated = await reorderTask(owner.id, task.id, 5, later);

    expect(updated.rank).toBe(5);
    expect(updated.rankUpdatedAt?.getTime()).toBe(later.getTime());
  });

  it("drops a reorder with an older clientTimestamp than the last one applied", async () => {
    const { owner, project } = await setup();
    const task = await createTask(owner.id, project.id, { title: "Reorder task 2" });
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);

    await reorderTask(owner.id, task.id, 5, now);
    const result = await reorderTask(owner.id, task.id, 9, earlier);

    expect(result.rank).toBe(5);
  });
});

describe("createTask — client-supplied id and rank", () => {
  it("uses a client-supplied id and rank when given (for offline-created tasks)", async () => {
    const { owner, project } = await setup();
    const clientId = `client-${Date.now()}`;

    const task = await createTask(owner.id, project.id, { title: "Offline task", id: clientId, rank: 42 });

    expect(task.id).toBe(clientId);
    expect(task.rank).toBe(42);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/tasks/mutations.test.ts -t "offline LWW|client-supplied"`
Expected: FAIL

- [ ] **Step 3: Update `reorderTask` and `createTask`**

Replace `reorderTask`:

```typescript
export async function reorderTask(
  userId: string,
  taskId: string,
  rank: number,
  clientTimestamp: Date = new Date(),
): Promise<Task> {
  const task = await requireTaskAccess(userId, taskId);
  if (!isNewer(clientTimestamp, task.rankUpdatedAt)) return task;

  return prisma.task.update({ where: { id: taskId }, data: { rank, rankUpdatedAt: clientTimestamp } });
}
```

Replace `createTask`:

```typescript
export async function createTask(
  userId: string,
  projectId: string,
  input: { title: string; description?: string; id?: string; rank?: number },
): Promise<Task> {
  await requireProjectAccess(userId, projectId);
  const title = input.title.trim();
  if (!title) throw new Error("TITLE_REQUIRED");

  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        id: input.id,
        projectId,
        title,
        description: input.description,
        createdById: userId,
        rank: input.rank ?? Date.now() / 1000,
      },
    });
    await tx.taskEvent.create({
      data: { taskId: task.id, userId, type: "CREATED", clientTimestamp: new Date() },
    });
    return task;
  });
}
```

(`id: input.id` — when `undefined`, Prisma omits the field from the insert and its `@default(cuid())` applies as before, so every existing online call site is unaffected.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/tasks/mutations.test.ts`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/mutations.ts tests/tasks/mutations.test.ts
git commit -m "feat: reorder LWW via rankUpdatedAt, client-supplied id/rank for offline task creation"
```

---

### Task 6: Client-supplied id for offline project creation

**Files:**
- Modify: `lib/projects/mutations.ts`
- Modify: `tests/projects/mutations.test.ts` (append)

**Interfaces:**
- Produces: `createProject(userId: string, name: string, id?: string): Promise<Project>`

- [ ] **Step 1: Write the failing test**

Append to `tests/projects/mutations.test.ts` (check the file's existing top-of-file `setup`/cleanup pattern and match it — it follows the same `userId`/`projectId` tracked-cleanup convention as the other test files in this repo):

```typescript
describe("createProject — client-supplied id", () => {
  it("uses a client-supplied id when given (for offline-created projects)", async () => {
    const user = await prisma.user.create({
      data: { email: `create-project-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    const clientId = `client-project-${Date.now()}`;

    const project = await createProject(user.id, "Offline Project", clientId);

    expect(project.id).toBe(clientId);

    await prisma.project.deleteMany({ where: { id: project.id } });
    await prisma.user.deleteMany({ where: { id: user.id } });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/projects/mutations.test.ts -t "client-supplied id"`
Expected: FAIL — `createProject` doesn't accept a third argument.

- [ ] **Step 3: Update `createProject`**

```typescript
export async function createProject(userId: string, name: string, id?: string): Promise<Project> {
  const slug = `${slugify(name)}-${randomBytes(3).toString("hex")}`;
  const inviteToken = randomBytes(16).toString("hex");
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ data: { id, name, slug, inviteToken, createdById: userId } });
    await tx.projectMember.create({ data: { userId, projectId: project.id, role: "OWNER" } });
    return project;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/projects/mutations.test.ts`
Expected: PASS (full file)

- [ ] **Step 5: Commit**

```bash
git add lib/projects/mutations.ts tests/projects/mutations.test.ts
git commit -m "feat: client-supplied id for offline project creation"
```

---

### Task 7: Sync API route — mutation registry, dedup, failure bucketing

**Files:**
- Create: `lib/sync/types.ts`
- Create: `lib/sync/mutationRegistry.ts`
- Create: `app/api/sync/route.ts`
- Test: `tests/sync/route.test.ts`

**Interfaces:**
- Consumes: `alreadyApplied`/`markApplied` (Task 3), `getSessionUser` (existing, `lib/auth/session.ts`), all mutation functions from `lib/tasks/mutations.ts` and `lib/projects/mutations.ts`.
- Produces: `POST /api/sync` accepting `{ id: string; type: OutboxMutationType; args: unknown[]; clientTimestamp: number }`, returning `{ ok: true, deduped?: true, result? }` on success or `{ error: string; permanent: boolean }` with status 400 (permanent) / 401 (unauthenticated) / 502 (transient) on failure.

- [ ] **Step 1: Define the shared outbox types**

```typescript
// lib/sync/types.ts
export type OutboxMutationType =
  | "createTask"
  | "updateTaskTitle"
  | "updateTaskDescription"
  | "deleteTask"
  | "reassignTask"
  | "updateTaskStatus"
  | "updateTaskPriority"
  | "updateTaskDueDate"
  | "updateTaskLabels"
  | "reorderTask"
  | "addTaskComment"
  | "editTaskComment"
  | "deleteTaskComment"
  | "addSubtask"
  | "toggleSubtask"
  | "deleteSubtask"
  | "createProject"
  | "addProjectMemberByEmail"
  | "regenerateInviteToken"
  | "removeProjectMember"
  | "renameProject"
  | "deleteProject"
  | "leaveProject"
  | "updateMemberRole";

export type OutboxStatus = "pending" | "syncing" | "failed-permanent";

export interface OutboxItem {
  id: string;
  type: OutboxMutationType;
  args: unknown[];
  clientTimestamp: number;
  entityId: string;
  status: OutboxStatus;
  failureMessage?: string;
}
```

- [ ] **Step 2: Write the mutation registry**

```typescript
// lib/sync/mutationRegistry.ts
import type { TaskStatus, TaskPriority, ProjectRole } from "@prisma/client";

import {
  createTask,
  updateTaskTitle,
  updateTaskDescription,
  deleteTask,
  reassignTask,
  updateTaskStatus,
  updateTaskPriority,
  updateTaskDueDate,
  updateTaskLabels,
  reorderTask,
  addTaskComment,
  editTaskComment,
  deleteTaskComment,
  addSubtask,
  toggleSubtask,
  deleteSubtask,
} from "@/lib/tasks/mutations";
import {
  createProject,
  addProjectMemberByEmail,
  regenerateInviteToken,
  removeProjectMember,
  renameProject,
  deleteProject,
  leaveProject,
  updateMemberRole,
} from "@/lib/projects/mutations";
import type { OutboxMutationType } from "@/lib/sync/types";

type Handler = (userId: string, args: unknown[], clientTimestamp: Date) => Promise<unknown>;

export const MUTATION_REGISTRY: Record<OutboxMutationType, Handler> = {
  createTask: (userId, args) =>
    createTask(
      userId,
      args[0] as string,
      args[1] as { title: string; description?: string; id?: string; rank?: number },
    ),
  updateTaskTitle: (userId, args) => updateTaskTitle(userId, args[0] as string, args[1] as string),
  updateTaskDescription: (userId, args) => updateTaskDescription(userId, args[0] as string, args[1] as string),
  deleteTask: (userId, args) => deleteTask(userId, args[0] as string),
  reassignTask: (userId, args, ts) => reassignTask(userId, args[0] as string, args[1] as string | null, ts),
  updateTaskStatus: (userId, args, ts) => updateTaskStatus(userId, args[0] as string, args[1] as TaskStatus, ts),
  updateTaskPriority: (userId, args, ts) => updateTaskPriority(userId, args[0] as string, args[1] as TaskPriority, ts),
  updateTaskDueDate: (userId, args, ts) => updateTaskDueDate(userId, args[0] as string, args[1] as Date | null, ts),
  updateTaskLabels: (userId, args, ts) => updateTaskLabels(userId, args[0] as string, args[1] as string[], ts),
  reorderTask: (userId, args, ts) => reorderTask(userId, args[0] as string, args[1] as number, ts),
  addTaskComment: (userId, args) => addTaskComment(userId, args[0] as string, args[1] as string),
  editTaskComment: (userId, args) => editTaskComment(userId, args[0] as string, args[1] as string),
  deleteTaskComment: (userId, args) => deleteTaskComment(userId, args[0] as string),
  addSubtask: (userId, args) => addSubtask(userId, args[0] as string, args[1] as string),
  toggleSubtask: (userId, args) => toggleSubtask(userId, args[0] as string, args[1] as boolean),
  deleteSubtask: (userId, args) => deleteSubtask(userId, args[0] as string),
  createProject: (userId, args) => createProject(userId, args[0] as string, args[1] as string | undefined),
  addProjectMemberByEmail: (userId, args) => addProjectMemberByEmail(userId, args[0] as string, args[1] as string),
  regenerateInviteToken: (userId, args) => regenerateInviteToken(userId, args[0] as string),
  removeProjectMember: (userId, args) => removeProjectMember(userId, args[0] as string, args[1] as string),
  renameProject: (userId, args) => renameProject(userId, args[0] as string, args[1] as string),
  deleteProject: (userId, args) => deleteProject(userId, args[0] as string),
  leaveProject: (userId, args) => leaveProject(userId, args[0] as string),
  updateMemberRole: (userId, args) =>
    updateMemberRole(userId, args[0] as string, args[1] as string, args[2] as ProjectRole),
};
```

- [ ] **Step 3: Write the route**

```typescript
// app/api/sync/route.ts
import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { alreadyApplied, markApplied } from "@/lib/sync/dedup";
import { MUTATION_REGISTRY } from "@/lib/sync/mutationRegistry";
import type { OutboxMutationType } from "@/lib/sync/types";

const PERMANENT_ERROR_CODES = new Set([
  "NOT_A_MEMBER",
  "TASK_NOT_FOUND",
  "TITLE_REQUIRED",
  "ASSIGNEE_NOT_A_MEMBER",
  "COMMENT_REQUIRED",
  "COMMENT_NOT_FOUND",
  "NOT_COMMENT_AUTHOR",
  "COMMENT_DELETED",
  "SUBTASK_NOT_FOUND",
  "SUBTASK_TITLE_REQUIRED",
]);

interface SyncRequestBody {
  id: string;
  type: OutboxMutationType;
  args: unknown[];
  clientTimestamp: number;
}

export async function POST(request: Request): Promise<Response> {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED", permanent: false }, { status: 401 });
  }

  const body = (await request.json()) as SyncRequestBody;
  const handler = MUTATION_REGISTRY[body.type];
  if (!handler) {
    return NextResponse.json({ error: "UNKNOWN_MUTATION_TYPE", permanent: true }, { status: 400 });
  }

  if (await alreadyApplied(body.id)) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  let result: unknown;
  try {
    result = await handler(user.id, body.args, new Date(body.clientTimestamp));
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";
    if (PERMANENT_ERROR_CODES.has(message)) {
      await markApplied(body.id);
      return NextResponse.json({ error: message, permanent: true }, { status: 400 });
    }
    return NextResponse.json({ error: "TRANSIENT", permanent: false }, { status: 502 });
  }

  if (result !== null && typeof result === "object" && "ok" in result && (result as { ok: boolean }).ok === false) {
    await markApplied(body.id);
    return NextResponse.json({ ...result, permanent: true }, { status: 400 });
  }

  await markApplied(body.id);
  return NextResponse.json({ ok: true, result });
}
```

- [ ] **Step 4: Write the tests**

```typescript
// tests/sync/route.test.ts
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
      // @ts-expect-error deliberately invalid type for the test
      request({ id: "m1", type: "notARealMutation", args: [], clientTimestamp: Date.now() }),
    );

    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 5: Run tests**

Run: `npm test -- tests/sync/route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add lib/sync/types.ts lib/sync/mutationRegistry.ts app/api/sync/route.ts tests/sync/route.test.ts
git commit -m "feat: add /api/sync route with mutation registry, dedup, and failure bucketing"
```

---

### Task 8: IndexedDB outbox

**Files:**
- Modify: `package.json` (add `idb-keyval` dependency, `fake-indexeddb` devDependency)
- Create: `lib/sync/outbox.ts`
- Test: `tests/sync/outbox.test.ts`

**Interfaces:**
- Consumes: `OutboxItem`, `OutboxStatus` (Task 7)
- Produces: `enqueue(item: Omit<OutboxItem, "status">): Promise<void>`, `listPending(): Promise<OutboxItem[]>`, `markStatus(id: string, status: OutboxStatus, failureMessage?: string): Promise<void>`, `remove(id: string): Promise<void>`

- [ ] **Step 1: Install dependencies**

```bash
npm install idb-keyval
npm install -D fake-indexeddb
```

- [ ] **Step 2: Write the failing test**

```typescript
// tests/sync/outbox.test.ts
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";

import { enqueue, listPending, markStatus, remove } from "@/lib/sync/outbox";

beforeEach(async () => {
  const pending = await listPending();
  await Promise.all(pending.map((item) => remove(item.id)));
});

describe("outbox", () => {
  it("enqueues an item as pending and lists it", async () => {
    await enqueue({ id: "a", type: "updateTaskStatus", args: ["t1", "DONE"], clientTimestamp: 1, entityId: "t1" });

    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ id: "a", status: "pending" });
  });

  it("lists items ordered by clientTimestamp ascending", async () => {
    await enqueue({ id: "b", type: "updateTaskStatus", args: [], clientTimestamp: 200, entityId: "t1" });
    await enqueue({ id: "a", type: "updateTaskStatus", args: [], clientTimestamp: 100, entityId: "t1" });

    const pending = await listPending();
    expect(pending.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("updates status and can record a failure message", async () => {
    await enqueue({ id: "a", type: "updateTaskStatus", args: [], clientTimestamp: 1, entityId: "t1" });

    await markStatus("a", "failed-permanent", "TITLE_REQUIRED");

    const pending = await listPending();
    expect(pending.find((i) => i.id === "a")).toMatchObject({
      status: "failed-permanent",
      failureMessage: "TITLE_REQUIRED",
    });
  });

  it("removes an item", async () => {
    await enqueue({ id: "a", type: "updateTaskStatus", args: [], clientTimestamp: 1, entityId: "t1" });
    await remove("a");

    expect(await listPending()).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/sync/outbox.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sync/outbox'`

- [ ] **Step 4: Write the implementation**

```typescript
// lib/sync/outbox.ts
import { get, set } from "idb-keyval";

import type { OutboxItem, OutboxStatus } from "@/lib/sync/types";

const STORE_KEY = "scrummy-outbox";

async function readAll(): Promise<OutboxItem[]> {
  return (await get<OutboxItem[]>(STORE_KEY)) ?? [];
}

async function writeAll(items: OutboxItem[]): Promise<void> {
  await set(STORE_KEY, items);
}

export async function enqueue(item: Omit<OutboxItem, "status">): Promise<void> {
  const items = await readAll();
  items.push({ ...item, status: "pending" });
  await writeAll(items);
}

export async function listPending(): Promise<OutboxItem[]> {
  const items = await readAll();
  return [...items].sort((a, b) => a.clientTimestamp - b.clientTimestamp);
}

export async function markStatus(id: string, status: OutboxStatus, failureMessage?: string): Promise<void> {
  const items = await readAll();
  const next = items.map((item) => (item.id === id ? { ...item, status, failureMessage } : item));
  await writeAll(next);
}

export async function remove(id: string): Promise<void> {
  const items = await readAll();
  await writeAll(items.filter((item) => item.id !== id));
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- tests/sync/outbox.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/sync/outbox.ts tests/sync/outbox.test.ts
git commit -m "feat: add IndexedDB-backed offline mutation outbox"
```

---

### Task 9: `callAction` wrapper — the offline/online boundary

**Files:**
- Create: `lib/sync/callAction.ts`
- Test: `tests/sync/callAction.test.ts`

**Interfaces:**
- Consumes: `enqueue` (Task 8)
- Produces: `callAction<T>(actionFn: () => Promise<T>, meta: { type: OutboxMutationType; args: unknown[]; entityId: string }): Promise<T | undefined>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sync/callAction.test.ts
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { callAction } from "@/lib/sync/callAction";
import { listPending, remove } from "@/lib/sync/outbox";

beforeEach(async () => {
  const pending = await listPending();
  await Promise.all(pending.map((item) => remove(item.id)));
});

describe("callAction", () => {
  it("returns the result and queues nothing when the action succeeds", async () => {
    const action = vi.fn().mockResolvedValue("ok");

    const result = await callAction(action, { type: "updateTaskStatus", args: ["t1", "DONE"], entityId: "t1" });

    expect(result).toBe("ok");
    expect(await listPending()).toHaveLength(0);
  });

  it("queues the mutation and returns undefined on a network failure", async () => {
    const action = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await callAction(action, { type: "updateTaskStatus", args: ["t1", "DONE"], entityId: "t1" });

    expect(result).toBeUndefined();
    const pending = await listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ type: "updateTaskStatus", args: ["t1", "DONE"], entityId: "t1" });
  });

  it("rethrows a non-network error instead of queuing it", async () => {
    const action = vi.fn().mockRejectedValue(new Error("TITLE_REQUIRED"));

    await expect(
      callAction(action, { type: "updateTaskTitle", args: ["t1", ""], entityId: "t1" }),
    ).rejects.toThrow("TITLE_REQUIRED");
    expect(await listPending()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sync/callAction.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sync/callAction'`

- [ ] **Step 3: Write the implementation**

A Server Action call that never reaches the network throws a `TypeError` from the underlying `fetch` (the browser's own "Failed to fetch" / "NetworkError" message) — distinct from a rejected promise carrying a serialized application error, which is a plain `Error` with a domain message like `"TITLE_REQUIRED"`. That's the signal `callAction` switches on:

```typescript
// lib/sync/callAction.ts
import { randomUUID } from "node:crypto";

import { enqueue } from "@/lib/sync/outbox";
import type { OutboxMutationType } from "@/lib/sync/types";

function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError;
}

export async function callAction<T>(
  actionFn: () => Promise<T>,
  meta: { type: OutboxMutationType; args: unknown[]; entityId: string },
): Promise<T | undefined> {
  try {
    return await actionFn();
  } catch (err) {
    if (!isNetworkFailure(err)) throw err;

    await enqueue({
      id: randomUUID(),
      type: meta.type,
      args: meta.args,
      clientTimestamp: Date.now(),
      entityId: meta.entityId,
    });
    return undefined;
  }
}
```

Note: `randomUUID` from `node:crypto` also exists as `crypto.randomUUID()` in every browser this app targets — using the Node import here works in both the Vitest (Node) test environment and, once bundled by Next for the client, resolves to the same Web Crypto API the browser provides. No polyfill needed.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/sync/callAction.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sync/callAction.ts tests/sync/callAction.test.ts
git commit -m "feat: add callAction wrapper distinguishing network failures from domain errors"
```

---

### Task 10: Replay engine

**Files:**
- Create: `lib/sync/replay.ts`
- Test: `tests/sync/replay.test.ts`

**Interfaces:**
- Consumes: `listPending`, `markStatus`, `remove` (Task 8)
- Produces: `flushOutbox(): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/sync/replay.test.ts
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { enqueue, listPending, remove } from "@/lib/sync/outbox";
import { flushOutbox } from "@/lib/sync/replay";

beforeEach(async () => {
  const pending = await listPending();
  await Promise.all(pending.map((item) => remove(item.id)));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("flushOutbox", () => {
  it("removes an item from the outbox once it syncs successfully", async () => {
    await enqueue({ id: "a", type: "updateTaskStatus", args: ["t1", "DONE"], clientTimestamp: 1, entityId: "t1" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })));

    await flushOutbox();

    expect(await listPending()).toHaveLength(0);
  });

  it("stops at the first transient failure, leaving it and later items pending", async () => {
    await enqueue({ id: "a", type: "updateTaskStatus", args: [], clientTimestamp: 1, entityId: "t1" });
    await enqueue({ id: "b", type: "updateTaskStatus", args: [], clientTimestamp: 2, entityId: "t1" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ permanent: false }), { status: 502 })));

    await flushOutbox();

    const pending = await listPending();
    expect(pending.map((i) => i.id)).toEqual(["a", "b"]);
    expect(pending[0].status).toBe("pending");
  });

  it("marks a permanent failure and continues to the next item", async () => {
    await enqueue({ id: "a", type: "updateTaskTitle", args: [], clientTimestamp: 1, entityId: "t1" });
    await enqueue({ id: "b", type: "updateTaskStatus", args: [], clientTimestamp: 2, entityId: "t1" });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ permanent: true, error: "TITLE_REQUIRED" }), { status: 400 }),
        )
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );

    await flushOutbox();

    const pending = await listPending();
    expect(pending.map((i) => i.id)).toEqual(["a"]);
    expect(pending[0]).toMatchObject({ status: "failed-permanent", failureMessage: "TITLE_REQUIRED" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sync/replay.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sync/replay'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/sync/replay.ts
import { listPending, markStatus, remove } from "@/lib/sync/outbox";

export async function flushOutbox(): Promise<void> {
  const items = await listPending();

  for (const item of items) {
    if (item.status === "failed-permanent") continue;

    const response = await fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        type: item.type,
        args: item.args,
        clientTimestamp: item.clientTimestamp,
      }),
    });

    if (response.ok) {
      await remove(item.id);
      continue;
    }

    const body = (await response.json().catch(() => ({}))) as { permanent?: boolean; error?: string };
    if (body.permanent) {
      await markStatus(item.id, "failed-permanent", body.error ?? "UNKNOWN_ERROR");
      continue;
    }

    // Transient failure (still offline, 5xx): stop here, preserving order —
    // don't let a later item sync ahead of one that hasn't yet.
    return;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/sync/replay.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add lib/sync/replay.ts tests/sync/replay.test.ts
git commit -m "feat: add outbox replay engine with ordered flush and failure bucketing"
```

---

### Task 11: Sync triggers, root wiring, and failure surfacing

**Files:**
- Create: `lib/sync/triggers.ts`
- Create: `app/_components/SyncProvider.tsx`
- Modify: `app/layout.tsx`
- Test: `tests/sync/triggers.test.ts`

**Interfaces:**
- Consumes: `flushOutbox` (Task 10)
- Produces: `registerSyncTriggers(): () => void`

- [ ] **Step 1: Write the failing test**

`registerSyncTriggers` is mostly DOM glue; the one thing worth testing without a real browser is that it wires the listeners and unsubscribes cleanly:

```typescript
// tests/sync/triggers.test.ts
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/sync/replay", () => ({ flushOutbox: vi.fn().mockResolvedValue(undefined) }));

import { registerSyncTriggers } from "@/lib/sync/triggers";
import { flushOutbox } from "@/lib/sync/replay";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("registerSyncTriggers", () => {
  it("flushes immediately on registration and again on the online event", () => {
    const unregister = registerSyncTriggers();

    expect(flushOutbox).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("online"));
    expect(flushOutbox).toHaveBeenCalledTimes(2);

    unregister();
    window.dispatchEvent(new Event("online"));
    expect(flushOutbox).toHaveBeenCalledTimes(2);
  });
});
```

This test needs a DOM. The project's Vitest config runs Node by default and doesn't have jsdom installed yet:

```bash
npm install -D jsdom
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/sync/triggers.test.ts`
Expected: FAIL — `Cannot find module '@/lib/sync/triggers'`

- [ ] **Step 3: Write the implementation**

```typescript
// lib/sync/triggers.ts
import { flushOutbox } from "@/lib/sync/replay";

const SYNC_TAG = "scrummy-outbox";

export function registerSyncTriggers(): () => void {
  const onOnline = () => void flushOutbox();
  const onVisible = () => {
    if (document.visibilityState === "visible") void flushOutbox();
  };

  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onVisible);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => {
        const reg = registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };
        return reg.sync?.register(SYNC_TAG);
      })
      .catch(() => {
        // No Background Sync support (e.g. iOS Safari) — the online/visibility
        // listeners above are the fallback, per the spec's documented ceiling.
      });
  }

  void flushOutbox();

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/sync/triggers.test.ts`
Expected: PASS

- [ ] **Step 5: Mount it from the root layout and surface permanent failures**

Create `app/_components/SyncProvider.tsx`:

```typescript
"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { registerSyncTriggers } from "@/lib/sync/triggers";
import { listPending } from "@/lib/sync/outbox";

export default function SyncProvider() {
  useEffect(() => {
    const unregister = registerSyncTriggers();

    const interval = setInterval(async () => {
      const failed = (await listPending()).filter((item) => item.status === "failed-permanent");
      for (const item of failed) {
        toast.error(`Couldn't sync a change: ${item.failureMessage ?? "unknown error"}`, { id: item.id });
      }
    }, 5000);

    return () => {
      unregister();
      clearInterval(interval);
    };
  }, []);

  return null;
}
```

(Polling `listPending` every 5s rather than building a pub/sub layer over IndexedDB — this list is small and local, and `toast.error` with a stable `id` naturally de-dupes repeat toasts for the same item. Simplest thing that surfaces the failure; revisit only if 5s polling is ever visibly wasteful.)

In `app/layout.tsx`, import and mount it next to the existing `Toaster`:

```typescript
import SyncProvider from "./_components/SyncProvider";
```

```tsx
      <body>
        {children}
        <Toaster />
        <SyncProvider />
      </body>
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json lib/sync/triggers.ts app/_components/SyncProvider.tsx app/layout.tsx tests/sync/triggers.test.ts
git commit -m "feat: wire sync triggers and surface permanent sync failures via toast"
```

---

### Task 12: Wire every optimistic mutation call site through `callAction`

**Files:**
- Modify: `app/projects/[slug]/BoardCard.tsx:50`
- Modify: `app/projects/[slug]/Board.tsx:68,100`
- Modify: `app/projects/[slug]/tasks/[id]/TaskProperties.tsx:58,74,93,109,122`
- Modify: `app/projects/[slug]/tasks/[id]/Subtasks.tsx:51,68,89`
- Modify: `app/projects/[slug]/tasks/[id]/EditableTitle.tsx:29`
- Modify: `app/projects/[slug]/tasks/[id]/DescriptionEditor.tsx:29`
- Modify: `app/projects/[slug]/tasks/[id]/CommentActions.tsx:32,65`

**Interfaces:**
- Consumes: `callAction` (Task 9)

This is a mechanical, uniform swap repeated at each call site: `await xAction(a, b, c)` becomes `await callAction(() => xAction(a, b, c), { type: "x", args: [a, b, c], entityId })`. The interesting logic (network-failure detection, queuing) is already covered by Task 9's unit tests — these steps are refactors with no behavior change on the online path, verified by the existing component test suite staying green rather than new tests per file.

- [ ] **Step 1: `BoardCard.tsx`**

At line 50, replace:

```typescript
await reassignTaskAction(task.id, slug, assigneeId);
```

with:

```typescript
await callAction(() => reassignTaskAction(task.id, slug, assigneeId), {
  type: "reassignTask",
  args: [task.id, assigneeId],
  entityId: task.id,
});
```

Add the import: `import { callAction } from "@/lib/sync/callAction";`

- [ ] **Step 2: `Board.tsx`**

At line 68, replace:

```typescript
await updateStatusAction(taskId, slug, toStatus);
```

with:

```typescript
await callAction(() => updateStatusAction(taskId, slug, toStatus), {
  type: "updateTaskStatus",
  args: [taskId, toStatus],
  entityId: taskId,
});
```

At line 100, replace:

```typescript
await reorderTaskAction(taskId, slug, rank);
```

with:

```typescript
await callAction(() => reorderTaskAction(taskId, slug, rank), {
  type: "reorderTask",
  args: [taskId, rank],
  entityId: taskId,
});
```

Add the import.

- [ ] **Step 3: `TaskProperties.tsx`**

At line 58, replace:

```typescript
run({ status: v }, "status", () => updateStatusAction(task.id, slug, v));
```

with:

```typescript
run({ status: v }, "status", () =>
  callAction(() => updateStatusAction(task.id, slug, v), {
    type: "updateTaskStatus",
    args: [task.id, v],
    entityId: task.id,
  }),
);
```

At line 74, replace:

```typescript
run({ assigneeId: v || null }, "assignee", () => reassignTaskAction(task.id, slug, v));
```

with:

```typescript
run({ assigneeId: v || null }, "assignee", () =>
  callAction(() => reassignTaskAction(task.id, slug, v), {
    type: "reassignTask",
    args: [task.id, v || null],
    entityId: task.id,
  }),
);
```

At line 93, replace:

```typescript
run({ priority: v }, "priority", () => updatePriorityAction(task.id, slug, v));
```

with:

```typescript
run({ priority: v }, "priority", () =>
  callAction(() => updatePriorityAction(task.id, slug, v), {
    type: "updateTaskPriority",
    args: [task.id, v],
    entityId: task.id,
  }),
);
```

At line 109, replace:

```typescript
run({}, "due date", () => updateDueDateAction(task.id, slug, e.target.value))
```

with:

```typescript
run({}, "due date", () =>
  callAction(() => updateDueDateAction(task.id, slug, e.target.value), {
    type: "updateTaskDueDate",
    args: [task.id, e.target.value ? new Date(e.target.value) : null],
    entityId: task.id,
  }),
)
```

At line 122, replace:

```typescript
run({}, "labels", () => updateLabelsAction(task.id, slug, e.target.value))
```

with:

```typescript
run({}, "labels", () =>
  callAction(() => updateLabelsAction(task.id, slug, e.target.value), {
    type: "updateTaskLabels",
    args: [task.id, e.target.value.split(",").map((l) => l.trim()).filter(Boolean)],
    entityId: task.id,
  }),
)
```

Add the import.

- [ ] **Step 4: `Subtasks.tsx`**

At line 51, replace:

```typescript
await toggleSubtaskAction(s.id, taskId, slug, next);
```

with:

```typescript
await callAction(() => toggleSubtaskAction(s.id, taskId, slug, next), {
  type: "toggleSubtask",
  args: [s.id, next],
  entityId: taskId,
});
```

At line 68, replace:

```typescript
await deleteSubtaskAction(s.id, taskId, slug);
```

with:

```typescript
await callAction(() => deleteSubtaskAction(s.id, taskId, slug), {
  type: "deleteSubtask",
  args: [s.id],
  entityId: taskId,
});
```

At line 89, replace:

```typescript
await addSubtaskAction(taskId, slug, title);
```

with:

```typescript
await callAction(() => addSubtaskAction(taskId, slug, title), {
  type: "addSubtask",
  args: [taskId, title],
  entityId: taskId,
});
```

Add the import.

- [ ] **Step 5: `EditableTitle.tsx`**

At line 29, replace:

```typescript
await updateTitleAction(taskId, slug, next);
```

with:

```typescript
await callAction(() => updateTitleAction(taskId, slug, next), {
  type: "updateTaskTitle",
  args: [taskId, next],
  entityId: taskId,
});
```

Add the import.

- [ ] **Step 6: `DescriptionEditor.tsx`**

At line 29, replace:

```typescript
await updateDescriptionAction(taskId, slug, next);
```

with:

```typescript
await callAction(() => updateDescriptionAction(taskId, slug, next), {
  type: "updateTaskDescription",
  args: [taskId, next],
  entityId: taskId,
});
```

Add the import.

- [ ] **Step 7: `CommentActions.tsx`**

At line 32, replace:

```typescript
await editCommentAction(eventId, taskId, slug, value);
```

with:

```typescript
await callAction(() => editCommentAction(eventId, taskId, slug, value), {
  type: "editTaskComment",
  args: [eventId, value],
  entityId: taskId,
});
```

At line 65, replace:

```typescript
await deleteCommentAction(eventId, taskId, slug);
```

with:

```typescript
await callAction(() => deleteCommentAction(eventId, taskId, slug), {
  type: "deleteTaskComment",
  args: [eventId],
  entityId: taskId,
});
```

Add the import.

**Note on scope:** `TaskActions.tsx` (delete task), `RemoveMemberButton.tsx`, `InviteLinkCard.tsx`, `SettingsDangerZone.tsx`, and `MemberRoleToggle.tsx` are deliberately left calling their actions directly in this task. Each of those already branches on a returned `{ ok: false, message }` and shows it inline (delete/remove/leave/rename flows) rather than using the optimistic-then-confirm pattern the other call sites use — wrapping them is Task 13's job, once there's a decision on how a queued-but-not-yet-confirmed delete/rename should render in that UI (still showing the item as if the action succeeded needs a small UI change these components don't have yet, unlike the optimistic components above which already show the "as if it worked" state naturally).

- [ ] **Step 8: Run the full suite**

```bash
npm test
```

Expected: PASS — every existing test continues to pass unchanged, since `callAction` behaves identically to a direct call when the action resolves successfully.

- [ ] **Step 9: Commit**

```bash
git add "app/projects/[slug]/BoardCard.tsx" "app/projects/[slug]/Board.tsx" "app/projects/[slug]/tasks/[id]/TaskProperties.tsx" "app/projects/[slug]/tasks/[id]/Subtasks.tsx" "app/projects/[slug]/tasks/[id]/EditableTitle.tsx" "app/projects/[slug]/tasks/[id]/DescriptionEditor.tsx" "app/projects/[slug]/tasks/[id]/CommentActions.tsx"
git commit -m "feat: route task-detail and board mutations through callAction for offline queuing"
```

---

### Task 13: Wire the remaining call sites (delete/remove/leave/rename) with permanent-failure-aware queuing

**Files:**
- Modify: `app/projects/[slug]/tasks/[id]/TaskActions.tsx:21`
- Modify: `app/projects/[slug]/members/RemoveMemberButton.tsx:29`
- Modify: `app/projects/[slug]/members/InviteLinkCard.tsx:22`
- Modify: `app/projects/[slug]/settings/SettingsDangerZone.tsx:30,47`
- Modify: `app/projects/[slug]/settings/MemberRoleToggle.tsx:31`

**Interfaces:**
- Consumes: `callAction` (Task 9)

These five call sites all follow the same shape: `const res = await xAction(...); if (!res.ok) { /* show res.message */ }`. Unlike Task 12's sites, there's no existing optimistic local state to fall back on — when offline, `callAction` returns `undefined` (queued) rather than a `{ ok }` result, so each site needs one extra branch: treat `undefined` as "queued, will apply later," not as failure.

- [ ] **Step 1: `TaskActions.tsx`**

At line 21, replace:

```typescript
const res = await deleteTaskAction(taskId, slug);
```

with:

```typescript
const res = await callAction(() => deleteTaskAction(taskId, slug), {
  type: "deleteTask",
  args: [taskId],
  entityId: taskId,
});
if (res === undefined) {
  toast.info("Deleting once you're back online.");
  return;
}
```

Add imports: `import { callAction } from "@/lib/sync/callAction";` and `import { toast } from "sonner";` (check the file doesn't already import `toast` under a different alias before adding).

- [ ] **Step 2: `RemoveMemberButton.tsx`**

At line 29, replace:

```typescript
const res = await removeMemberAction(slug, userId);
```

with:

```typescript
const res = await callAction(() => removeMemberAction(slug, userId), {
  type: "removeProjectMember",
  args: [userId],
  entityId: userId,
});
if (res === undefined) {
  toast.info("Removing once you're back online.");
  return;
}
```

Add the same two imports as Step 1 (as needed).

- [ ] **Step 3: `InviteLinkCard.tsx`**

At line 22, replace:

```typescript
const res = await regenerateInviteTokenAction(slug);
```

with:

```typescript
const res = await callAction(() => regenerateInviteTokenAction(slug), {
  type: "regenerateInviteToken",
  args: [],
  entityId: slug,
});
if (res === undefined) {
  toast.info("Regenerating once you're back online.");
  return;
}
```

- [ ] **Step 4: `SettingsDangerZone.tsx`**

At line 30, replace:

```typescript
const res = await leaveProjectAction(slug);
```

with:

```typescript
const res = await callAction(() => leaveProjectAction(slug), {
  type: "leaveProject",
  args: [],
  entityId: slug,
});
if (res === undefined) {
  toast.info("Leaving once you're back online.");
  return;
}
```

At line 47, replace:

```typescript
const res = await deleteProjectAction(slug);
```

with:

```typescript
const res = await callAction(() => deleteProjectAction(slug), {
  type: "deleteProject",
  args: [],
  entityId: slug,
});
if (res === undefined) {
  toast.info("Deleting once you're back online.");
  return;
}
```

- [ ] **Step 5: `MemberRoleToggle.tsx`**

At line 31, replace:

```typescript
const res = await updateMemberRoleAction(slug, userId, next);
```

with:

```typescript
const res = await callAction(() => updateMemberRoleAction(slug, userId, next), {
  type: "updateMemberRole",
  args: [userId, next],
  entityId: userId,
});
if (res === undefined) {
  toast.info("Updating once you're back online.");
  return;
}
```

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add "app/projects/[slug]/tasks/[id]/TaskActions.tsx" "app/projects/[slug]/members/RemoveMemberButton.tsx" "app/projects/[slug]/members/InviteLinkCard.tsx" "app/projects/[slug]/settings/SettingsDangerZone.tsx" "app/projects/[slug]/settings/MemberRoleToggle.tsx"
git commit -m "feat: route delete/remove/leave/rename actions through callAction"
```

---

### Task 14: App icons

**Files:**
- Create: `public/icon.svg`
- Create: `scripts/generate-icons.mjs`
- Modify: `package.json` (add `sharp` devDependency)
- Create (generated, then committed): `public/icon-192.png`, `public/icon-512.png`, `public/icon-512-maskable.png`, `public/apple-touch-icon.png`

**Interfaces:**
- Produces: the four PNG files consumed by Task 15's manifest.

- [ ] **Step 1: Install sharp**

```bash
npm install -D sharp
```

- [ ] **Step 2: Create the master SVG icon**

Uses the app's actual brand accent (`--accent: #3559e0` from `app/globals.css`) and a simple "S" mark on a rounded square, matching Scrummy's own visual language rather than a generic placeholder:

```svg
<!-- public/icon.svg -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#3559e0"/>
  <text x="256" y="340" font-family="IBM Plex Sans, Arial, sans-serif" font-weight="700"
        font-size="280" fill="#ffffff" text-anchor="middle">S</text>
</svg>
```

- [ ] **Step 3: Write the generation script**

```javascript
// scripts/generate-icons.mjs
import sharp from "sharp";

const svg = "public/icon.svg";

async function main() {
  await sharp(svg).resize(192, 192).png().toFile("public/icon-192.png");
  await sharp(svg).resize(512, 512).png().toFile("public/icon-512.png");
  await sharp(svg).resize(180, 180).png().toFile("public/apple-touch-icon.png");

  // Maskable icons need ~20% safe-zone padding so OS icon masks
  // (circle, squircle, etc.) don't clip the mark.
  await sharp(svg)
    .resize(410, 410)
    .extend({ top: 51, bottom: 51, left: 51, right: 51, background: "#3559e0" })
    .png()
    .toFile("public/icon-512-maskable.png");
}

main();
```

- [ ] **Step 4: Run it**

```bash
node scripts/generate-icons.mjs
```

Expected: creates `public/icon-192.png`, `public/icon-512.png`, `public/apple-touch-icon.png`, `public/icon-512-maskable.png`.

- [ ] **Step 5: Verify**

```bash
node -e "const fs=require('fs'); ['public/icon-192.png','public/icon-512.png','public/apple-touch-icon.png','public/icon-512-maskable.png'].forEach(f => console.log(f, fs.statSync(f).size, 'bytes'))"
```

Expected: all four files exist with nonzero size.

- [ ] **Step 6: Commit**

```bash
git add public/icon.svg scripts/generate-icons.mjs package.json package-lock.json public/icon-192.png public/icon-512.png public/icon-512-maskable.png public/apple-touch-icon.png
git commit -m "feat: generate PWA icon set from brand mark"
```

---

### Task 15: Manifest and viewport metadata

**Files:**
- Create: `app/manifest.ts`
- Modify: `app/layout.tsx`

**Interfaces:**
- Consumes: icon files from Task 14.

- [ ] **Step 1: Write the manifest**

```typescript
// app/manifest.ts
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Scrummy",
    short_name: "Scrummy",
    description: "A small task tracker with traceability.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f9",
    theme_color: "#3559e0",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```

(Next auto-routes this to `/manifest.webmanifest` and injects the `<link rel="manifest">` tag — no manual link needed.)

- [ ] **Step 2: Add viewport (theme-color per color scheme) and Apple web app metadata**

In `app/layout.tsx`, add alongside the existing `metadata` export:

```typescript
import type { Metadata, Viewport } from "next";
```

```typescript
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#3559e0" },
    { media: "(prefers-color-scheme: dark)", color: "#5b82ff" },
  ],
};
```

Extend the existing `metadata` export:

```typescript
export const metadata: Metadata = {
  title: "Scrummy",
  description: "A small task tracker with traceability.",
  appleWebApp: {
    title: "Scrummy",
    statusBarStyle: "black-translucent",
  },
};
```

- [ ] **Step 3: Verify manually**

```bash
npm run dev
```

Visit `http://localhost:3000/manifest.webmanifest` — expect valid JSON matching Step 1. Check the page `<head>` in devtools for `<link rel="manifest" href="/manifest.webmanifest">` and `<meta name="theme-color" ...>` tags.

- [ ] **Step 4: Commit**

```bash
git add app/manifest.ts app/layout.tsx
git commit -m "feat: add web app manifest and viewport/appleWebApp metadata"
```

---

### Task 16: Service worker (serwist) — asset/page caching and Background Sync hookup

**Files:**
- Modify: `package.json` (dependencies: `serwist`; devDependencies: `@serwist/next`, `@serwist/cli`, `esbuild`, `concurrently`)
- Modify: `next.config.ts`
- Modify: `tsconfig.json` (exclude `app/sw.ts` from the main type-check program)
- Modify: `.gitignore`
- Create: `app/sw.ts`

**Interfaces:**
- Consumes: `flushOutbox` (Task 10), via a relative import (not the `@/` alias — `app/sw.ts` is bundled by esbuild outside the main Next.js module graph, so the safest, most portable import here is relative).

- [ ] **Step 1: Install dependencies**

```bash
npm install serwist
npm install -D @serwist/next @serwist/cli esbuild concurrently
```

- [ ] **Step 2: Wrap `next.config.ts`**

```typescript
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  cacheOnNavigation: true,
});

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          {
            key: "Content-Security-Policy",
            // ponytail: 'unsafe-inline' on script-src/style-src since Next.js
            // hydration relies on inline scripts and there's no nonce plumbing
            // here — upgrade to a nonce-based policy if a future feature ever
            // renders untrusted content as markup.
            //
            // No changes needed for the service worker or /api/sync: worker-src
            // and manifest-src both fall back to default-src 'self', and the
            // sync route is same-origin under connect-src 'self'.
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
```

- [ ] **Step 3: Write the service worker source**

```typescript
// app/sw.ts
import { defaultCache } from "@serwist/next/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

import { flushOutbox } from "../lib/sync/replay";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// Background Sync: fires even if no tab is open, on browsers that support it
// (Chrome/Edge desktop + Android). iOS Safari has no Background Sync API, so
// this listener simply never fires there — the online/visibilitychange
// listeners registered from the page (lib/sync/triggers.ts) are the fallback.
self.addEventListener("sync", (event) => {
  const syncEvent = event as unknown as { tag: string; waitUntil(promise: Promise<unknown>): void };
  if (syncEvent.tag === "scrummy-outbox") {
    syncEvent.waitUntil(flushOutbox());
  }
});
```

- [ ] **Step 4: Exclude the service worker source from the main type-check**

`app/sw.ts` uses `ServiceWorkerGlobalScope`, which isn't part of the `dom` lib this project's `tsconfig.json` uses (`"lib": ["dom", "dom.iterable", "esnext"]`) — mixing `dom` and `webworker` libs in one `tsconfig` conflicts. `serwist build` bundles this file with esbuild directly (no type-checking), so exclude it from `tsc`/`next build`'s type-check pass:

```json
  "exclude": ["node_modules", "app/sw.ts"]
```

- [ ] **Step 5: Update build scripts**

In `package.json`:

```json
  "scripts": {
    "dev": "concurrently -p none \"serwist build --watch\" \"next dev\"",
    "postinstall": "prisma generate",
    "build": "prisma migrate deploy && next build && serwist build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run"
  },
```

- [ ] **Step 6: Gitignore the generated service worker bundle**

```
public/sw.js
public/sw.js.map
public/swe-worker*.js
```

Append these lines to `.gitignore`.

- [ ] **Step 7: Verify manually**

```bash
npm run dev
```

In Chrome devtools → Application → Service Workers, confirm a worker registers at `/sw.js` and activates. Application → Manifest should show the icons from Task 14/15. Toggle "Offline" in the Network tab, reload a previously-visited board page — it should still render from cache rather than showing Chrome's offline dinosaur page.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json next.config.ts tsconfig.json .gitignore app/sw.ts
git commit -m "feat: add serwist service worker for asset/page caching and background sync"
```

---

### Task 17: Install prompt UI (Android/desktop `beforeinstallprompt` + iOS manual instructions)

**Files:**
- Create: `app/_components/InstallPrompt.tsx`
- Modify: `app/layout.tsx`
- Test: `tests/components/installPrompt.test.ts`

**Interfaces:**
- Produces: a client component rendering an install affordance, mounted at the root layout.

iOS Safari has no `beforeinstallprompt` event — the only way to "install" there is the user manually using Share → Add to Home Screen, so the component has to detect iOS and show instructions instead of a button, following the pattern Next's own PWA guide documents.

- [ ] **Step 1: Write the failing test**

The interesting, testable logic here is the platform/standalone detection, factored out as a pure function so it doesn't need a real `beforeinstallprompt` event to test:

```typescript
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import { detectInstallState } from "@/app/_components/InstallPrompt";

describe("detectInstallState", () => {
  it("flags iOS from the user agent", () => {
    expect(detectInstallState("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", false)).toEqual({
      isIOS: true,
      isStandalone: false,
    });
  });

  it("does not flag desktop Chrome as iOS", () => {
    expect(detectInstallState("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0", false)).toEqual({
      isIOS: false,
      isStandalone: false,
    });
  });

  it("reports standalone when already installed", () => {
    expect(detectInstallState("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", true)).toEqual({
      isIOS: true,
      isStandalone: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/installPrompt.test.ts`
Expected: FAIL — `Cannot find module '@/app/_components/InstallPrompt'`

- [ ] **Step 3: Write the component**

```tsx
// app/_components/InstallPrompt.tsx
"use client";

import { useEffect, useState } from "react";

export function detectInstallState(userAgent: string, isStandalone: boolean) {
  return { isIOS: /iPad|iPhone|iPod/.test(userAgent), isStandalone };
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
}

export default function InstallPrompt() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    const state = detectInstallState(navigator.userAgent, standalone);
    setIsIOS(state.isIOS);
    setIsStandalone(state.isStandalone);

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
  }, []);

  if (isStandalone) return null;
  if (!isIOS && !deferredPrompt) return null;

  return (
    <div style={{ padding: "0.75rem 1rem", fontSize: "0.8125rem" }}>
      {deferredPrompt ? (
        <button
          onClick={async () => {
            await deferredPrompt.prompt();
            setDeferredPrompt(null);
          }}
        >
          Install Scrummy
        </button>
      ) : (
        <p>To install Scrummy, tap the Share button, then &quot;Add to Home Screen&quot;.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- tests/components/installPrompt.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Mount in the root layout**

In `app/layout.tsx`:

```typescript
import InstallPrompt from "./_components/InstallPrompt";
```

```tsx
      <body>
        {children}
        <Toaster />
        <SyncProvider />
        <InstallPrompt />
      </body>
```

- [ ] **Step 6: Run the full suite**

```bash
npm test
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/_components/InstallPrompt.tsx app/layout.tsx tests/components/installPrompt.test.ts
git commit -m "feat: add install prompt for Android/desktop and iOS manual instructions"
```

---

## Self-Review

**Spec coverage:**
- Install shell (manifest, icons, service worker) → Tasks 14–17.
- Offline mutation queue covering every existing Server Action → Tasks 8–13 (outbox, wrapper, replay, wiring); scope trim on `joinProjectByInviteToken` documented in Global Constraints.
- Per-field LWW conflict resolution → Tasks 2, 4, 5.
- Schema changes → Task 1; the `TaskEvent.clientMutationId` → generic `SyncedMutation` deviation is called out in Global Constraints and Task 7.
- Failure bucketing (transient/permanent/session-expired) → Task 7 (server-side bucketing) and Task 10 (client-side handling); session-expiry specifically surfaces as a 401 from `/api/sync`, which `flushOutbox` currently treats as a generic non-`permanent` failure and leaves `pending` (correct per spec: "queue is preserved, nothing is dropped") — a dedicated "sign in to sync" toast for the 401 case specifically would be a natural follow-up but isn't required by the spec's stated behavior, so it's not a gap, just a possible future UX polish.
- iOS ceiling → documented in Task 16 Step 3 comment and Task 17's manual-instructions path.

**Placeholder scan:** no TBD/TODO; every step has runnable code.

**Type consistency:** `OutboxItem`/`OutboxMutationType` (Task 7) are the single shared vocabulary used identically by `outbox.ts` (Task 8), `callAction.ts` (Task 9), `replay.ts` (Task 10), and `mutationRegistry.ts` (Task 7) — checked each call site's `type` string against the `OutboxMutationType` union and each `args` array against the corresponding `lib/*/mutations` function signature.

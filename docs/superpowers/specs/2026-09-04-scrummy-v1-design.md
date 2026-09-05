# scrummy v1 — design

## Purpose

A small, standalone task tracker for people working together on a project
(starting with gastly), where not everyone is a developer. It needs to answer
two questions at a glance: who's doing what, and what happened to a given
task over time (traceability).

Built as its own product/repo (portfolio piece), not a feature bolted onto
gastly.

## Stack

Next.js (App Router) + Prisma + PostgreSQL (Neon), deployed on Vercel —
mirrors gastly's stack. Server Components for reads, Server Actions for all
mutations; no separate REST/API layer. No real-time sync in v1 — a mutation
calls `revalidatePath` and the page refetches on next navigation/interaction.

Auth is hand-rolled, following gastly's own pattern: bcrypt password hash on
`User`, a `Session` table holding a hashed token, delivered via an httpOnly
cookie. No third-party auth library.

## Data model

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  name          String
  createdAt     DateTime @default(now())

  sessions        Session[]
  projectMembers  ProjectMember[]
  createdProjects Project[]        @relation("ProjectCreator")
  assignedTasks   Task[]           @relation("TaskAssignee")
  createdTasks    Task[]           @relation("TaskCreator")
  taskEvents      TaskEvent[]
}

model Session {
  id        String   @id @default(cuid())
  tokenHash String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([expiresAt])
}

model Project {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  createdById String
  createdBy   User     @relation("ProjectCreator", fields: [createdById], references: [id])
  createdAt   DateTime @default(now())

  members ProjectMember[]
  tasks   Task[]
}

enum ProjectRole {
  OWNER
  MEMBER
}

model ProjectMember {
  userId    String
  projectId String
  role      ProjectRole @default(MEMBER)
  user      User        @relation(fields: [userId], references: [id], onDelete: Cascade)
  project   Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  joinedAt  DateTime    @default(now())

  @@id([userId, projectId])
}

enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
}

model Task {
  id          String       @id @default(cuid())
  projectId   String
  project     Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  title       String
  description String?
  status      TaskStatus   @default(TODO)
  priority    TaskPriority @default(MEDIUM)
  dueDate     DateTime?
  labels      String[]     @default([])
  assigneeId  String?
  assignee    User?        @relation("TaskAssignee", fields: [assigneeId], references: [id], onDelete: SetNull)
  createdById String
  createdBy   User         @relation("TaskCreator", fields: [createdById], references: [id])
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  events TaskEvent[]

  @@index([projectId, status])
  @@index([assigneeId])
}

enum TaskEventType {
  CREATED
  STATUS_CHANGED
  REASSIGNED
  PRIORITY_CHANGED
  DUE_DATE_CHANGED
  LABELS_CHANGED
  EDITED
  COMMENTED
}

model TaskEvent {
  id        String        @id @default(cuid())
  taskId    String
  task      Task          @relation(fields: [taskId], references: [id], onDelete: Cascade)
  userId    String
  user      User          @relation(fields: [userId], references: [id])
  type      TaskEventType
  oldValue  String?
  newValue  String?
  comment   String?
  createdAt DateTime      @default(now())

  @@index([taskId, createdAt])
}
```

Labels are a plain `String[]` on `Task` (Postgres array), not a separate
`Label` model — free-form tags, no cross-project label management needed for
v1. Comments live inside `TaskEvent` (type `COMMENTED`) rather than a
separate `Comment` table, so a task's full history — status/assignee/label/
due-date changes and comments — is one query, one chronological timeline.

Every task mutation (status change, reassignment, priority/due-date/label
edit, comment) writes the `Task` row and appends a `TaskEvent` in the same
transaction, so the log can't drift from actual state.

## Auth & access

- `/signup`, `/login` — email + password.
- A project's `OWNER` adds members by email on `/projects/[slug]/members`. If
  no account exists for that email yet, the owner is told to have that
  person sign up first — no invite-email system in v1.
- All project pages require the requesting user to have a `ProjectMember`
  row for that project; enforced in the Server Action / page loader, not
  just hidden in the UI.

## Pages

- `/projects` — projects the logged-in user belongs to, plus "create
  project."
- `/my-tasks` — global view across every project the user belongs to:
  tasks assigned to them, grouped by project, sorted by due date. The
  daily-use entry point.
- `/projects/[slug]` — the board: three columns (To do / In progress /
  Done). Each card shows title, assignee, priority, due date (if set), and
  labels. A filter bar above the board filters by assignee, label,
  priority, or status via URL search params (`?assignee=&label=&priority=`),
  so filtered views are linkable/shareable.
- `/projects/[slug]/tasks/[id]` — task detail: description, and controls
  for status/priority/assignee/due date/labels, plus the activity timeline
  (all `TaskEvent` rows for the task, newest first) with a comment box at
  the top.
- `/projects/[slug]/members` — owner-only: list members, add by email.

## Out of scope for v1

- Git/PR/commit linking on tasks (Linear's signature feature) — the user
  chose plain activity-history traceability over this; a `String` link
  field could be added later without a data migration concern.
- Sprints/cycles, roadmaps, Gantt views — solves a planning problem this
  team doesn't have yet.
- Notifications (email/push on assignment) — real value, but its own
  subsystem; gastly already has Web Push plumbing (`lib/push` equivalent)
  that could be cribbed from later if this becomes worth doing.
- Real-time board sync (websockets/SSE) — `revalidatePath` after each
  mutation is enough for a small team; add if simultaneous-editing
  conflicts actually become a problem.

## Testing

Vitest, mirroring gastly's `npm test` setup:

- Server Actions: creating a task, changing status/assignee/priority/due
  date/labels each write the correct `TaskEvent` (type, old/new value).
- Auth: password hashing round-trip, session creation/validation/expiry.
- Access control: a non-member is rejected from a project's pages/actions.
- Filter logic on the board (`/projects/[slug]` with query params) returns
  the expected task subset.

No e2e suite in v1.

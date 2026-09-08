# Notifications + @mentions — design

## Context

A feature-gap review of Scrummy against what users of Trello/Linear/Jira-class
tools commonly expect turned up several worthwhile additions. Of those,
notifications and @mentions were picked as the first sub-project to build,
since they're the most commonly-cited gap once a team grows past a few
people, and mentions are a natural trigger source notifications need anyway.

The other identified gaps (global search, list/table view, bulk actions) are
deferred to their own future design cycles and are out of scope here.
Several items considered and explicitly rejected as disproportionate for this
app's scale (~100 users): sprints/cycles/roadmaps, real-time websocket sync,
Git/PR linking, integrations marketplace, SSO, custom-field builder, time
tracking. Dark mode was also considered but already exists (`ThemeToggle` in
`Nav`).

## Triggers

Two event-based triggers, chosen over a broader "any activity on your task"
firehose to keep the signal-to-noise ratio high:

- **Assigned to a task** — when a task's assignee changes to a project
  member who isn't the person making the change.
- **@mentioned in a comment** — when a comment names a project member via
  the mention picker (see below).

Plus one time-based signal:

- **Due-soon / overdue** — for tasks assigned to the viewing user, not yet
  `DONE`, with `dueDate` in the past or within the next 24 hours.

Due-soon/overdue is **computed at read time, not stored**. The app has no
background job today (no cron, no queue), and adding one is a disproportionate
amount of new infrastructure for a reminder. Instead, the same query that
builds the notification dropdown also pulls in the user's due-soon/overdue
tasks live and merges them into the list. Trade-off accepted: these entries
can't be individually dismissed — they drop off only when the task is
completed, reassigned away from the user, or its due date moves. Everything
else (assignment, mentions) uses real, persisted, individually-readable
notification rows.

## Data model

```prisma
enum NotificationType {
  ASSIGNED
  MENTIONED
}

model Notification {
  id        String            @id @default(cuid())
  userId    String            // recipient
  user      User              @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  taskId    String
  task      Task              @relation(fields: [taskId], references: [id], onDelete: Cascade)
  actorId   String?           // who triggered it; nullable so a deleted actor doesn't break the row
  readAt    DateTime?
  createdAt DateTime          @default(now())

  @@index([userId, readAt])
}
```

No table for due-soon/overdue reminders — they're never persisted, per above.

## Trigger points

Both `reassignTask` and `addTaskComment` already live in
`lib/tasks/mutations.ts`, the single shared module every task mutation routes
through regardless of caller (server action, sync replay). Notification
creation hooks in there once, not per-caller:

- `reassignTask(userId, taskId, assigneeId, ...)`: after a successful
  reassignment, if the new `assigneeId` is non-null and differs from the
  actor (`userId`), insert an `ASSIGNED` notification for that assignee.
- `addTaskComment(userId, taskId, comment, ...)`: gains an optional
  `mentionedUserIds: string[]` parameter. After the comment is created, for
  each id in that list that is (a) a member of the task's project and (b)
  not the actor, insert a `MENTIONED` notification.

Both insertions happen in the same flow as the existing `TaskEvent` write —
no new transaction boundary concerns, but not required to be atomic with it
(a failed notification insert shouldn't roll back the underlying mutation;
notifications are best-effort signal, not the system of record — that already
lives in `TaskEvent`).

## @mention UX

Comments are a plain `<textarea>` (see `CommentActions.tsx`, `CommentForm`) —
no rich text editor. Parsing `@Name` back out of stored comment text is
ambiguous (names can contain spaces, two members can share a first name), so
mentions are tracked out-of-band instead of parsed from text:

- Typing `@` in the comment box opens a dropdown filtered from the task's
  already-loaded `project.members` list (same data `TaskProperties` already
  receives — no new query).
- Picking a member inserts `@Name` as plain text into the textarea *and* adds
  that member's id to a small local set.
- On submit, the comment text and the `mentionedUserIds` array both go to
  `addTaskComment` — the array is authoritative for who gets notified; the
  `@Name` text is purely a plain-text label with no stored markup or special
  rendering.

## UI

A `NotificationsBell` client component sits next to the existing
`ThemeToggle` in `Nav`. It shows an unread-count badge (stored unread
`Notification` rows + live due-soon/overdue count) and opens a dropdown of
recent entries, each linking to its task.

The app has no real-time sync (`revalidatePath` + refetch-on-navigation is
the existing pattern everywhere else), so the badge is not a live push
count — it refreshes on next page load/navigation, consistent with how the
rest of the app already behaves.

All six pages that currently render `<Nav>` (`app/my-tasks/page.tsx`,
`app/projects/page.tsx`, `app/projects/[slug]/page.tsx`,
`app/projects/[slug]/members/page.tsx`, `app/projects/[slug]/settings/page.tsx`,
`app/projects/[slug]/tasks/[id]/page.tsx`) already independently fetch what
`Nav` needs (e.g. `getNavProjects`). A sibling `getNavNotifications(userId)`
call is added to each, matching that existing per-page-fetch pattern rather
than introducing a shared layout wrapper — that's a larger structural change
unrelated to this feature.

Clicking a notification marks it read (`readAt = now()`) and navigates to the
task. A "mark all read" action clears all of the user's unread stored
notifications; it has no effect on due-soon/overdue entries since those
aren't stored.

## Testing

Mirrors the existing Vitest style in `tests/tasks/mutations.test.ts`:

- Reassigning a task to another member creates one `ASSIGNED` notification
  for that member.
- Reassigning a task to yourself, or to the same assignee it already has,
  creates no notification.
- Commenting with `mentionedUserIds` creates `MENTIONED` notifications only
  for ids that are actual project members and not the comment's author;
  bogus/non-member ids are silently ignored, not errored.
- A user cannot fetch or mark-read another user's notifications (access
  control, mirrors the existing `requireProjectAccess` pattern).
- Due-soon/overdue computation includes tasks due within 24h and excludes
  tasks due in 25h, and excludes `DONE` tasks, for the querying user's
  assigned tasks only.

## Out of scope

- Email delivery — in-app only, per earlier decision; no email-sending
  dependency (e.g. Resend) exists in this project today and adding one is a
  separate decision.
- A dedicated `/notifications` page — the nav dropdown is enough at this
  scale; can be added later without a data-model change if the dropdown
  proves too cramped.
- "Comment on a task you're involved in" as a trigger (notify assignee/
  creator on any comment, not just @mentions) — considered and passed over
  in favor of `ASSIGNED` + `MENTIONED` only, to keep signal-to-noise high.
- Cron-based due-date scanning — rejected in favor of computed-on-read, per
  above.

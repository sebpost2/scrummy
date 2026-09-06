# scrummy — backlog

From the 2026-09-06 feature audit. Tier 1 (finish half-built features),
Tier 2 (status filter + board-card quick actions), and Tier 3 items
**i, k, l, m** have shipped. What's left:

## j. @mentions in comments + notifications
- Parse `@name` / `@email` in the comment body, resolve to project members,
  store mentioned user ids on the `TaskEvent` (new `mentions String[]`).
- Notification delivery is its own subsystem. gastly has Web Push plumbing
  that could be cribbed. Minimum viable: an in-app "notifications" list fed
  by mention + assignment events.

## n. Attachments
- Needs blob storage (Vercel Blob or S3). New `Attachment` model keyed to
  `Task`, with upload action + signed URLs.
- Render as a list on task detail; thumbnail for images.

## Shipped
- **i. Manual card ordering** — `Task.rank` (Float), fractional-index
  reorder within a column on drag; backfilled from `createdAt`.
- **k. Subtasks** — `Subtask` model; checklist on task detail, `done/total`
  badge on board cards.
- **l. Comment edit/delete** — `TaskEvent.editedAt` / `deletedAt` (soft);
  author-only, "(edited)" / "comment deleted" in the timeline.
- **m. Project settings** — `/projects/[slug]/settings`: rename, delete,
  leave (last owner blocked), promote/demote member roles.

## Not planned (out of scope by design)
WIP limits, throughput/reporting dashboards, task dependencies / blocked
state, sprints/cycles, roadmap/Gantt, real-time board sync, git/PR linking.

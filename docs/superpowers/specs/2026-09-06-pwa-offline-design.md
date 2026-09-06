# Scrummy PWA with full offline editing — design

Status: approved
Date: 2026-09-06

## Problem

Scrummy is a Next.js 16 App Router task tracker (board, task detail, my-tasks,
members) backed by Postgres via Prisma. It has no installability and no
offline support today: no manifest, no service worker, no `public/` dir.

Goal: make it a fully installable PWA (desktop, Android, iOS) where every
post-login mutation — task edits, task/project creation, member invites,
settings — can be made while offline and syncs when connectivity returns.
Auth itself cannot work offline (no session = no server to talk to).

## Scope

In scope: install experience (manifest, icons, service worker asset/page
caching), an offline mutation queue covering every existing Server Action,
conflict resolution for concurrent edits, and the schema changes needed to
support both.

Out of scope: real-time collaboration (live cursors/presence), a generic
CRDT sync engine, a user-facing manual merge UI. These are explicitly
rejected as oversized for a small-team task tracker (see Approaches).

## Approaches considered

1. **Hand-rolled outbox + dedicated `/api/sync` route (chosen).** Service
   worker only caches static assets/pages. A thin wrapper around each
   existing action call site catches network failures, stores the intent in
   IndexedDB, and replays it later against a small API route that calls the
   same `lib/*/mutations` functions the Server Actions already call.
2. **Workbox/Serwist generic Background Sync plugin.** Queue and replay
   failed POST requests at the network layer with no app code. Rejected:
   replaying Next's internal Server Action wire format is undocumented and
   fragile, and it gives no hook for per-field conflict resolution or
   domain-aware "3 changes pending" UI.
3. **Local-first CRDT engine (RxDB/ElectricSQL/Yjs).** True replicated
   database with automatic merge. Rejected: correct for real-time
   collaborative editing, wildly oversized here — new sync protocol, new
   write path, replaces direct Prisma writes.

## Architecture

- **Service worker** via `serwist` (App-Router-native Workbox successor):
  precaches JS/CSS/fonts/icons; network-first caching for page navigations
  so the last-seen board/task view renders offline; registers Background
  Sync where supported (Chrome/Edge desktop + Android).
- **IndexedDB** via `idb-keyval`: a read-cache store (last-seen page data)
  and an **outbox** store: `{ id, type, args, clientTimestamp, entityId,
  status: 'pending' | 'syncing' | 'failed-permanent' }`.
- **Action wrapper.** Every mutation call site already goes through
  `useOptimistic`/`startTransition` calling a Server Action directly. A
  `callAction(fn, args, meta)` wrapper replaces those call sites: online, it
  behaves identically to today (calls the Server Action, done). On a network
  failure, it writes the intent to the outbox instead of surfacing an error
  — the existing optimistic UI state simply stands until sync confirms it.
- **Replay** triggers on `online`, on tab foreground (`visibilitychange`),
  and via Background Sync where available. Replays POST to `/api/sync`,
  which authenticates via the normal session cookie and calls the matching
  `lib/*/mutations` function directly — it does not attempt to replay the
  Server Action protocol.
- **Failure bucketing on replay.** A queued mutation can fail two different
  ways: transiently (still offline, 5xx) → stays `pending`, retried later;
  or permanently (a domain error the mutation function already throws, e.g.
  `TITLE_REQUIRED`, `ASSIGNEE_NOT_A_MEMBER`, `NOT_A_MEMBER`, a project-member
  invite whose email never had an account) → marked `failed-permanent` and
  surfaced in a "couldn't sync" list for the user to dismiss or retry
  manually. Permanent failures are never silently dropped.

## Data model changes

All additive; no destructive migration.

- `TaskEvent.clientTimestamp DateTime` — when the user actually made the
  edit (set for both online and replayed mutations, so comparisons are
  uniform). Migration backfills existing rows from `createdAt` (online
  mutations set both to "now" anyway, so this is exact for all pre-existing
  history, not an approximation).
- `TaskEvent.clientMutationId String? @unique` — idempotent replay. Every
  task mutation already writes exactly one `TaskEvent`, so this is free
  dedup (a lost-response replay just upserts against the same id) for the
  whole task-mutation surface, including creation (`CREATED` event).
- `Task.rankUpdatedAt DateTime?` — **new, found during spec grounding.**
  `reorderTask` is the one mutation that writes no `TaskEvent` (rank churns
  constantly; putting every drag into the audit log would spam task
  history), so the `TaskEvent`-based LWW check below doesn't cover it. This
  column plays the same role as "latest event of this type" but lives on
  the row directly instead of the event log.
- `createTask` and `createProject` accept an optional client-supplied `id`
  and, for `createTask`, an optional `rank` — lets an offline-created record
  get a permanent id and its locally-chosen board position immediately, no
  server-side id remapping on sync.

## Conflict resolution (per-field last-write-wins)

Almost every mutation is already single-field and already logged as a typed
`TaskEvent` (`STATUS_CHANGED`, `REASSIGNED`, `PRIORITY_CHANGED`,
`DUE_DATE_CHANGED`, `LABELS_CHANGED`, `EDITED`). Before applying a queued
mutation of a given type for a given task, compare its `clientTimestamp` to
the most recent `TaskEvent` of that same type for that task:

- Incoming is newer → apply, write the new event.
- Incoming is older → drop it, but still write a `TaskEvent` marked as
  overwritten (`oldValue`/`newValue` retained) so the audit trail shows the
  attempted edit lost, rather than silently vanishing.

Reorder uses the same comparison against `Task.rankUpdatedAt` instead of an
event.

**Deletes.** Simplest consistent rule, chosen over a fancier
resurrect-on-conflict flow: a queued delete applies unconditionally if the
target still exists at replay time, regardless of any edits that happened
in between. This can discard a concurrent edit's DB row, but the edit's
`TaskEvent` history remains for context. A "resurrect if edited after
delete" policy was considered and rejected — meaningfully more complexity
for an edge case (a small team accidentally deleting something someone else
just edited) that's rare enough to handle by just re-creating the task.

## Known rough edges (documented, not engineered around further)

- **Offline project creation / invites.** Slug and invite-token uniqueness
  are server-authoritative. If an offline-created project's slug collides
  on sync, the server appends a suffix and the client shows a one-time
  "renamed to X" notice. Inviting a member by email while offline can only
  ever be a queued *attempt* — the server has to confirm the email belongs
  to an existing account, so it always lands in the transient-then-maybe-
  permanent-failure path, never an instant local success.
- **iOS Safari** has no Background Sync API — the queue only flushes when
  the app is actively opened while online, not silently in the background.
  Documented platform ceiling, not worked around.
- **Session expiry while offline.** A long offline stretch can mean the
  session cookie expired by the time sync runs. Surfaced as "sign in to
  sync your changes"; the queue is preserved, nothing is dropped.

## PWA shell

Manifest (name, standalone display, theme-color matching the existing
light/dark theme), icon set (192/512/maskable) generated from the current
IBM Plex "S" branding as a placeholder, swappable later.

## Testing

Existing tests are colocated Vitest specs per domain
(`tests/tasks/mutations.test.ts`, etc.). New coverage follows the same
pattern:

- `lib/sync` outbox enqueue/dequeue/status-transition logic — unit tests,
  no browser APIs needed if IndexedDB access is isolated behind a small
  interface.
- `/api/sync` route — per-mutation-type replay, plus the three failure
  buckets (transient, permanent, stale-session).
- Per-field LWW comparison function — table-driven tests: older-loses,
  newer-wins, equal-timestamp tiebreak, reorder-via-`rankUpdatedAt`.
- Service worker caching strategy is not unit-tested (Workbox/serwist
  config is declarative); verified manually via the `run` skill
  (offline toggle in devtools) before calling the feature done.

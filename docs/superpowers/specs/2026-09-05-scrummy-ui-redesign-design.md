# Scrummy UI/UX Redesign — Design

**Date:** 2026-09-05
**Status:** Approved (brainstorming), pending implementation plan

## Goal

Full visual redesign of every screen plus real interaction upgrades, in the
"refined productivity tool" direction (Linear / Height / Vercel lineage): tight
density, confident neutral palette with one sharp accent, crisp 1px borders, a
small deliberate type scale, restrained functional motion. Evolves the current
design rather than replacing its mechanism.

## Scope

**In:** landing, login/signup, projects list, board, task detail, my-tasks,
members. Drag-and-drop board, optimistic/inline edits, toasts + pending states,
auto light/dark theming with a manual toggle.

**Out:** data model changes, auth changes, new server-side task logic. The
existing `lib/tasks/mutations.ts` and server actions are reused unchanged.

## Approach

### Styling mechanism — evolve `globals.css` in place

Keep plain CSS + semantic class names. Rewrite the token layer; refine and
extend every component class; add new component classes. No Tailwind, no CSS
Modules — no styling-infra migration.

Rejected:
- **Tailwind v4 migration** — touches every file, config/build risk, no payoff
  for a redesign at this size.
- **Per-component CSS Modules** — heavy file churn, loses global-token
  ergonomics, no benefit at this size.

### New dependencies

| Dep | Purpose |
| --- | --- |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers` | Accessible board drag-and-drop (pointer + keyboard sensors) |
| `lucide-react` | Icon set (nav, timeline event types, menus, buttons) |
| `sonner` | Toast notifications |
| React 19 `useOptimistic` | Optimistic edits — built in, no dep |

Decisions locked during brainstorming: `sonner` over a hand-rolled toast
context; `lucide-react` over hand-rolled SVGs. Both are small and tree-shakeable.

## Design language & tokens (`app/globals.css` `:root`)

- **Palette:** cool-neutral ramp (~10 steps) + one accent in the current blue
  family, tuned for WCAG AA on both themes. Recalibrated semantic tokens for
  priority (low/medium/high) and status (todo/in_progress/done). Add
  `--bg-elevated`, `--border-subtle`, and hover/active surface tokens.
- **Theme:** `:root` defines the full light palette. Dark overrides live under
  `@media (prefers-color-scheme: dark)` guarded as
  `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`
  so the manual toggle wins in both directions. A tiny inline script in `<head>`
  applies `data-theme` from `localStorage` before first paint to avoid a flash.
  `body` gets an explicit token background.
- **Type:** keep IBM Plex Sans / IBM Plex Mono. Scale: 12 / 13 / 14 / 16 / 20 /
  28 px with defined line-heights and heading letter-spacing. Mono reserved for
  timestamps, counts, IDs.
- **Spacing:** 4px base, `--space-1..8`. **Radius:** 6 / 8 / 12.
  **Shadows:** 3-step, softer than today. **Motion:** `--ease`, `--dur-fast`,
  `--dur-base` (120–180ms); all motion gated by `prefers-reduced-motion`.

## App shell (`app/_components/Nav.tsx` + layout)

Sticky nav: brand mark → **project switcher** dropdown (current project + quick
jump) → `Projects` / `My tasks` links → right side **theme toggle** + **user
menu** (avatar, email, log out). Mobile: primary links collapse into a menu.
One shared headless `Menu` primitive (keyboard-navigable) powers the switcher
and the user menu. Shared page container + `PageHeader` refined.

## Board — `app/projects/[slug]/page.tsx` + new client board

- New client component owns `useOptimistic` task state. Columns are `@dnd-kit`
  droppables; cards are sortable/draggable.
- **Drag card to another column** → optimistic move → `updateStatusAction` →
  toast ("Moved to In progress", with undo that re-invokes the action) →
  server records the activity event as it already does. Drag overlay renders a
  lifted card. Keyboard: focus card, Space to lift, arrows to move, Space to
  drop.
- **Card redesign:** priority left stripe + dot, 2-line-clamped title, footer
  row with assignee `Avatar` (initials fallback), due date as `RelativeTime`
  ("in 2d", red when overdue), label chips (max 2 + "+N").
- **Filter bar → compact toolbar:** assignee / priority / label as pill
  dropdowns with active-state styling and a clear affordance; live task count.
- **New task:** replace the bottom `NewTaskForm` dump with an inline composer at
  the top of the "To do" column ("+ Add task" reveals a title field in place).

## Task detail — `app/projects/[slug]/tasks/[id]/page.tsx`

Two-column layout:
- **Main:** title (inline-editable), description, activity timeline, comment
  composer (auto-grow textarea, ⌘/Ctrl+Enter to submit, pending state).
- **Sidebar panel:** properties — status, assignee, priority, due date, labels.
  Each control is inline and **optimistic + toast** on change, calling the
  existing per-field server actions.
- **Timeline:** per-event-type `lucide` icon, `RelativeTime` with exact
  timestamp on hover, day-group separators. Newest-first ordering preserved.

## My tasks — `app/my-tasks/page.tsx`

Grouped-by-project list, section headers, denser rows than board cards (status
dot, title, project, due date), overdue emphasis. Refreshed empty state; keep
the asserted string `Nothing assigned` (or update the test in the same step).

## Projects list · Members · Auth · Landing

- **Projects list:** cards with name + task-count summary ("12 open · 3 done"),
  hover lift, inline "create project" composer instead of the dumped form. Keep
  asserted project-name strings and `No projects yet`.
- **Members:** table with avatars, name, email, role badge; cleaner add-member
  form with inline validation.
- **Auth (login/signup):** centered card, brand mark, primary + Google button
  with a real "or" separator, inline field errors.
- **Landing (`app/page.tsx`):** re-skin the existing hero on the new tokens —
  same structure, tighter type, refined mock panel.

## New shared components (`app/_components/`)

`Avatar`, `Menu` (headless dropdown), `Modal` / `Dialog`, `ThemeToggle`,
`RelativeTime`, `Skeleton`, `Kbd`, `IconButton`, `Toaster` host.

## Testing & verification

- Existing page tests assert on text content, not markup — keep them green.
  Update only when empty-state / label copy changes, in the same step.
- **New unit tests:** optimistic board reducer; drag-end → status-change
  mapping. No new server logic, so `lib/tasks/mutations.ts` tests are untouched.
- **Manual checklist:** `next dev`; both themes + toggle with no flash; keyboard
  drag-and-drop; mobile board (single column); overdue date colors; error
  rollback path (server action rejects → optimistic state reverts → error toast).
- `npm run lint` and `npm test` green at every step.

## Implementation order

1. Token layer (`globals.css` `:root`, theme script, base/reset).
2. App shell + shared primitives (`Menu`, `Avatar`, `ThemeToggle`, `Toaster`,
   `RelativeTime`, `IconButton`, `Kbd`, `Skeleton`, `Modal`).
3. Board redesign + drag-and-drop + optimistic status + toasts.
4. Task detail redesign + inline optimistic properties + timeline.
5. My tasks.
6. Projects list + members.
7. Auth screens.
8. Landing.

Each step is independently reviewable and leaves lint + tests green.

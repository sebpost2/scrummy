# Scrummy "Case File" Redesign — Design

**Date:** 2026-09-07
**Status:** Approved (brainstorming), pending implementation plan

## Goal

Re-skin the already-implemented "refined productivity tool" design (shipped
2026-09-05) into a distinctive identity, and fix mobile responsiveness gaps
across the app. The current palette/shadow/radius system reads as a generic
cool-blue SaaS dashboard; this redesign grounds the visual language in
scrummy's actual differentiator — **it remembers every change** — as an
audit-trail / index-card system ("case file"), and audits every screen on a
phone-width viewport.

## Scope

**In:** token layer (color/radius/shadow/motion), app shell/nav (desktop +
new mobile nav), board card treatment, task detail mono/stamp treatment,
mobile layout fixes across every screen (landing, auth, projects list,
board, task detail, my-tasks, members).

**Out:** data model, auth, server mutation logic, drag-and-drop mechanics,
optimistic-update architecture, dependency changes (no new npm packages —
this is a token/CSS/markup pass on the existing system built in the
2026-09-05 redesign).

## Approach

Same mechanism as before: plain CSS + semantic class names in
`app/globals.css`, no Tailwind, no CSS Modules. This pass rewrites the
token layer and touches component classes; component *structure* (React)
changes only where mobile behavior or the tab motif genuinely requires new
markup (Nav, BoardCard, PriorityBadge/StatusBadge tab treatment).

**One font addition:** `IBM Plex Serif` via `next/font/google`, same family
already in use (Plex Sans, Plex Mono) — for page titles / brand mark only.
No new dependency, just another import from the font already integrated.

## Design language & tokens (`app/globals.css` `:root`)

### Color — two-ink ledger system

Replaces the single blue accent with two functional inks: red for
priority/primary action, blue for status/navigation. Paper tones are grey,
not the cream/terracotta combination that reads as a generic AI default.

| Token | Light | Dark | Job |
| --- | --- | --- | --- |
| `--bg` (paper) | `#EEECE6` | `#17140F` | page ground — stone grey / ink-brown-black |
| `--bg-elevated` / `--surface` (card) | `#F8F7F3` | `#211D17` | index-card surface |
| `--surface-sunken` | `#E4E1D9` | `#1B1712` | recessed areas (inputs, sunken rows) |
| `--surface-hover` | `#E7E4DB` | `#26221B` | |
| `--surface-active` | `#DEDACE` | `#2C2720` | |
| `--border-subtle` / `--border` / `--border-strong` | `#E4E1D8` / `#D8D4C7` / `#C2BCA9` | `#26221B` / `#332E25` / `#463F30` | |
| `--text` (ink) | `#201D1A` | `#EDE9E1` | warm near-black / near-white, not cool grey |
| `--text-muted` | `#5C574C` | `#B4AC9C` | |
| `--text-subtle` | `#8B8478` | `#8A8272` | |
| `--accent` (stamp-red, priority/primary) | `#A5342A` | `#D9695C` | replaces the old blue accent |
| `--accent-hover` / `--accent-active` | `#8E2C23` / `#78241C` | `#E58275` / `#F09B8F` | |
| `--accent-fg` | `#FFFFFF` | `#17140F` | |
| `--accent-wash` | `#F4E4E1` | `#3A231E` | |
| `--link` (stamp-blue, status/navigation) | `#2D3A66` | `#8C9BD6` | second functional ink |
| `--link-wash` | `#E4E7F0` | `#232A42` | |
| `--danger` | `#A5342A` (= accent) | `#D9695C` | shares the stamp-red ink; danger *is* the accent's most urgent job |
| `--danger-wash` | `#F4E4E1` | `#3A231E` | |
| `--success` (moss) | `#3F5D3A` | `#7FAE72` | |
| `--success-wash` | `#E7EDE3` | `#1E2A1B` | |
| `--warning` | `#8A6420` | `#D9A94F` | |
| `--warning-wash` | `#F1E6CE` | `#332A15` | |
| `--prio-high` | `#A5342A` | `#D9695C` | = accent |
| `--prio-medium` | `#8A6420` | `#D9A94F` | = warning |
| `--prio-low` | `#5C574C` | `#B4AC9C` | = text-muted |
| `--prio-*-wash` | matches each color's `*-wash` above | | |
| `--status-todo` | `#5C574C` | `#B4AC9C` | |
| `--status-progress` | `#2D3A66` | `#8C9BD6` | = link |
| `--status-done` | `#3F5D3A` | `#7FAE72` | = success |

Dark-mode block structure is unchanged from the existing pattern (must
stay unchanged — it is the documented correctness contract): full palette
on bare `:root`, dark overrides duplicated under both
`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {…} }`
and `:root[data-theme="dark"] {…}`. `body` keeps an explicit
`background: var(--bg)`.

### Radius, shadow, motion

- **Radius:** data-dense surfaces (board cards, table/list rows, timeline
  entries) go sharp — `--radius-data: 3px`. Interactive controls (buttons,
  inputs, menus, modals) keep a soft radius — `--radius-control: 6px`,
  `--radius-panel: 10px`. This is the core "index card, not SaaS tile" tell:
  today every surface uses the same rounded-card radius, this pass splits
  data surfaces from control surfaces.
- **Shadow:** replace the soft/blurred SaaS shadow with a tight 1px-offset
  "paper edge": `--shadow-sm: 0 1px 0 rgba(32,29,26,0.08)`,
  `--shadow-md: 0 1px 0 rgba(32,29,26,0.10), 0 2px 6px rgba(32,29,26,0.08)`,
  `--shadow-lg: 0 2px 0 rgba(32,29,26,0.12), 0 8px 24px rgba(32,29,26,0.16)`
  (dark-mode equivalents scale the alpha up against black, same shape).
- **Motion:** keep `--ease` / `--dur-fast` / `--dur-base` as-is. Add one new
  motion moment, gated by `prefers-reduced-motion` like everything else: a
  status-change "stamp settle" on `.badge--status-*` — `transform: scale(1.15)`
  → `scale(1)` over `--dur-base`. This is the *only* new animation; no
  hover-lift or fade-slide added anywhere else.

### Type

Keep IBM Plex Sans (body/UI) and IBM Plex Mono (data) as the two families —
both already integrated, no replacement. Add **IBM Plex Serif** for page
titles (`h1`) and the nav brand mark only, via the same `next/font/google`
pattern as the existing two fonts: `--font-plex-serif`. Type scale
(`--text-xs` … `--text-xl`) is unchanged from the current values.

Mono becomes a **structural rule, not a decoration**: every timestamp, task
ID, and count in the app renders in `var(--font-mono)` consistently — this
is enforced by using the existing `Badge({ mono: true })` /
`.mono` utility everywhere a timestamp/ID/count appears, including places
that currently render them in the body font (audit during implementation).

## App shell — Nav (desktop + new mobile)

Desktop: unchanged structure (brand mark → project switcher → links →
theme toggle → user menu), re-skinned onto the new tokens. Brand mark text
(`scrummy`) renders in `--font-plex-serif`.

**Mobile gap found in audit:** at `≤720px` the current CSS does
`.nav__links .nav__link { display: none; }` — this removes the "Projects"
and "My tasks" links entirely with no replacement, leaving no way to
navigate on a phone except the project switcher. Fix: add a **bottom tab
bar** (`position: fixed; bottom: 0`) shown only `≤720px`, three items —
Projects, My tasks, Menu (opens the existing `UserMenu`) — each a 44px+
tap target with icon + label. The desktop top nav's `.nav__link`s and
`UserMenu` position stay hidden on mobile instead of the tab bar
duplicating them; `ThemeToggle` and `ProjectSwitcher` remain in the (now
link-less) top bar. `.container` bottom padding increases to clear the
fixed tab bar.

## Board — card tab motif + mobile paging

- **Tab, not stripe:** `BoardCard`'s priority indicator changes from a thin
  left stripe to a solid-color block "folder tab" occupying the card's full
  left edge (`width: 6px` today → keep width, change from
  gradient/thin-line styling to a flat solid fill using
  `--prio-*`/`--status-*`, sharp outer corner matching `--radius-data`).
- **Mono IDs:** cards already show relative time; add the task's short id
  (existing data, e.g. last segment of `task.id` or a display number if one
  exists — confirm during implementation which identifier the app already
  exposes) in `.mono`, small and muted, next to the title.
- **Mobile:** today `.board { grid-template-columns: 1fr; }` stacks all
  three columns full-height in one vertical scroll — functional but long.
  Replace with horizontal snap paging: `.board` becomes a horizontal flex
  row with `scroll-snap-type: x mandatory; overflow-x: auto`, each column
  `scroll-snap-align: start; min-width: 92vw`. A small dot/column indicator
  under the toolbar shows position. Pure CSS — no carousel library. Keyboard
  and `@dnd-kit` drag behavior unchanged (this only changes layout/overflow,
  not the DOM order or sortable context).

## Task detail

Two-column layout unchanged; on mobile the properties panel already moves
above the main content (`order: -1`, existing `≤860px` rule) — keep it,
re-skin onto new tokens. Sharpen `.detail__side` panel corners to
`--radius-panel` (soft, it's a control surface) while the timeline entries
inside it use `--radius-data` (sharp). Timeline day-group labels
(`.timeline__day`, currently uppercase-tracked) stay as-is — a date divider
is a legitimate structural label, not decorative eyebrow text.

## My tasks · Projects list · Members · Auth · Landing

Token-driven re-skin, no structural changes beyond what mobile requires:

- **My tasks:** `.taskrow` list already reasonably dense; sharpen row
  corners, ensure the row's status dot + due date use the new status/danger
  tokens, confirm 44px+ row tap target on mobile.
- **Projects list:** card summary line — confirm it does **not** use a
  middle-dot separator (`"12 open · 3 done"` reads as generic template
  chrome per the design brief); use plain text (`"12 open, 3 done"`) if the
  middot pattern is present in the current copy.
- **Members:** table re-skin; on mobile confirm the table doesn't overflow
  unreadably — collapse to stacked rows (name/email/role/actions stacked)
  below `≤600px` if the existing table isn't already responsive.
- **Auth:** centered card re-skin, brand mark in Plex Serif.
- **Landing (`app/page.tsx`):** the hero's kanban mock panel re-skins onto
  the tab/mono motif so it previews the real board's new look. Confirm the
  hero grid (`≤860px` today) stacks cleanly and CTA buttons are full-width
  tap targets on mobile.

## Testing & verification

- Existing page tests assert on text content, not markup/styles — stay
  green; only touch a test if this pass changes asserted copy (the
  middot check above).
- **Manual checklist:** `next dev` at a phone-width viewport (375px) and a
  tablet width (768px) for every in-scope screen; both themes + toggle, no
  flash; keyboard focus visible on all new/changed interactive elements;
  `prefers-reduced-motion` disables the new stamp-settle animation; mobile
  bottom tab bar doesn't overlap page content or the toast host; board
  horizontal paging works via touch scroll, mouse drag-scroll, and arrow
  keys where focus is on a column.
- `npm run lint` and `npm test` green at every step.

## Implementation order

1. Token layer rewrite (color/radius/shadow/motion) + Plex Serif font.
2. Nav: re-skin + mobile bottom tab bar.
3. Board: card tab motif, mono id, mobile horizontal paging.
4. Task detail: re-skin, sharp/soft corner split.
5. My tasks, Projects list (+ middot copy check), Members (+ mobile table
   collapse if needed).
6. Auth, Landing.
7. Full mobile audit pass across all screens at 375px/768px, fix anything
   found.

Each step is independently reviewable and leaves lint + tests green.

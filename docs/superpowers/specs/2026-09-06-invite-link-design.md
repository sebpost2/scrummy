# Project Invite Link — Design

**Date:** 2026-09-06
**Status:** Approved (brainstorming), pending implementation plan

## Goal

Let a project owner share one link that lets anyone who opens it join the
project — no need to already know the invitee's email or account status.
Modeled on a Google Doc's "anyone with the link" share: one URL per project,
persistent until the owner explicitly regenerates it.

## Scope

**In:** one reusable invite link per project, a Members-page UI to view/copy
and regenerate it, joining via the link for both existing and brand-new
(email/password) users.

**Out:**
- Per-invitee unique links or single-use tokens.
- Link expiry / scheduled revocation — only manual regeneration invalidates
  a link.
- Carrying the invite token through Google OAuth signup/login (see
  "Known limitation" below).
- Removing or changing the existing email-based "Add a member" flow — it
  stays as-is; the link is additive.

## Data model

Add one column:

```prisma
model Project {
  ...
  inviteToken String @unique
}
```

- Generated at project creation (`createProject`) with
  `randomBytes(16).toString("hex")` — same primitive already used for the
  project-slug suffix and session tokens, so no new crypto dependency.
- Stored in plain text, not hashed. This is a deliberate difference from
  `Session.tokenHash`: a session token is a bearer secret shown to the user
  exactly once (in a cookie) and never redisplayed, so only a hash needs to
  persist. An invite link must be redisplayed to the owner on demand (to
  re-copy or re-share), so the raw value has to be stored. Its security
  model is "possession of the link grants join access," identical to a
  Google Doc resource key — not a login credential.
- Migration is additive and backfills existing projects with a fresh random
  token; no existing data is modified or at risk.
- Regenerating overwrites the column, which atomically invalidates the old
  URL — any request bearing the old token simply finds no matching project.

## Mutations (`lib/projects/mutations.ts`)

Follows the existing owner-check / upsert patterns already used by
`addProjectMemberByEmail`:

- `createProject` — adds `inviteToken` to the created row.
- `regenerateInviteToken(userId, projectId)` — owner-only; generates and
  saves a new token; returns it.
- `joinProjectByInviteToken(userId, token)` — looks up the project by token;
  if found, `upsert`s a `ProjectMember` row with `role: "MEMBER"` and
  `update: {}` (so an existing membership, including `OWNER`, is never
  downgraded); returns `{ ok: true, slug }` or `{ ok: false }` if the token
  doesn't match any project. Joining is idempotent — visiting the link
  twice, or as an existing member/owner, is a no-op past the first join.

## Accepting the link — `app/invite/[token]/page.tsx`

Server component, no client interactivity needed:

1. Look up the project by `inviteToken`. Not found → render a small inline
   "This invite link is invalid or has been revoked" message with a link to
   `/login`. (Not `notFound()` — this is an expected, user-facing outcome
   whenever a link gets regenerated or mistyped, not a broken route.)
2. `getSessionUser()` (not `requireUser()` — an anonymous visitor is the
   expected case here, not an error):
   - No session → `redirect(`/signup?invite=${token}`)`.
   - Session exists → call `joinProjectByInviteToken`, then
     `redirect(`/projects/${slug}`)`.

## Carrying the token through signup/login

- `app/signup/page.tsx` and `app/login/page.tsx` read `searchParams.invite`
  and pass it to `SignupForm`/`LoginForm` as a prop.
- Both forms render `{invite && <input type="hidden" name="invite" value={invite} />}`
  so it rides along in the existing `FormData` — no new plumbing.
- `createAccount` and `login` (in `app/signup/actions.ts` /
  `app/login/actions.ts`) read `formData.get("invite")` after establishing
  the session; if present and valid, call `joinProjectByInviteToken` and
  redirect to the project board instead of `/projects`. If the token is
  missing or invalid, fall through to today's behavior
  (`redirect("/projects")`) unchanged — a stale or absent invite never
  blocks normal signup/login.
- The existing cross-links between the login and signup pages ("Already
  have an account? Log in" / "Need an account? Sign up") should preserve
  `?invite=` when present, so switching forms mid-flow doesn't drop the
  invite.

**Known limitation:** the Google OAuth flow (`app/api/auth/google/*`) is not
wired to carry the invite token — its own `state` param is already used for
CSRF, and threading a second value through it is more plumbing than this
feature calls for. A user who signs up via Google from an invite link lands
on `/projects` instead of the target project; re-clicking the same invite
link once, now logged in, completes the join via the page-2 flow above. This
is an accepted gap, not an oversight.

## Members page UI

New "Invite link" block, placed above the existing "Add a member" section,
visible only to owners (same gate as the rest of the page):

- Read-only text input showing the full URL (`${appOrigin()}/invite/${token}`,
  reusing the existing `appOrigin()` helper from `lib/auth/google.ts`) with a
  "Copy" button (client component, `navigator.clipboard.writeText`).
- "Generate new link" button — server action calling `regenerateInviteToken`,
  then re-rendering the field with the new URL. A toast confirms the old
  link no longer works.
- The email "Add a member" form below is untouched.

## Testing

- Mutation tests for `joinProjectByInviteToken` (valid token joins as
  member; invalid token returns `ok: false`; joining twice is a no-op;
  joining as an existing owner doesn't downgrade the role) and
  `regenerateInviteToken` (owner-only; changes the stored token).
- Route test for `/invite/[token]`: valid token + logged-in user redirects
  to the project; valid token + anonymous user redirects to
  `/signup?invite=...`; invalid token renders the inline error instead of
  throwing.
- Signup/login action tests: an `invite` field in `formData` results in
  project membership and a redirect to the board; an absent or invalid one
  falls back to today's `redirect("/projects")` with no error surfaced.

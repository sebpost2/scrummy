# Project Invite Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a project owner share one persistent link that lets anyone who opens it join the project, for both existing and brand-new users.

**Architecture:** One `inviteToken` column on `Project`, generated at creation and only changed by an explicit "regenerate." A new `/invite/[token]` server route resolves the token, joins logged-in visitors immediately, and hands anonymous visitors to signup/login with the token riding along as a hidden form field. The Members page gets a small client component to view/copy/regenerate the link.

**Tech Stack:** Next.js App Router (server actions, server components), Prisma/PostgreSQL, Vitest against a real throwaway DB (`tests/setup.ts`).

**Spec:** `docs/superpowers/specs/2026-09-06-invite-link-design.md`

## Global Constraints

- Token is `randomBytes(16).toString("hex")` — 32 lowercase hex characters. Same primitive already used for `Project.slug`'s suffix and `Session` tokens.
- Token is stored in **plain text**, not hashed — it must be redisplayed to the owner on demand (spec: "Data model").
- The link **never expires**; only an explicit regenerate invalidates it.
- Google OAuth signup/login is explicitly **out of scope** for carrying the invite token (spec: "Known limitation").
- The existing email-based "Add a member" flow (`AddMemberForm`, `addMemberAction`, `addProjectMemberByEmail`) is untouched.
- The `Project.inviteToken` migration must be additive and backfill existing rows — no data loss, no dropped/renamed columns.
- Joining via token is idempotent and never downgrades an existing role (spec: "Mutations").

---

### Task 1: `inviteToken` column, migration, and `createProject`

**Files:**
- Modify: `prisma/schema.prisma` (the `Project` model)
- Create: `prisma/migrations/<timestamp>_add_invite_token/migration.sql`
- Modify: `lib/projects/mutations.ts:22-29` (`createProject`)
- Modify: `tests/projects/mutations.test.ts:30-44` (`describe("createProject", ...)`)

**Interfaces:**
- Produces: `Project.inviteToken: string` (Prisma model field, available on every `Project` returned from any query from here on).
- Consumes: nothing new.

- [ ] **Step 1: Add the field to the schema**

In `prisma/schema.prisma`, in the `Project` model, add `inviteToken` right after `slug`:

```prisma
model Project {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  inviteToken String   @unique
  createdById String
  createdBy   User     @relation("ProjectCreator", fields: [createdById], references: [id])
  createdAt   DateTime @default(now())

  members ProjectMember[]
  tasks   Task[]
}
```

- [ ] **Step 2: Hand-write the migration**

A required, unique, backfilled column needs manual SQL — letting `prisma migrate dev` auto-diff this would either prompt interactively (which hangs in a non-interactive shell) or fail outright. Create the migration folder yourself instead.

Run this to get a timestamp in Prisma's migration-folder format:

```bash
date -u +%Y%m%d%H%M%S
```

Using that output as `<ts>`, create `prisma/migrations/<ts>_add_invite_token/migration.sql` with exactly this content:

```sql
-- AlterTable
ALTER TABLE "Project" ADD COLUMN "inviteToken" TEXT;

-- Backfill existing rows with a random 32-char token
UPDATE "Project" SET "inviteToken" = md5(id || clock_timestamp()::text || random()::text) WHERE "inviteToken" IS NULL;

-- Enforce NOT NULL now that every row has a value
ALTER TABLE "Project" ALTER COLUMN "inviteToken" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Project_inviteToken_key" ON "Project"("inviteToken");
```

- [ ] **Step 3: Apply the migration and regenerate the client**

```bash
npx prisma migrate dev
```

Expected: Prisma finds the new migration folder already matches the current `schema.prisma`, applies it directly (no prompt, no new diff), prints something like "Your database is now in sync with your schema", and regenerates the Prisma Client. `prisma.config.ts` already points `migrate dev` at `.env.test`'s throwaway database whenever `.env.test` exists — do not pass `PRISMA_TARGET=prod` or otherwise target production/dev here.

If Prisma reports schema drift unrelated to this change (for example, complains about migrations already recorded elsewhere) or prompts for anything, STOP and report back rather than accepting a reset — do not run `prisma migrate reset`.

- [ ] **Step 4: Update `createProject`**

In `lib/projects/mutations.ts`, replace:

```ts
export async function createProject(userId: string, name: string): Promise<Project> {
  const slug = `${slugify(name)}-${randomBytes(3).toString("hex")}`;
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ data: { name, slug, createdById: userId } });
    await tx.projectMember.create({ data: { userId, projectId: project.id, role: "OWNER" } });
    return project;
  });
}
```

with:

```ts
export async function createProject(userId: string, name: string): Promise<Project> {
  const slug = `${slugify(name)}-${randomBytes(3).toString("hex")}`;
  const inviteToken = randomBytes(16).toString("hex");
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({ data: { name, slug, inviteToken, createdById: userId } });
    await tx.projectMember.create({ data: { userId, projectId: project.id, role: "OWNER" } });
    return project;
  });
}
```

- [ ] **Step 5: Write the failing test**

In `tests/projects/mutations.test.ts`, inside the existing `describe("createProject", ...)` block, add a second `it` after the existing one:

```ts
  it("generates a unique invite token", async () => {
    const owner = await prisma.user.create({
      data: { email: `owner-invite-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;

    const project = await createProject(owner.id, "Invite Token Project");
    projectId = project.id;

    expect(project.inviteToken).toMatch(/^[a-f0-9]{32}$/);
  });
```

- [ ] **Step 6: Run the tests**

```bash
npx vitest run tests/projects/mutations.test.ts
```

Expected: all tests in the file PASS, including the new one.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma prisma/migrations lib/projects/mutations.ts tests/projects/mutations.test.ts
git commit -m "$(cat <<'EOF'
Add inviteToken column to Project

Every project now gets a random 32-char token at creation, backfilled
for existing rows via a hand-written migration (a required unique
column needs manual SQL, not prisma migrate dev's auto-diff).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `regenerateInviteToken` and `joinProjectByInviteToken`

**Files:**
- Modify: `lib/projects/mutations.ts` (add two exported functions)
- Modify: `tests/projects/mutations.test.ts` (add two new `describe` blocks)

**Interfaces:**
- Consumes: `getProjectMembership`, `prisma` (already in this file).
- Produces:
  - `regenerateInviteToken(userId: string, projectId: string): Promise<{ ok: true; token: string } | { ok: false; message: string }>`
  - `joinProjectByInviteToken(userId: string, token: string): Promise<{ ok: true; slug: string } | { ok: false }>`

- [ ] **Step 1: Write the failing tests**

In `tests/projects/mutations.test.ts`, add to the imports from `@/lib/projects/mutations`:

```ts
import {
  createProject,
  getProjectMembership,
  addProjectMemberByEmail,
  removeProjectMember,
  renameProject,
  deleteProject,
  leaveProject,
  updateMemberRole,
  regenerateInviteToken,
  joinProjectByInviteToken,
} from "@/lib/projects/mutations";
```

Then add these two `describe` blocks anywhere after the existing `describe("addProjectMemberByEmail", ...)` block:

```ts
describe("regenerateInviteToken", () => {
  it("lets an owner regenerate the invite token", async () => {
    const owner = await prisma.user.create({
      data: { email: `regen-owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const project = await createProject(owner.id, "Regen Project");
    projectId = project.id;

    const result = await regenerateInviteToken(owner.id, project.id);

    expect(result.ok).toBe(true);
    const updated = await prisma.project.findUnique({ where: { id: project.id } });
    expect(updated?.inviteToken).not.toBe(project.inviteToken);
  });

  it("rejects a non-owner", async () => {
    const owner = await prisma.user.create({
      data: { email: `regen-owner2-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const member = await prisma.user.create({
      data: { email: `regen-member-${Date.now()}@example.com`, passwordHash: "x", name: "Member" },
    });
    memberId = member.id;
    const project = await createProject(owner.id, "Regen Guarded Project");
    projectId = project.id;
    await addProjectMemberByEmail(owner.id, project.id, member.email);

    const result = await regenerateInviteToken(member.id, project.id);

    expect(result).toEqual({ ok: false, message: expect.any(String) });
  });
});

describe("joinProjectByInviteToken", () => {
  it("adds the visitor as a MEMBER and returns the project slug", async () => {
    const owner = await prisma.user.create({
      data: { email: `join-owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const project = await createProject(owner.id, "Join Project");
    projectId = project.id;
    const joiner = await prisma.user.create({
      data: { email: `join-member-${Date.now()}@example.com`, passwordHash: "x", name: "Joiner" },
    });
    memberId = joiner.id;

    const result = await joinProjectByInviteToken(joiner.id, project.inviteToken);

    expect(result).toEqual({ ok: true, slug: project.slug });
    expect((await getProjectMembership(joiner.id, project.id))?.role).toBe("MEMBER");
  });

  it("returns ok:false for an unknown token", async () => {
    const owner = await prisma.user.create({
      data: { email: `join-owner2-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const project = await createProject(owner.id, "Join Guarded Project");
    projectId = project.id;

    const result = await joinProjectByInviteToken(owner.id, "not-a-real-token");

    expect(result).toEqual({ ok: false });
  });

  it("is idempotent and never downgrades an existing owner", async () => {
    const owner = await prisma.user.create({
      data: { email: `join-owner3-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const project = await createProject(owner.id, "Join Idempotent Project");
    projectId = project.id;

    await joinProjectByInviteToken(owner.id, project.inviteToken);
    await joinProjectByInviteToken(owner.id, project.inviteToken);

    expect((await getProjectMembership(owner.id, project.id))?.role).toBe("OWNER");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/projects/mutations.test.ts
```

Expected: FAIL with "regenerateInviteToken is not a function" / "joinProjectByInviteToken is not a function" (or a TypeScript import error to the same effect).

- [ ] **Step 3: Implement the two functions**

In `lib/projects/mutations.ts`, add after `addProjectMemberByEmail` (before `const CANNOT_REMOVE_MEMBER = ...`):

```ts
const CANNOT_REGENERATE_INVITE = "Only an owner can regenerate the invite link.";

export async function regenerateInviteToken(
  userId: string,
  projectId: string,
): Promise<{ ok: true; token: string } | { ok: false; message: string }> {
  const membership = await getProjectMembership(userId, projectId);
  if (!membership || membership.role !== "OWNER") {
    return { ok: false, message: CANNOT_REGENERATE_INVITE };
  }

  const token = randomBytes(16).toString("hex");
  await prisma.project.update({ where: { id: projectId }, data: { inviteToken: token } });
  return { ok: true, token };
}

export async function joinProjectByInviteToken(
  userId: string,
  token: string,
): Promise<{ ok: true; slug: string } | { ok: false }> {
  const project = await prisma.project.findUnique({ where: { inviteToken: token } });
  if (!project) return { ok: false };

  await prisma.projectMember.upsert({
    where: { userId_projectId: { userId, projectId: project.id } },
    update: {},
    create: { userId, projectId: project.id, role: "MEMBER" },
  });

  return { ok: true, slug: project.slug };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/projects/mutations.test.ts
```

Expected: PASS, full file.

- [ ] **Step 5: Commit**

```bash
git add lib/projects/mutations.ts tests/projects/mutations.test.ts
git commit -m "$(cat <<'EOF'
Add regenerateInviteToken and joinProjectByInviteToken mutations

Owner-gated regeneration and an idempotent join-by-token, following
the same getProjectMembership/upsert pattern as addProjectMemberByEmail.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `/invite/[token]` accept page

**Files:**
- Create: `app/invite/[token]/page.tsx`
- Create: `tests/invite/page.test.ts`

**Interfaces:**
- Consumes: `getSessionUser` (`@/lib/auth/session`), `joinProjectByInviteToken` (`@/lib/projects/mutations`), `prisma` (`@/lib/db/prisma`).
- Produces: default export `InvitePage({ params: Promise<{ token: string }> })` — an async React Server Component.

- [ ] **Step 1: Write the failing test**

Create `tests/invite/page.test.ts`:

```ts
import { describe, it, expect, afterEach, afterAll, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { prisma } from "@/lib/db/prisma";
import { createProject } from "@/lib/projects/mutations";

let currentUser: { id: string; name: string; email: string } | null = null;
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, getSessionUser: vi.fn(async () => currentUser) };
});
import InvitePage from "@/app/invite/[token]/page";

let ownerId: string | undefined;
let joinerId: string | undefined;
let projectId: string | undefined;

afterEach(async () => {
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  if (joinerId) await prisma.user.deleteMany({ where: { id: joinerId } });
  ownerId = joinerId = projectId = undefined;
  currentUser = null;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("InvitePage", () => {
  it("shows an invalid-link message for an unknown token", async () => {
    const element = await InvitePage({ params: Promise.resolve({ token: "does-not-exist" }) });
    const html = renderToStaticMarkup(element as ReactElement);
    expect(html).toContain("Invite link not found");
  });

  it("redirects an anonymous visitor to signup with the token attached", async () => {
    const owner = await prisma.user.create({
      data: { email: `invite-owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const project = await createProject(owner.id, "Invite Project");
    projectId = project.id;
    currentUser = null;

    let redirected: unknown;
    try {
      await InvitePage({ params: Promise.resolve({ token: project.inviteToken }) });
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toContain(
      `/signup?invite=${project.inviteToken}`,
    );
  });

  it("joins a logged-in visitor and redirects to the project board", async () => {
    const owner = await prisma.user.create({
      data: { email: `invite-owner2-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const project = await createProject(owner.id, "Invite Project 2");
    projectId = project.id;
    const joiner = await prisma.user.create({
      data: { email: `invite-joiner-${Date.now()}@example.com`, passwordHash: "x", name: "Joiner" },
    });
    joinerId = joiner.id;
    currentUser = joiner;

    let redirected: unknown;
    try {
      await InvitePage({ params: Promise.resolve({ token: project.inviteToken }) });
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toContain(`/projects/${project.slug}`);

    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: joiner.id, projectId: project.id } },
    });
    expect(membership?.role).toBe("MEMBER");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/invite/page.test.ts
```

Expected: FAIL — `Cannot find module '@/app/invite/[token]/page'` (the route doesn't exist yet).

- [ ] **Step 3: Implement the page**

Create `app/invite/[token]/page.tsx`:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { joinProjectByInviteToken } from "@/lib/projects/mutations";

function InvalidInvite() {
  return (
    <main className="container container--narrow">
      <div className="auth">
        <h1 className="auth__title">Invite link not found</h1>
        <p className="auth__alt">This invite link is invalid or has been revoked.</p>
        <p className="auth__alt">
          <Link href="/login">Log in</Link>
        </p>
      </div>
    </main>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const project = await prisma.project.findUnique({ where: { inviteToken: token } });
  if (!project) return <InvalidInvite />;

  const user = await getSessionUser();
  if (!user) redirect(`/signup?invite=${token}`);

  const result = await joinProjectByInviteToken(user.id, token);
  if (!result.ok) return <InvalidInvite />;

  redirect(`/projects/${result.slug}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/invite/page.test.ts
```

Expected: PASS, all three tests.

- [ ] **Step 5: Commit**

```bash
git add app/invite tests/invite
git commit -m "$(cat <<'EOF'
Add /invite/[token] accept-link route

Resolves the token, joins an already-logged-in visitor and sends them
to the board, or routes an anonymous visitor to signup with the token
attached. An unknown or since-regenerated token renders an inline
message instead of a raw 404.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Carry the invite token through signup

**Files:**
- Modify: `app/signup/page.tsx`
- Modify: `app/signup/SignupForm.tsx`
- Modify: `app/signup/actions.ts`
- Modify: `tests/signup/actions.test.ts`

**Interfaces:**
- Consumes: `joinProjectByInviteToken` (`@/lib/projects/mutations`, from Task 2).
- Produces: no new exports — `createAccount`'s signature is unchanged, only its redirect target and side effects change when `formData` has an `invite` field.

- [ ] **Step 1: Write the failing tests**

In `tests/signup/actions.test.ts`, replace the top of the file (imports through `afterAll`) with:

```ts
import { describe, it, expect, afterEach, afterAll, vi } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { createProject } from "@/lib/projects/mutations";
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, createSession: vi.fn().mockResolvedValue(undefined) };
});
import { createAccount } from "@/app/signup/actions";

let createdEmail: string | undefined;
let ownerId: string | undefined;
let projectId: string | undefined;

afterEach(async () => {
  if (createdEmail) await prisma.user.deleteMany({ where: { email: createdEmail } });
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  createdEmail = ownerId = projectId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

Then, inside the existing `describe("createAccount", ...)` block, add two more `it`s after the last one (`"rejects a duplicate email..."`):

```ts
  it("joins the invited project and redirects to its board when an invite token is present", async () => {
    const owner = await prisma.user.create({
      data: { email: `signup-invite-owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const project = await createProject(owner.id, "Signup Invite Project");
    projectId = project.id;
    const email = `signup-invite-${Date.now()}@example.com`;
    createdEmail = email;

    let redirected: unknown;
    try {
      await createAccount(
        { status: "idle" },
        formData({
          email,
          password: "password123",
          confirmPassword: "password123",
          name: "Ada",
          invite: project.inviteToken,
        }),
      );
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toContain(`/projects/${project.slug}`);

    const user = await prisma.user.findUnique({ where: { email } });
    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: user!.id, projectId: project.id } },
    });
    expect(membership?.role).toBe("MEMBER");
  });

  it("falls back to /projects when the invite token is invalid", async () => {
    const email = `signup-badinvite-${Date.now()}@example.com`;
    createdEmail = email;

    let redirected: unknown;
    try {
      await createAccount(
        { status: "idle" },
        formData({
          email,
          password: "password123",
          confirmPassword: "password123",
          name: "Ada",
          invite: "not-a-real-token",
        }),
      );
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toMatch(/;\/projects;/);
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npx vitest run tests/signup/actions.test.ts
```

Expected: the two new tests FAIL (the invite-project one redirects to `/projects` instead of `/projects/<slug>`, since `createAccount` doesn't read `invite` yet; the invalid-token one currently passes already, which is fine since the fallback behavior is what's already there — confirm it's the *first* new test that fails).

- [ ] **Step 3: Add the invite param to the page and form**

In `app/signup/page.tsx`, replace the whole file with:

```tsx
import Link from "next/link";

import { SignupForm } from "./SignupForm";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;

  return (
    <main className="container container--narrow">
      <div className="auth">
        <Link href="/" className="auth__brand">
          <span className="nav__mark" aria-hidden="true" />
          scrummy
        </Link>
        <h1 className="auth__title">Create an account</h1>
        <SignupForm invite={invite} />
        <p className="auth__alt">
          Already have an account? <Link href={invite ? `/login?invite=${invite}` : "/login"}>Log in</Link>
        </p>
      </div>
    </main>
  );
}
```

In `app/signup/SignupForm.tsx`, change the export signature and add the hidden field:

```tsx
export function SignupForm({ invite }: { invite?: string }) {
  const [state, formAction, pending] = useActionState(createAccount, initialState);

  return (
    <form action={formAction} className="form">
      {invite && <input type="hidden" name="invite" value={invite} />}
      <label className="field">
```

(keep everything else in the file the same — this only touches the function signature line and adds one line right after the opening `<form>` tag).

- [ ] **Step 4: Read the invite token in the action**

In `app/signup/actions.ts`, add the import:

```ts
import { joinProjectByInviteToken } from "@/lib/projects/mutations";
```

Then replace the tail of `createAccount` — everything from `await createSession(userId);` to the end:

```ts
  await createSession(userId);

  const invite = String(formData.get("invite") ?? "").trim();
  if (invite) {
    const joined = await joinProjectByInviteToken(userId, invite);
    if (joined.ok) redirect(`/projects/${joined.slug}`);
  }

  redirect("/projects");
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/signup/actions.test.ts
```

Expected: PASS, full file.

- [ ] **Step 6: Commit**

```bash
git add app/signup tests/signup/actions.test.ts
git commit -m "$(cat <<'EOF'
Carry invite token through signup

?invite=<token> on /signup rides through as a hidden field; on
success it joins that project and lands on its board instead of the
generic /projects. Missing or invalid tokens fall back to today's
behavior unchanged.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Carry the invite token through login

**Files:**
- Modify: `app/login/page.tsx`
- Modify: `app/login/LoginForm.tsx`
- Modify: `app/login/actions.ts`
- Modify: `tests/login/actions.test.ts`

**Interfaces:**
- Consumes: `joinProjectByInviteToken` (`@/lib/projects/mutations`, from Task 2).
- Produces: no new exports — `login`'s signature is unchanged, only its redirect target and side effects change when `formData` has an `invite` field.

- [ ] **Step 1: Write the failing tests**

In `tests/login/actions.test.ts`, replace the top of the file (imports through `afterAll`) with:

```ts
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";

import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/crypto/password";
import { createProject } from "@/lib/projects/mutations";
vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>("@/lib/auth/session");
  return { ...actual, createSession: vi.fn().mockResolvedValue(undefined) };
});
import { login } from "@/app/login/actions";

let userId: string | undefined;
let ownerId: string | undefined;
let projectId: string | undefined;
const email = `login-${Date.now()}@example.com`;

beforeEach(async () => {
  const passwordHash = await hashPassword("password123");
  const user = await prisma.user.create({ data: { email, passwordHash, name: "Ada" } });
  userId = user.id;
});

afterEach(async () => {
  if (userId) await prisma.user.deleteMany({ where: { id: userId } });
  if (projectId) await prisma.project.deleteMany({ where: { id: projectId } });
  if (ownerId) await prisma.user.deleteMany({ where: { id: ownerId } });
  userId = ownerId = projectId = undefined;
});

afterAll(async () => {
  await prisma.$disconnect();
});
```

Then, inside the existing `describe("login", ...)` block, add two more `it`s after `"rejects an unknown email..."`:

```ts
  it("joins the invited project and redirects to its board when an invite token is present", async () => {
    const owner = await prisma.user.create({
      data: { email: `login-invite-owner-${Date.now()}@example.com`, passwordHash: "x", name: "Owner" },
    });
    ownerId = owner.id;
    const project = await createProject(owner.id, "Login Invite Project");
    projectId = project.id;

    let redirected: unknown;
    try {
      await login({ status: "idle" }, formData({ email, password: "password123", invite: project.inviteToken }));
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toContain(`/projects/${project.slug}`);

    const membership = await prisma.projectMember.findUnique({
      where: { userId_projectId: { userId: userId!, projectId: project.id } },
    });
    expect(membership?.role).toBe("MEMBER");
  });

  it("falls back to /projects when the invite token is invalid", async () => {
    let redirected: unknown;
    try {
      await login({ status: "idle" }, formData({ email, password: "password123", invite: "not-a-real-token" }));
    } catch (err) {
      redirected = err;
    }
    expect((redirected as { digest?: string } | undefined)?.digest).toMatch(/;\/projects;/);
  });
```

- [ ] **Step 2: Run tests to verify the new invite-join test fails**

```bash
npx vitest run tests/login/actions.test.ts
```

Expected: the "joins the invited project..." test FAILS (redirects to `/projects` instead of the project board, since `login` doesn't read `invite` yet).

- [ ] **Step 3: Add the invite param to the page and form**

In `app/login/page.tsx`, replace the whole file with:

```tsx
import Link from "next/link";

import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; invite?: string }>;
}) {
  const { error, invite } = await searchParams;

  return (
    <main className="container container--narrow">
      <div className="auth">
        <Link href="/" className="auth__brand">
          <span className="nav__mark" aria-hidden="true" />
          scrummy
        </Link>
        <h1 className="auth__title">Log in</h1>
        <LoginForm invite={invite} />
        {error === "google" && <p className="form-error">Google sign-in failed. Please try again.</p>}
        {error === "google_email_taken" && (
          <p className="form-error">
            An account with that email already exists. Log in with your password.
          </p>
        )}
        <div className="divider">
          <span>or</span>
        </div>
        <a href="/api/auth/google" className="button button--secondary auth__google">
          Continue with Google
        </a>
        <p className="auth__alt">
          No account? <Link href={invite ? `/signup?invite=${invite}` : "/signup"}>Create one</Link>
        </p>
      </div>
    </main>
  );
}
```

In `app/login/LoginForm.tsx`, change the export signature and add the hidden field:

```tsx
export function LoginForm({ invite }: { invite?: string }) {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="form">
      {invite && <input type="hidden" name="invite" value={invite} />}
      <label className="field">
```

(keep everything else in the file the same).

- [ ] **Step 4: Read the invite token in the action**

In `app/login/actions.ts`, add the import:

```ts
import { joinProjectByInviteToken } from "@/lib/projects/mutations";
```

Then replace the tail of `login` — everything from `await createSession(user.id);` to the closing brace of the function:

```ts
  await createSession(user.id);

  const invite = String(formData.get("invite") ?? "").trim();
  if (invite) {
    const joined = await joinProjectByInviteToken(user.id, invite);
    if (joined.ok) redirect(`/projects/${joined.slug}`);
  }

  redirect("/projects");
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/login/actions.test.ts
```

Expected: PASS, full file.

- [ ] **Step 6: Commit**

```bash
git add app/login tests/login/actions.test.ts
git commit -m "$(cat <<'EOF'
Carry invite token through login

Mirrors the signup flow: ?invite=<token> on /login rides through as a
hidden field and joins that project on success.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Invite link UI on the Members page

**Files:**
- Modify: `app/projects/[slug]/members/actions.ts`
- Create: `app/projects/[slug]/members/InviteLinkCard.tsx`
- Modify: `app/projects/[slug]/members/page.tsx`
- Modify: `.env.test.example`
- Modify: `.env.test` (local, gitignored — not committed)
- Modify: `tests/projects/members.test.ts`

**Interfaces:**
- Consumes: `regenerateInviteToken` (`@/lib/projects/mutations`, from Task 2), `appOrigin` (`@/lib/auth/google`).
- Produces: `regenerateInviteTokenAction(slug: string): Promise<{ ok: true; url: string } | { ok: false; message: string }>`.

- [ ] **Step 1: Add `APP_URL` to the test environment**

`appOrigin()` (used to build the full invite URL) throws if `APP_URL` isn't set, and it isn't currently in the test env.

In `.env.test.example`, append:

```
APP_URL="http://localhost:3000"
```

In your local `.env.test` (not committed — gitignored, same as `.env.local`), add the same line so the test suite can run:

```
APP_URL="http://localhost:3000"
```

- [ ] **Step 2: Write the failing test**

In `tests/projects/members.test.ts`, in the `it("lists current members for the owner", ...)` test, add these two assertions right after the existing `expect(html).toContain("Member");` line:

```ts
    expect(html).toContain("Invite link");
    expect(html).toContain(`/invite/${project.inviteToken}`);
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run tests/projects/members.test.ts
```

Expected: FAIL — the rendered HTML doesn't contain "Invite link" yet.

- [ ] **Step 4: Add the server action**

In `app/projects/[slug]/members/actions.ts`, add to the imports:

```ts
import { appOrigin } from "@/lib/auth/google";
import { addProjectMemberByEmail, regenerateInviteToken, removeProjectMember } from "@/lib/projects/mutations";
```

(this replaces the existing `import { addProjectMemberByEmail, removeProjectMember } from "@/lib/projects/mutations";` line — just adds `regenerateInviteToken` to it, plus the new `appOrigin` import above it).

Then add this function anywhere after `addMemberAction`:

```ts
export async function regenerateInviteTokenAction(
  slug: string,
): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  const user = await requireUser();
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return { ok: false, message: "Project not found." };

  const result = await regenerateInviteToken(user.id, project.id);
  if (!result.ok) return result;

  revalidatePath(`/projects/${slug}/members`);
  return { ok: true, url: `${appOrigin()}/invite/${result.token}` };
}
```

- [ ] **Step 5: Create the client component**

Create `app/projects/[slug]/members/InviteLinkCard.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";

import { toast } from "@/app/_components/toast";

import { regenerateInviteTokenAction } from "./actions";

export function InviteLinkCard({ slug, url }: { slug: string; url: string }) {
  const [link, setLink] = useState(url);
  const [pending, start] = useTransition();

  function copy() {
    navigator.clipboard.writeText(link);
    toast.success("Invite link copied");
  }

  function regenerate() {
    if (!confirm("Generate a new invite link? The old one will stop working.")) return;
    start(async () => {
      const res = await regenerateInviteTokenAction(slug);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setLink(res.url);
      toast.success("New invite link created");
    });
  }

  return (
    <section className="stack">
      <h2>Invite link</h2>
      <p>Anyone with this link can join the project.</p>
      <div className="controls">
        <input
          type="text"
          readOnly
          value={link}
          className="input"
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className="button button--secondary" onClick={copy}>
          Copy
        </button>
        <button type="button" className="button button--secondary" disabled={pending} onClick={regenerate}>
          {pending ? "Generating…" : "Generate new link"}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 6: Wire it into the Members page**

In `app/projects/[slug]/members/page.tsx`, add the import:

```ts
import { appOrigin } from "@/lib/auth/google";

import { AddMemberForm } from "./AddMemberForm";
import { InviteLinkCard } from "./InviteLinkCard";
import { RemoveMemberButton } from "./RemoveMemberButton";
```

(this replaces the existing two-line import block for `AddMemberForm` and `RemoveMemberButton`, inserting `InviteLinkCard` between them alphabetically, plus the new `appOrigin` import above).

Then insert the new section right before `<section className="stack"><h2>Add a member</h2>`:

```tsx
          <InviteLinkCard slug={slug} url={`${appOrigin()}/invite/${project.inviteToken}`} />

          <section className="stack">
            <h2>Add a member</h2>
            <AddMemberForm slug={slug} />
          </section>
```

- [ ] **Step 7: Run test to verify it passes**

```bash
npx vitest run tests/projects/members.test.ts
```

Expected: PASS, both tests.

- [ ] **Step 8: Run the full suite**

```bash
npx vitest run
```

Expected: PASS, everything (this is the last task — a full green run confirms nothing upstream regressed).

- [ ] **Step 9: Typecheck and lint**

```bash
npx tsc --noEmit
npx eslint app/invite app/signup app/login "app/projects/[slug]/members" lib/projects/mutations.ts
```

Expected: no errors from either command.

- [ ] **Step 10: Commit**

```bash
git add app/projects/\[slug\]/members .env.test.example
git commit -m "$(cat <<'EOF'
Add invite link UI to the Members page

Owner-only card above the existing email-add form: shows the full
invite URL with Copy and Generate-new-link actions. Adds APP_URL to
the test environment, which appOrigin() requires.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

(the local `.env.test` change is intentionally not staged — it's gitignored, machine-specific).

---

## Manual verification (after all tasks)

The automated tests cover the logic; a couple of things are easiest to eyeball in a browser once the whole plan is done:

1. Start the dev server against a properly migrated DB, open a project's Members page as its owner, confirm the "Invite link" card renders with a real URL, and that Copy / Generate new link both work (toast appears, input value changes on regenerate).
2. Open the invite URL in a private/incognito window (simulating a new visitor): confirm it lands on `/signup?invite=...`, and that completing signup drops you straight onto the project board as a member.
3. Regenerate the link, then open the *old* URL: confirm it now shows "Invite link not found" instead of joining.

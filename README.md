# scrummy

A task board that remembers every change. Move a card, reassign an owner or leave a comment, and the task keeps a timeline of who did what and when — for teams where not everyone is a developer.

**Live demo:** [scrummy-one.vercel.app](https://scrummy-one.vercel.app) → **Try the demo — no sign-up**. Each visitor gets a private board with a teammate and some history, built through the same code paths as real use.

## What it does

- **Board** with To do / In progress / Done, drag-and-drop ordering and filters.
- **Per-task timeline**: every status change, reassignment, priority, due date, label edit and comment is a `TaskEvent`, so a task's history is its own audit log.
- **Teams**: invite links (regenerable), owner/member roles, subtasks, comments you can edit or delete.
- **Offline-first PWA** (Serwist): edits made offline go into an outbox and replay on reconnect; conflicting edits resolve last-writer-wins by client timestamp, and the losing edit still shows in the timeline.
- **Auth written by hand**: scrypt password hashes, hashed session tokens in an httpOnly cookie, Google sign-in, per-IP rate limits, and one error message for every failed login so emails can't be probed.

## Stack

Next.js 16 (App Router, server actions) · Prisma 7 · PostgreSQL (Neon) · Serwist · dnd-kit · Vitest

## Run it locally

```bash
cp .env.example .env.local    # DATABASE_URL and APP_URL; Google keys only for Google sign-in
npm install
npx prisma migrate deploy
npm run dev
```

## Tests

The suite runs against a real Postgres. Point `.env.test` at a **throwaway** database (see `.env.test.example`), then:

```bash
npm test
```

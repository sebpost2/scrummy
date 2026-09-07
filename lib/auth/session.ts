import { randomBytes, createHash } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User, PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export const SESSION_COOKIE = "scrummy_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Only the hash is ever stored — the raw token lives solely in the httpOnly
// cookie, so a database read can't be replayed as a valid session.
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueSessionToken(
  db: PrismaClient,
  userId: string,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({ data: { userId, tokenHash: hashSessionToken(token), expiresAt } });
  return { token, expiresAt };
}

// SyncedMutation rows only exist to dedup replays of the same offline mutation.
// An offline client that comes back after this long has bigger problems, and
// keeping the row forever just grows the table without bound.
const SYNCED_MUTATION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function createSession(userId: string): Promise<void> {
  const { token } = await issueSessionToken(prisma, userId);

  // Opportunistic GC — cheap at this scale, keeps Session/SyncedMutation from
  // growing without bound. Best-effort: a failure here must not fail login.
  // ponytail: move to a scheduled job if login latency ever bites.
  const now = Date.now();
  void prisma.session.deleteMany({ where: { expiresAt: { lt: new Date(now) } } }).catch(() => {});
  void prisma.syncedMutation
    .deleteMany({ where: { appliedAt: { lt: new Date(now - SYNCED_MUTATION_TTL_MS) } } })
    .catch(() => {});

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
  store.delete(SESSION_COOKIE);
}

export async function getSessionUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  return session.user;
}

export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/crypto/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { allow } from "@/lib/auth/rateLimit";
import { joinProjectByInviteToken } from "@/lib/projects/mutations";
import { createDemoWorkspace } from "@/lib/demo/workspace";

export type LoginState = { status: "idle" } | { status: "error"; message: string };

// One message for every failure — a distinct message would let anyone probe
// which emails have accounts.
const GENERIC_ERROR = "Incorrect email or password.";
const THROTTLED_ERROR = "Too many attempts. Wait a minute and try again.";

// Same shape as a real hashPassword() output so verifyPassword() always runs
// one real scrypt computation, whether or not the account exists — without
// this, a nonexistent email returns instantly while a real one takes the
// scrypt delay, leaking which emails have accounts via response timing.
const DUMMY_HASH = `${"0".repeat(32)}.${"0".repeat(128)}`;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!(await allow("login", 8, 60_000, email))) {
    return { status: "error", message: THROTTLED_ERROR };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const passwordOk = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) {
    return { status: "error", message: GENERIC_ERROR };
  }

  await createSession(user.id);

  const invite = String(formData.get("invite") ?? "").trim();
  if (invite) {
    const joined = await joinProjectByInviteToken(user.id, invite);
    if (joined.ok) redirect(`/projects/${joined.slug}`);
  }

  redirect("/projects");
}

/** "Try the demo": a throwaway account with a seeded board, logged in, no sign-up. */
export async function startDemo(): Promise<void> {
  // Each click writes a few rows, so cap it per IP.
  if (!(await allow("demo", 5, 60_000))) redirect("/login?error=demo_throttled");

  const { userId, slug } = await createDemoWorkspace();
  await createSession(userId);
  redirect(`/projects/${slug}`);
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { verifyPassword } from "@/lib/crypto/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { joinProjectByInviteToken } from "@/lib/projects/mutations";

export type LoginState = { status: "idle" } | { status: "error"; message: string };

// One message for every failure — a distinct message would let anyone probe
// which emails have accounts.
const GENERIC_ERROR = "Incorrect email or password.";

// Same shape as a real hashPassword() output so verifyPassword() always runs
// one real scrypt computation, whether or not the account exists — without
// this, a nonexistent email returns instantly while a real one takes the
// scrypt delay, leaking which emails have accounts via response timing.
const DUMMY_HASH = `${"0".repeat(32)}.${"0".repeat(128)}`;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

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

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}

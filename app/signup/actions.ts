"use server";

import { redirect } from "next/navigation";

import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/crypto/password";
import { createSession } from "@/lib/auth/session";
import { joinProjectByInviteToken } from "@/lib/projects/mutations";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// One generic message for every failure — a distinct "this email is taken"
// message would let anyone probe arbitrary addresses to learn who has an account.
const GENERIC_ERROR = "Couldn't create the account. Check the email and that the password is at least 8 characters.";

export type SignupState = { status: "idle" } | { status: "error"; message: string };

export async function createAccount(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");
  const name = String(formData.get("name") ?? "").trim();

  if (!EMAIL_RE.test(email) || password.length < 8 || password !== confirmPassword || !name) {
    return { status: "error", message: GENERIC_ERROR };
  }

  const passwordHash = await hashPassword(password);

  let userId: string;
  try {
    const user = await prisma.user.create({ data: { email, passwordHash, name } });
    userId = user.id;
  } catch {
    return { status: "error", message: GENERIC_ERROR };
  }

  await createSession(userId);

  const invite = String(formData.get("invite") ?? "").trim();
  if (invite) {
    const joined = await joinProjectByInviteToken(userId, invite);
    if (joined.ok) redirect(`/projects/${joined.slug}`);
  }

  redirect("/projects");
}

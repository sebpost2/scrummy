import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { createSession } from "@/lib/auth/session";
import { CALLBACK_PATH, OAUTH_STATE_COOKIE, appOrigin, exchangeGoogleCode } from "@/lib/auth/google";
import { prisma } from "@/lib/db/prisma";

export async function GET(req: Request) {
  const origin = appOrigin();
  const store = await cookies();

  const params = new URL(req.url).searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const expectedState = store.get(OAUTH_STATE_COOKIE)?.value;
  store.delete(OAUTH_STATE_COOKIE);

  const failed = NextResponse.redirect(`${origin}/login?error=google`);

  if (!code || !state || !expectedState || state !== expectedState) return failed;

  try {
    const identity = await exchangeGoogleCode(code, `${origin}${CALLBACK_PATH}`);
    if (!identity.emailVerified) return failed;

    // Match on googleId only. An existing account with the same email is NOT
    // trusted for auto-linking — local signup never verifies email, so it could
    // have been pre-registered by an attacker to hijack the Google login.
    let user = await prisma.user.findUnique({ where: { googleId: identity.sub } });
    if (!user) {
      const emailTaken = await prisma.user.findUnique({ where: { email: identity.email } });
      if (emailTaken) return NextResponse.redirect(`${origin}/login?error=google_email_taken`);
      user = await prisma.user.create({
        data: { email: identity.email, name: identity.name, googleId: identity.sub },
      });
    }

    await createSession(user.id);
  } catch (err) {
    console.error("google oauth callback failed", err);
    return failed;
  }

  return NextResponse.redirect(`${origin}/projects`);
}

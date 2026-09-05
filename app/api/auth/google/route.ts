import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { CALLBACK_PATH, OAUTH_STATE_COOKIE, appOrigin, googleAuthUrl } from "@/lib/auth/google";

export async function GET() {
  const state = randomBytes(16).toString("hex");

  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(googleAuthUrl(`${appOrigin()}${CALLBACK_PATH}`, state));
}

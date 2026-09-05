const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export const OAUTH_STATE_COOKIE = "google_oauth_state";
export const CALLBACK_PATH = "/api/auth/google/callback";

export type GoogleIdentity = {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
};

function env(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`missing env ${key}`);
  return value;
}

// Canonical origin from server config only — never from request headers, which
// a client can spoof to poison the OAuth redirect_uri or the post-login redirect.
export function appOrigin(): string {
  return env("APP_URL").replace(/\/+$/, "");
}

export function googleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: env("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${GOOGLE_AUTH_ENDPOINT}?${params}`;
}

export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleIdentity> {
  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env("GOOGLE_CLIENT_ID"),
      client_secret: env("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`google token exchange failed: ${res.status}`);
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("google token response missing id_token");
  return parseIdToken(data.id_token);
}

// The id_token arrives straight from Google's token endpoint over TLS in a
// server-to-server call, so its payload is trusted without a signature check
// (Google's OpenID Connect docs permit skipping validation in this case).
export function parseIdToken(idToken: string): GoogleIdentity {
  const segment = idToken.split(".")[1];
  if (!segment) throw new Error("malformed id_token");
  const claims = JSON.parse(Buffer.from(segment, "base64url").toString()) as Record<string, unknown>;
  const sub = String(claims.sub ?? "");
  const email = String(claims.email ?? "").trim().toLowerCase();
  if (!sub || !email) throw new Error("id_token missing sub or email");
  return {
    sub,
    email,
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: String(claims.name ?? "").trim() || email,
  };
}

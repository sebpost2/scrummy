import { describe, it, expect } from "vitest";

import { parseIdToken } from "@/lib/auth/google";

function idToken(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(claims)}.signature`;
}

describe("parseIdToken", () => {
  it("extracts sub, lowercased email, name and verified flag", () => {
    const identity = parseIdToken(
      idToken({ sub: "10783", email: "Ada@Gmail.com", email_verified: true, name: "Ada Lovelace" }),
    );
    expect(identity).toEqual({
      sub: "10783",
      email: "ada@gmail.com",
      emailVerified: true,
      name: "Ada Lovelace",
    });
  });

  it("falls back to email when name claim is absent", () => {
    expect(parseIdToken(idToken({ sub: "1", email: "x@y.com", email_verified: "true" })).name).toBe(
      "x@y.com",
    );
  });

  it("treats a missing email_verified claim as not verified", () => {
    expect(parseIdToken(idToken({ sub: "1", email: "x@y.com" })).emailVerified).toBe(false);
  });

  it("rejects a token missing sub or email", () => {
    expect(() => parseIdToken(idToken({ email: "x@y.com" }))).toThrow();
    expect(() => parseIdToken("not-a-jwt")).toThrow();
  });
});

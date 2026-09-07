import { describe, it, expect } from "vitest";

import { hit } from "@/lib/auth/rateLimit";

describe("hit — fixed-window rate limiter", () => {
  it("allows up to the limit, then blocks within the window", () => {
    const key = `t-${Math.random()}`;
    expect(hit(key, 3, 1000, 0)).toBe(true);
    expect(hit(key, 3, 1000, 0)).toBe(true);
    expect(hit(key, 3, 1000, 0)).toBe(true);
    expect(hit(key, 3, 1000, 0)).toBe(false);
  });

  it("resets once the window elapses", () => {
    const key = `t-${Math.random()}`;
    expect(hit(key, 1, 1000, 0)).toBe(true);
    expect(hit(key, 1, 1000, 500)).toBe(false);
    expect(hit(key, 1, 1000, 1000)).toBe(true);
  });
});

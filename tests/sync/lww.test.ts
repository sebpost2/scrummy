import { describe, it, expect } from "vitest";

import { isNewer } from "@/lib/sync/lww";

describe("isNewer", () => {
  it("is true when there's no current value yet", () => {
    expect(isNewer(new Date("2026-01-01T00:00:00Z"), null)).toBe(true);
  });

  it("is true when incoming is strictly after current", () => {
    expect(isNewer(new Date("2026-01-02T00:00:00Z"), new Date("2026-01-01T00:00:00Z"))).toBe(true);
  });

  it("is false when incoming is strictly before current", () => {
    expect(isNewer(new Date("2026-01-01T00:00:00Z"), new Date("2026-01-02T00:00:00Z"))).toBe(false);
  });

  it("is false on an exact tie (keeps whatever was already applied)", () => {
    const t = new Date("2026-01-01T00:00:00Z");
    expect(isNewer(t, t)).toBe(false);
  });
});

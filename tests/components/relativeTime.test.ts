import { describe, it, expect } from "vitest";

import { formatRelative } from "@/app/_components/RelativeTime";

const now = new Date("2026-09-05T12:00:00Z");

describe("formatRelative", () => {
  it("returns 'just now' under 45 seconds", () => {
    expect(formatRelative(new Date("2026-09-05T11:59:30Z"), now)).toBe("just now");
  });
  it("uses minutes under an hour", () => {
    expect(formatRelative(new Date("2026-09-05T11:40:00Z"), now)).toBe("20m ago");
  });
  it("uses hours under a day", () => {
    expect(formatRelative(new Date("2026-09-05T09:00:00Z"), now)).toBe("3h ago");
  });
  it("uses days under a week", () => {
    expect(formatRelative(new Date("2026-09-03T12:00:00Z"), now)).toBe("2d ago");
  });
  it("handles future dates", () => {
    expect(formatRelative(new Date("2026-09-07T12:00:00Z"), now)).toBe("in 2d");
  });
  it("falls back to a calendar date past a week", () => {
    expect(formatRelative(new Date("2026-07-01T12:00:00Z"), now)).toMatch(/Jul 1/);
  });
});

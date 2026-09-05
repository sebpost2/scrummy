import { describe, it, expect } from "vitest";

import { initials } from "@/app/_components/Avatar";

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
  });
  it("uppercases", () => {
    expect(initials("grace hopper")).toBe("GH");
  });
  it("handles a single name", () => {
    expect(initials("Cher")).toBe("C");
  });
  it("falls back to ? for empty input", () => {
    expect(initials("   ")).toBe("?");
  });
});

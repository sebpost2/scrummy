// @vitest-environment jsdom
import { describe, it, expect } from "vitest";

import { detectInstallState } from "@/app/_components/InstallPrompt";

describe("detectInstallState", () => {
  it("flags iOS from the user agent", () => {
    expect(detectInstallState("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", false)).toEqual({
      isIOS: true,
      isStandalone: false,
    });
  });

  it("does not flag desktop Chrome as iOS", () => {
    expect(detectInstallState("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0", false)).toEqual({
      isIOS: false,
      isStandalone: false,
    });
  });

  it("reports standalone when already installed", () => {
    expect(detectInstallState("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", true)).toEqual({
      isIOS: true,
      isStandalone: true,
    });
  });
});

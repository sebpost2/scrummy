import path from "path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    env: { TZ: "UTC" },
    setupFiles: ["./tests/setup.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 15000,
  },
});

import fs from "node:fs";

import dotenv from "dotenv";
import { vi } from "vitest";

// The suite runs against a REAL Postgres and creates/deletes rows on every
// run. It must NEVER be the dev or production database — point .env.test at
// a throwaway DB. In CI, DATABASE_URL is set by the workflow, so a missing
// .env.test file is fine there.
if (!process.env.DATABASE_URL) {
  if (!fs.existsSync(".env.test")) {
    throw new Error(
      "tests/setup.ts: no DATABASE_URL and no .env.test. Copy .env.test.example to " +
        ".env.test and point DATABASE_URL at a throwaway DB. Never run the suite against " +
        "the dev or production database.",
    );
  }
  dotenv.config({ path: ".env.test" });
  if (!process.env.DATABASE_URL) {
    throw new Error("tests/setup.ts: .env.test has no DATABASE_URL.");
  }
}

// Server actions call revalidatePath, which requires Next's request-scoped
// store. Tests invoke server actions directly (no real request), so this
// throws an "Invariant: static generation store missing" error unless
// stubbed as a no-op here.
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
}));

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

// Page components are invoked directly (no real request/router), and are
// rendered with plain renderToStaticMarkup, so next/navigation APIs that
// need request-scoped context throw or behave differently than in a real
// app: useRouter needs an AppRouterContext (invariant otherwise), and the
// installed Next version unified notFound()'s digest into
// "NEXT_HTTP_ERROR_FALLBACK;404" instead of the older "NEXT_NOT_FOUND".
// redirect() is left as the real implementation — it already works as-is.
vi.mock("next/navigation", async () => {
  const actual = await vi.importActual<typeof import("next/navigation")>("next/navigation");
  return {
    ...actual,
    notFound: () => {
      const error = new Error("NEXT_NOT_FOUND");
      (error as unknown as { digest: string }).digest = "NEXT_NOT_FOUND";
      throw error;
    },
    useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
    useSearchParams: () => new URLSearchParams(),
  };
});

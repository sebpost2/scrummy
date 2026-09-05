import fs from "node:fs";

import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

// Default to the throwaway test DB when .env.test exists, so `prisma migrate
// dev` / `prisma migrate reset` can't wipe production by accident. To run a
// migration against production deliberately:
//   $env:PRISMA_TARGET="prod"; npx prisma migrate deploy
const envPath =
  process.env.PRISMA_TARGET !== "prod" && fs.existsSync(".env.test") ? ".env.test" : ".env.local";
dotenv.config({ path: envPath });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});

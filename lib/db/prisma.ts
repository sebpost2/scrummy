import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

// Constructed once per server instance and reused across invocations — a new
// Pool/PrismaClient per request leaks Postgres connections under concurrent
// or retried requests.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX ?? 10),
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 10_000,
});
pool.on("error", (err) => console.error("pg pool idle client error", err));
const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({ adapter });

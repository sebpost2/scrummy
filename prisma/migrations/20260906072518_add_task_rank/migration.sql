-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "rank" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Backfill: preserve existing per-board order by seeding rank from creation time.
UPDATE "Task" SET "rank" = EXTRACT(EPOCH FROM "createdAt");

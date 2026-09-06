-- AlterTable: add nullable, backfill from createdAt, then enforce NOT NULL
ALTER TABLE "TaskEvent" ADD COLUMN "clientTimestamp" TIMESTAMP(3);
UPDATE "TaskEvent" SET "clientTimestamp" = "createdAt" WHERE "clientTimestamp" IS NULL;
ALTER TABLE "TaskEvent" ALTER COLUMN "clientTimestamp" SET NOT NULL;

CREATE INDEX "TaskEvent_taskId_type_clientTimestamp_idx" ON "TaskEvent"("taskId", "type", "clientTimestamp");

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "rankUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SyncedMutation" (
    "id" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyncedMutation_pkey" PRIMARY KEY ("id")
);

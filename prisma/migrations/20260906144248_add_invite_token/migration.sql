-- AlterTable
ALTER TABLE "Project" ADD COLUMN "inviteToken" TEXT;

-- Backfill existing rows with a random 32-char token
UPDATE "Project" SET "inviteToken" = md5(id || clock_timestamp()::text || random()::text) WHERE "inviteToken" IS NULL;

-- Enforce NOT NULL now that every row has a value
ALTER TABLE "Project" ALTER COLUMN "inviteToken" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Project_inviteToken_key" ON "Project"("inviteToken");

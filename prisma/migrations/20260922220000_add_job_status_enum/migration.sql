-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('pending', 'processing', 'succeeded', 'failed', 'dead');

-- AlterTable
-- Drop the text default so the column can be safely cast, then re-add it for the enum.
ALTER TABLE "Job" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Job" ALTER COLUMN "status" TYPE "JobStatus" USING ("status"::"JobStatus");
ALTER TABLE "Job" ALTER COLUMN "status" SET DEFAULT 'pending';
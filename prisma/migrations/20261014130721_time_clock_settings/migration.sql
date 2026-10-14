-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "timeRules" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "siteAddress" TEXT,
ADD COLUMN     "siteFrom" TEXT,
ADD COLUMN     "siteLat" DOUBLE PRECISION,
ADD COLUMN     "siteLng" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "longShiftSentAt" TIMESTAMP(3);


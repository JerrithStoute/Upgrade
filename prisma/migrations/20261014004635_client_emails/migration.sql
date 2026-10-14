-- AlterTable
ALTER TABLE "ChangeOrder" ADD COLUMN     "sentById" TEXT;

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "decidedAt" TIMESTAMP(3),
ADD COLUMN     "decisionNote" TEXT,
ADD COLUMN     "sentById" TEXT,
ADD COLUMN     "signedBy" TEXT;

-- AlterTable
ALTER TABLE "Selection" ADD COLUMN     "clientReminded" INTEGER;


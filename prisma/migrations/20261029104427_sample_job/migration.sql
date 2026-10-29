-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "CostCode" ADD COLUMN     "fromSample" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "isSample" BOOLEAN NOT NULL DEFAULT false;


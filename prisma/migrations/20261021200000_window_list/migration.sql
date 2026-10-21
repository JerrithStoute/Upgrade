-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "windowDetails" TEXT;

-- AlterTable
ALTER TABLE "MaterialItem" ADD COLUMN     "black" BOOLEAN,
ADD COLUMN     "details" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "windowList" TEXT;

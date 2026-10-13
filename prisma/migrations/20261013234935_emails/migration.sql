-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "sentById" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "morningEmail" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "morningEmailOn" TEXT;

-- AlterTable
ALTER TABLE "VendorInsurance" ADD COLUMN     "reminded" INTEGER;


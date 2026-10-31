-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "paperworkVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "address" TEXT,
ADD COLUMN     "licenseNumber" TEXT,
ADD COLUMN     "taxId" TEXT;

-- AlterTable
ALTER TABLE "VendorDoc" ADD COLUMN     "carrier" TEXT,
ADD COLUMN     "number" TEXT;


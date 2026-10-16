-- AlterTable
ALTER TABLE "CostCode" ADD COLUMN     "priceRecheckEvery" INTEGER,
ADD COLUMN     "priceRecheckUnit" TEXT;

-- AlterTable
ALTER TABLE "MaterialItem" ADD COLUMN     "priceCheckedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Items already on the list: their price was last looked at, at best, when the item was last saved.
UPDATE "MaterialItem" SET "priceCheckedAt" = "updatedAt";

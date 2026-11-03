-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "invoiceDrawCodeId" TEXT,
ADD COLUMN     "invoiceCoCodeId" TEXT;

-- AlterTable
ALTER TABLE "InvoiceItem" ADD COLUMN     "costCodeId" TEXT;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

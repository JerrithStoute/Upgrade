-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "paymentInstructions" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "showSummary" BOOLEAN NOT NULL DEFAULT true;


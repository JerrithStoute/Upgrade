-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "qbPending" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "QbConnection" ADD COLUMN     "invoiceItemId" TEXT;


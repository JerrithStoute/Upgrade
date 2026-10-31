-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "notifyRules" TEXT,
ADD COLUMN     "paperworkOwner" TEXT,
ADD COLUMN     "paperworkReady" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "paperwork" TEXT;

-- CreateTable
CREATE TABLE "PaperworkType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "name" TEXT NOT NULL,
    "kind" TEXT,
    "expires" BOOLEAN NOT NULL DEFAULT false,
    "usual" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaperworkType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorDoc" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "vendorId" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "confirmed" BOOLEAN NOT NULL DEFAULT true,
    "fileName" TEXT,
    "storagePath" TEXT,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VendorDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaperworkType_companyId_idx" ON "PaperworkType"("companyId");

-- CreateIndex
CREATE INDEX "VendorDoc_companyId_idx" ON "VendorDoc"("companyId");

-- CreateIndex
CREATE INDEX "VendorDoc_vendorId_idx" ON "VendorDoc"("vendorId");

-- AddForeignKey
ALTER TABLE "VendorDoc" ADD CONSTRAINT "VendorDoc_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorDoc" ADD CONSTRAINT "VendorDoc_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "PaperworkType"("id") ON DELETE CASCADE ON UPDATE CASCADE;


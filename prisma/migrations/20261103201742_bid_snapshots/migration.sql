-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "escalationFrom" TEXT NOT NULL DEFAULT 'SENT',
ADD COLUMN     "escalationPct" DOUBLE PRECISION NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "Estimate" ADD COLUMN     "heldFrom" INTEGER,
ADD COLUMN     "heldPrices" TEXT;

-- CreateTable
CREATE TABLE "PriceSnapshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "estimateId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lines" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "fileId" TEXT,

    CONSTRAINT "PriceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceSnapshot_companyId_idx" ON "PriceSnapshot"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSnapshot_estimateId_kind_key" ON "PriceSnapshot"("estimateId", "kind");

-- AddForeignKey
ALTER TABLE "PriceSnapshot" ADD CONSTRAINT "PriceSnapshot_estimateId_fkey" FOREIGN KEY ("estimateId") REFERENCES "Estimate"("id") ON DELETE CASCADE ON UPDATE CASCADE;


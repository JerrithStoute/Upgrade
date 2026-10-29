-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "warrantyMonths" INTEGER NOT NULL DEFAULT 12;

-- AlterTable
ALTER TABLE "FileAsset" ADD COLUMN     "warrantyRequestId" TEXT;

-- CreateTable
CREATE TABLE "WarrantyRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "number" INTEGER NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "vendorId" TEXT,
    "assigneeId" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closeNote" TEXT,
    "fromClient" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyNote" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "requestId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "teamOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WarrantyNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WarrantyRequest_companyId_idx" ON "WarrantyRequest"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyRequest_companyId_number_key" ON "WarrantyRequest"("companyId", "number");

-- CreateIndex
CREATE INDEX "WarrantyNote_companyId_idx" ON "WarrantyNote"("companyId");

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_warrantyRequestId_fkey" FOREIGN KEY ("warrantyRequestId") REFERENCES "WarrantyRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyRequest" ADD CONSTRAINT "WarrantyRequest_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyRequest" ADD CONSTRAINT "WarrantyRequest_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyRequest" ADD CONSTRAINT "WarrantyRequest_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyRequest" ADD CONSTRAINT "WarrantyRequest_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyNote" ADD CONSTRAINT "WarrantyNote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "WarrantyRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyNote" ADD CONSTRAINT "WarrantyNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


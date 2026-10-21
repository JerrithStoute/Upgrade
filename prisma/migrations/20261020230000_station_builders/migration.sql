-- AlterTable
ALTER TABLE "StationLog" ADD COLUMN     "builderId" TEXT;

-- CreateTable
CREATE TABLE "StationBuilder" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "trialEndsAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StationBuilder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StationBuilder_companyId_key" ON "StationBuilder"("companyId");

-- CreateIndex
CREATE INDEX "StationLog_builderId_idx" ON "StationLog"("builderId");

-- AddForeignKey
ALTER TABLE "StationBuilder" ADD CONSTRAINT "StationBuilder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

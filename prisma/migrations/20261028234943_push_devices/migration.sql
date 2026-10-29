-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pushOff" TEXT;

-- CreateTable
CREATE TABLE "PushDevice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3),

    CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PushDevice_companyId_idx" ON "PushDevice"("companyId");

-- CreateIndex
CREATE INDEX "PushDevice_userId_idx" ON "PushDevice"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushDevice_companyId_endpoint_key" ON "PushDevice"("companyId", "endpoint");

-- AddForeignKey
ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


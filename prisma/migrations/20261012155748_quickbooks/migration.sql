-- AlterTable
ALTER TABLE "CostCode" ADD COLUMN     "qbListId" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "qbListId" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "qbListId" TEXT;

-- CreateTable
CREATE TABLE "QbConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "companyFile" TEXT,
    "qbCompany" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "ticket" TEXT,
    "ticketState" TEXT,
    "ticketAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QbConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QbListItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "kind" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "parentListId" TEXT,
    "sublevel" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "detail" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QbListItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QbConnection_companyId_key" ON "QbConnection"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "QbConnection_username_key" ON "QbConnection"("username");

-- CreateIndex
CREATE UNIQUE INDEX "QbConnection_ticket_key" ON "QbConnection"("ticket");

-- CreateIndex
CREATE INDEX "QbListItem_companyId_idx" ON "QbListItem"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "QbListItem_companyId_kind_listId_key" ON "QbListItem"("companyId", "kind", "listId");

-- CreateIndex
CREATE UNIQUE INDEX "CostCode_companyId_qbListId_key" ON "CostCode"("companyId", "qbListId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_companyId_qbListId_key" ON "Vendor"("companyId", "qbListId");


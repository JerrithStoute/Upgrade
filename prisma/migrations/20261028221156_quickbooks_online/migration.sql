-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "qbError" TEXT,
ADD COLUMN     "qbSentAt" TIMESTAMP(3),
ADD COLUMN     "qbSyncToken" TEXT,
ADD COLUMN     "qbTxnId" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "qbTxnId" TEXT;

-- AlterTable
ALTER TABLE "VendorBill" ADD COLUMN     "qbTxnId" TEXT;

-- CreateTable
CREATE TABLE "QboConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "realmId" TEXT NOT NULL,
    "qbCompany" TEXT,
    "accessToken" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3),
    "connectedById" TEXT,
    "invoiceItemId" TEXT,
    "changesSince" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastSummary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QboConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QbTxn" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "kind" TEXT NOT NULL,
    "txnId" TEXT NOT NULL,
    "txnDate" TIMESTAMP(3) NOT NULL,
    "data" TEXT NOT NULL,
    "appliedKey" TEXT,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QbTxn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QboConnection_companyId_key" ON "QboConnection"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "QboConnection_realmId_key" ON "QboConnection"("realmId");

-- CreateIndex
CREATE INDEX "QbTxn_companyId_idx" ON "QbTxn"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "QbTxn_companyId_kind_txnId_key" ON "QbTxn"("companyId", "kind", "txnId");

-- CreateIndex
CREATE INDEX "VendorBill_companyId_qbTxnId_idx" ON "VendorBill"("companyId", "qbTxnId");


-- CreateTable
CREATE TABLE "AreaFindLog" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "projectId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "conditionId" TEXT,
    "clickX" DOUBLE PRECISION NOT NULL,
    "clickY" DOUBLE PRECISION NOT NULL,
    "unitsPerFoot" DOUBLE PRECISION NOT NULL,
    "version" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "reason" TEXT,
    "areaSf" DOUBLE PRECISION,
    "outline" TEXT,
    "isDeduction" BOOLEAN NOT NULL DEFAULT false,
    "measurementId" TEXT,
    "ms" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AreaFindLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AreaFindLog_companyId_idx" ON "AreaFindLog"("companyId");

-- CreateIndex
CREATE INDEX "AreaFindLog_measurementId_idx" ON "AreaFindLog"("measurementId");

-- AddForeignKey
ALTER TABLE "AreaFindLog" ADD CONSTRAINT "AreaFindLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AreaFindLog" ADD CONSTRAINT "AreaFindLog_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "TakeoffSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;


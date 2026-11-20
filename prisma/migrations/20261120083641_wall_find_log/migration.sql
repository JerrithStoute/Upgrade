-- CreateTable
CREATE TABLE "WallFindLog" (
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
    "kind" TEXT,
    "thicknessIn" DOUBLE PRECISION,
    "lengthFt" DOUBLE PRECISION,
    "runs" TEXT,
    "addedLf" DOUBLE PRECISION,
    "measurementIds" TEXT,
    "ms" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WallFindLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WallFindLog_companyId_idx" ON "WallFindLog"("companyId");

-- CreateIndex
CREATE INDEX "WallFindLog_sheetId_idx" ON "WallFindLog"("sheetId");

-- AddForeignKey
ALTER TABLE "WallFindLog" ADD CONSTRAINT "WallFindLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WallFindLog" ADD CONSTRAINT "WallFindLog_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "TakeoffSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;


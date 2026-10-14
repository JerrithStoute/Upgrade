-- AlterTable
ALTER TABLE "User" ADD COLUMN     "access" TEXT,
ADD COLUMN     "positionId" TEXT;

-- The four old per-person permissions become that person's changes from Staff (src/lib/access.ts),
-- so nobody can do more or less than before.
UPDATE "User" SET "access" = NULLIF(jsonb_strip_nulls(jsonb_build_object(
    'reports', CASE WHEN "canSeeReports" THEN 1 END,
    'time', CASE WHEN "canManageTime" THEN 2 END,
    'delay', CASE WHEN "canDelay" THEN true END,
    'approveBills', CASE WHEN "canApproveBills" THEN true END
  ))::text, '{}')
  WHERE "role" = 'STAFF';

ALTER TABLE "User" DROP COLUMN "canApproveBills",
DROP COLUMN "canDelay",
DROP COLUMN "canManageTime",
DROP COLUMN "canSeeReports";

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "name" TEXT NOT NULL,
    "key" TEXT,
    "access" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL DEFAULT current_setting('app.company_id'::text),
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Position_companyId_idx" ON "Position"("companyId");

-- CreateIndex
CREATE INDEX "ProjectMember_companyId_idx" ON "ProjectMember"("companyId");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateTable
CREATE TABLE "StationUser" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "passwordHash" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "totpSecret" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "backupCodes" TEXT,
    "lastSignInAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StationUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationLog" (
    "id" TEXT NOT NULL,
    "stationUserId" TEXT,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StationUser_email_key" ON "StationUser"("email");

-- CreateIndex
CREATE INDEX "StationLog_type_createdAt_idx" ON "StationLog"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "StationLog" ADD CONSTRAINT "StationLog_stationUserId_fkey" FOREIGN KEY ("stationUserId") REFERENCES "StationUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The invitations sent and the website's requests for one were kept in the owner's own company's
-- activity. They're The Builder Station's, not that company's: they move to the Station's log.
INSERT INTO "StationLog" ("id", "type", "description", "createdAt")
SELECT "id", CASE "type" WHEN 'platform.invite-requested' THEN 'invite.requested' ELSE 'invite.sent' END, "description", "createdAt"
FROM "Activity" WHERE "type" IN ('platform.invite-requested', 'platform.builder-invited');
DELETE FROM "Activity" WHERE "type" IN ('platform.invite-requested', 'platform.builder-invited');

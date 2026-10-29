-- CreateTable
CREATE TABLE "StationUsage" (
    "id" TEXT NOT NULL,
    "builderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StationUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StationUsage_builderId_day_idx" ON "StationUsage"("builderId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "StationUsage_builderId_userId_day_area_key" ON "StationUsage"("builderId", "userId", "day", "area");


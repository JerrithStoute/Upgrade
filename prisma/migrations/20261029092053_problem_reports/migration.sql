-- CreateTable
CREATE TABLE "StationProblem" (
    "id" TEXT NOT NULL,
    "builderId" TEXT,
    "builderName" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "screenshot" BYTEA,
    "device" TEXT,
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StationProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StationError" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "page" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "lastUserName" TEXT,
    "lastBuilderName" TEXT,
    "lastBuilderId" TEXT,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "alertedAt" TIMESTAMP(3),
    "fixedAt" TIMESTAMP(3),

    CONSTRAINT "StationError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StationProblem_doneAt_createdAt_idx" ON "StationProblem"("doneAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StationError_key_key" ON "StationError"("key");

-- CreateIndex
CREATE INDEX "StationError_fixedAt_lastAt_idx" ON "StationError"("fixedAt", "lastAt");


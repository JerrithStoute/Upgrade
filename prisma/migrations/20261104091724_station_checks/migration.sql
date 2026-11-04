-- CreateTable
CREATE TABLE "StationCheck" (
    "name" TEXT NOT NULL,
    "lastRunAt" TIMESTAMP(3) NOT NULL,
    "lastOkAt" TIMESTAMP(3),
    "problem" TEXT,
    "failingSince" TIMESTAMP(3),
    "alertedAt" TIMESTAMP(3),

    CONSTRAINT "StationCheck_pkey" PRIMARY KEY ("name")
);


-- Running several copies of the app: claims on background work, and sign-in limits every copy shares.
CREATE TABLE "JobLock" (
    "name" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "until" TIMESTAMP(3) NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobLock_pkey" PRIMARY KEY ("name")
);

CREATE TABLE "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimit_resetAt_idx" ON "RateLimit"("resetAt");

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "signInSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Company_signInSlug_key" ON "Company"("signInSlug");


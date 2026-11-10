-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "bookIntro" TEXT,
ADD COLUMN     "bookSignoff" BOOLEAN NOT NULL DEFAULT true;


-- Plan templates: jobs kept to copy new jobs from, off the job lists.
ALTER TABLE "Project" ADD COLUMN     "isTemplate" BOOLEAN NOT NULL DEFAULT false;

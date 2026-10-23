-- Doors takeoff: the job's door list, and the company's own door details (like windows).
ALTER TABLE "Company" ADD COLUMN     "doorDetails" TEXT;
ALTER TABLE "Project" ADD COLUMN     "doorList" TEXT;

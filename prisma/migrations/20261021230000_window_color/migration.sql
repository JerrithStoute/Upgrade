-- Windows: a color (Standard / White/Black / Black/Black) instead of black yes / no.
ALTER TABLE "MaterialItem" ADD COLUMN     "color" TEXT;
UPDATE "MaterialItem" SET "color" = CASE WHEN "black" THEN 'Black/Black' ELSE 'Standard' END WHERE "black" IS NOT NULL;
ALTER TABLE "MaterialItem" DROP COLUMN "black";

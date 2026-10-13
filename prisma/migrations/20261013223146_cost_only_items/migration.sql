-- AlterTable
ALTER TABLE "Company" DROP COLUMN "defaultMarkup";

-- AlterTable
ALTER TABLE "MaterialItem" DROP COLUMN "markupPct";

-- AlterTable
ALTER TABLE "TakeoffAssemblyItem" DROP COLUMN "markupPct";

-- AlterTable
ALTER TABLE "TakeoffCondition" DROP COLUMN "markupPct";

-- AlterTable
ALTER TABLE "TakeoffTemplateCondition" DROP COLUMN "markupPct";

-- AlterTable
ALTER TABLE "TakeoffTemplateItem" DROP COLUMN "markupPct";


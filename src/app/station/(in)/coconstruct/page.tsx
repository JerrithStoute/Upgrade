import { systemDb } from "@/lib/db";
import { requireStation } from "@/lib/station-auth";
import { PageHeader } from "@/components/ui";
import { BringInForm } from "./bring-in-form";

export const metadata = { title: "Bring in a CoConstruct job" };

/**
 * The Station owner's "Bring in a CoConstruct job" — a builder's running job, moved over from
 * CoConstruct the way it stands today. See src/lib/coconstruct/import.ts for what's made.
 */
export default async function CoConstructPage() {
  await requireStation({ owner: true });
  const companies = await systemDb.company.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return (
    <div className="space-y-6">
      <PageHeader
        title="Bring in a CoConstruct job"
        description="A running job, moved over the way it stands today: the estimate, its selections, the change orders and the PDFs. Invoices, payments and bills aren't brought in here — they're in QuickBooks already."
      />
      <BringInForm builders={companies} />
    </div>
  );
}

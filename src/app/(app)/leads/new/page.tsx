import { addDays } from "date-fns";
import { requireView } from "@/lib/auth";
import { dateInput } from "@/lib/utils";
import { db } from "@/lib/db";
import { sourceOptions } from "@/lib/leads";
import { Card, CardBody, PageHeader } from "@/components/ui";
import { LeadForm } from "../_components/lead-form";
import { createLead } from "../actions";

export default async function NewLeadPage() {
  const user = await requireView("leads");
  const [sources, staff] = await Promise.all([
    sourceOptions(),
    db.user.findMany({ where: { role: { in: ["ADMIN", "STAFF"] }, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader breadcrumbs={[{ label: "Leads", href: "/leads" }, { label: "New" }]} title="New lead" description="Only a name is needed — fill in what you know." />
      <Card>
        <CardBody>
          <LeadForm action={createLead} sources={sources} staff={staff} meId={user.id} followDefault={dateInput(addDays(new Date(), 2))} />
        </CardBody>
      </Card>
    </div>
  );
}

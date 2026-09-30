import { requireStaff } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { ClientForm } from "../_components/client-form";
import { createClient } from "../actions";

export default async function NewClientPage() {
  await requireStaff();
  return (
    <div>
      <PageHeader breadcrumbs={[{ label: "Clients", href: "/clients" }, { label: "New" }]} title="New client" />
      <ClientForm action={createClient} />
    </div>
  );
}

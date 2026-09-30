import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardBody, CardHeader, ConfirmForm, PageHeader } from "@/components/ui";
import { ClientForm } from "../../_components/client-form";
import { deleteClient, updateClient } from "../../actions";

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const client = await db.client.findUnique({ where: { id }, include: { _count: { select: { projects: true } } } });
  if (!client) notFound();
  const name = `${client.firstName} ${client.lastName}`;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Clients", href: "/clients" }, { label: name, href: `/clients/${client.id}` }, { label: "Edit" }]}
        title={`Edit ${name}`}
      />
      <ClientForm action={updateClient} client={client} />

      <Card className="border-rose-200">
        <CardHeader title="Danger zone" description="Deleting a client also removes their portal login." />
        <CardBody>
          {client._count.projects > 0 ? (
            <p className="text-sm text-slate-600">
              This client has {client._count.projects} project{client._count.projects === 1 ? "" : "s"} and cannot be deleted. Reassign or
              delete those projects first.
            </p>
          ) : (
            <ConfirmForm action={deleteClient} hidden={{ id: client.id }} message={`Delete client ${name}? This cannot be undone.`}>
              Delete client
            </ConfirmForm>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

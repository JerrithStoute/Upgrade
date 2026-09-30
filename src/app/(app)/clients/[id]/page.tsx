import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound, Pencil } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { contractValue } from "@/lib/projects";
import { fmtDate, money } from "@/lib/utils";
import {
  Badge,
  ButtonLink,
  Card,
  CardBody,
  CardHeader,
  ConfirmForm,
  Field,
  FormGrid,
  PageHeader,
  SubmitButton,
} from "@/components/ui";
import { grantPortalAccess, resetPortalPassword, revokePortalAccess } from "../actions";

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const client = await db.client.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, active: true, createdAt: true } },
      projects: { orderBy: { number: "desc" } },
    },
  });
  if (!client) notFound();
  const values = await Promise.all(client.projects.map((p) => contractValue(p.id, p.contractAmount)));
  const address = [client.address, [client.city, client.state].filter(Boolean).join(", "), client.zip].filter(Boolean).join(" · ");

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Clients", href: "/clients" }, { label: `${client.firstName} ${client.lastName}` }]}
        title={`${client.firstName} ${client.lastName}`}
        meta={client.user ? <Badge status="CLIENT">Portal</Badge> : null}
        description={[client.company, client.source ? `Source: ${client.source}` : null].filter(Boolean).join(" · ") || undefined}
        actions={
          <ButtonLink href={`/clients/${client.id}/edit`} variant="secondary" size="sm">
            <Pencil className="h-3.5 w-3.5" /> Edit
          </ButtonLink>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Projects" description={`${client.projects.length} total`} />
            {client.projects.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-500">
                  No projects yet.{" "}
                  <Link href="/projects/new" className="font-medium text-blue-700 hover:underline">
                    Start one
                  </Link>
                  .
                </p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-slate-100">
                {client.projects.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                    <div className="min-w-0 flex-1">
                      <Link href={`/projects/${p.id}`} className="block truncate text-sm font-medium text-slate-900 hover:text-blue-700">
                        <span className="text-slate-400">#{p.number}</span> {p.name}
                      </Link>
                      <p className="text-xs text-slate-500">
                        {p.startDate ? `Start ${fmtDate(p.startDate)}` : "Not started"}
                      </p>
                    </div>
                    <Badge status={p.status} />
                    <span className="w-28 text-right text-sm text-slate-700 tabular-nums">{money(values[i], true)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <CardBody>
              {client.notes ? (
                <p className="whitespace-pre-line text-sm text-slate-700">{client.notes}</p>
              ) : (
                <p className="text-sm text-slate-500">No notes.</p>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Contact details" />
            <CardBody>
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Email</dt>
                  <dd className="text-slate-900">
                    {client.email ? (
                      <a href={`mailto:${client.email}`} className="hover:text-blue-700">
                        {client.email}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Phone</dt>
                  <dd className="text-slate-900">
                    {client.phone ? (
                      <a href={`tel:${client.phone}`} className="hover:text-blue-700">
                        {client.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Address</dt>
                  <dd className="text-slate-900">{address || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-wide text-slate-500">Client since</dt>
                  <dd className="text-slate-900">{fmtDate(client.createdAt)}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Client portal access"
              description={client.user ? "This client can sign in to view their project." : "Create a login so this client can view their project online."}
            />
            <CardBody className="space-y-4">
              {client.user ? (
                <>
                  <div className="flex items-center gap-3 rounded-md bg-slate-50 px-3 py-2 text-sm">
                    <KeyRound className="h-4 w-4 text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{client.user.email}</p>
                      <p className="text-xs text-slate-500">
                        {client.user.active ? "Active" : "Inactive"} · since {fmtDate(client.user.createdAt)}
                      </p>
                    </div>
                  </div>
                  <form action={resetPortalPassword} className="space-y-3">
                    <input type="hidden" name="id" value={client.id} />
                    <Field label="New password" htmlFor="reset-password" hint="At least 8 characters.">
                      <input id="reset-password" name="password" type="password" minLength={8} required className="input" autoComplete="new-password" />
                    </Field>
                    <SubmitButton variant="secondary" size="sm">
                      Reset password
                    </SubmitButton>
                  </form>
                  <div className="border-t border-slate-100 pt-4">
                    <ConfirmForm
                      action={revokePortalAccess}
                      hidden={{ id: client.id }}
                      message={`Revoke portal access for ${client.firstName} ${client.lastName}? Their login will be deleted.`}
                    >
                      Revoke access
                    </ConfirmForm>
                  </div>
                </>
              ) : (
                <form action={grantPortalAccess} className="space-y-3">
                  <input type="hidden" name="id" value={client.id} />
                  <FormGrid className="md:grid-cols-1">
                    <Field label="Login email" htmlFor="portal-email">
                      <input id="portal-email" name="email" type="email" required className="input" defaultValue={client.email ?? ""} />
                    </Field>
                    <Field label="Password" htmlFor="portal-password" hint="At least 8 characters. Share it with the client.">
                      <input id="portal-password" name="password" type="password" minLength={8} required className="input" autoComplete="new-password" />
                    </Field>
                  </FormGrid>
                  <SubmitButton size="sm">Grant portal access</SubmitButton>
                </form>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

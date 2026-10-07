import Link from "next/link";
import { Pencil, UserPlus, Users, X } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { Badge, Button, ButtonLink, Card, CardHeader, Collapsible, ConfirmForm, EmptyState, Field, FormGrid, SubmitButton, Table, THead, TBody, Tr, Th, Td } from "@/components/ui";
import { createTeamMember, updateTeamMember, toggleTeamMemberActive, deleteTeamMember } from "./actions";

export const metadata = { title: "Team" };

const ROLES = ["ADMIN", "STAFF", "SUB"] as const;

/** Subcontractors can be listed (e.g. for schedule assignments) but can't sign in until a sub portal exists. */
function roleLabel(r: (typeof ROLES)[number]) {
  return r === "SUB" ? "Subcontractor (no login)" : r === "ADMIN" ? "Admin" : "Staff";
}

export default async function TeamSettingsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const admin = await requireAdmin();
  const { edit } = await searchParams;

  const [team, clients] = await Promise.all([
    db.user.findMany({
      where: { role: { not: "CLIENT" } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { dailyLogs: true, messages: true } } },
    }),
    db.user.findMany({
      where: { role: "CLIENT" },
      orderBy: { name: "asc" },
      include: { client: { select: { id: true, firstName: true, lastName: true, company: true, _count: { select: { projects: true } } } } },
    }),
  ]);

  const EDIT_FORM = "edit-team-member";

  return (
    <div className="space-y-6">
      <Collapsible
        summary={
          <span className="inline-flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-slate-500" /> Add team member
          </span>
        }
      >
        <form action={createTeamMember} className="space-y-4">
          <FormGrid className="md:grid-cols-3">
            <Field label="Name" htmlFor="new-name">
              <input id="new-name" name="name" className="input" required />
            </Field>
            <Field label="Email" htmlFor="new-email">
              <input id="new-email" name="email" type="email" className="input" required />
            </Field>
            <Field label="Role" htmlFor="new-role">
              <select id="new-role" name="role" className="input" defaultValue="STAFF">
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Title" htmlFor="new-title">
              <input id="new-title" name="title" className="input" placeholder="Project Manager" />
            </Field>
            <Field label="Phone" htmlFor="new-phone">
              <input id="new-phone" name="phone" type="tel" className="input" />
            </Field>
            <Field label="Password" htmlFor="new-password" hint="At least 6 characters. Share it with the team member.">
              <input id="new-password" name="password" type="password" className="input" required minLength={6} autoComplete="new-password" />
            </Field>
          </FormGrid>
          <SubmitButton>Add team member</SubmitButton>
        </form>
      </Collapsible>

      {/* The inline edit row's inputs point at this form via the `form` attribute. */}
      {edit ? <form id={EDIT_FORM} action={updateTeamMember} /> : null}

      <Card>
        <CardHeader title="Team members" description={`${team.filter((u) => u.active).length} active · ${team.length} total`} />
        <Table className="rounded-t-none border-0 shadow-none">
          <THead>
            <tr>
              <Th>Name</Th>
              <Th>Email</Th>
              <Th>Title</Th>
              <Th>Phone</Th>
              <Th>Role</Th>
              <Th>Schedule</Th>
              <Th>Active</Th>
              <Th>Created</Th>
              <Th right>Actions</Th>
            </tr>
          </THead>
          <TBody>
            {team.map((u) => {
              const isSelf = u.id === admin.id;
              if (edit === u.id) {
                return (
                  <Tr key={u.id} className="bg-blue-50/40">
                    <Td>
                      <input type="hidden" name="id" value={u.id} form={EDIT_FORM} />
                      <input name="name" defaultValue={u.name} className="input" required form={EDIT_FORM} aria-label="Name" />
                    </Td>
                    <Td className="text-slate-500">{u.email}</Td>
                    <Td>
                      <input name="title" defaultValue={u.title ?? ""} className="input" form={EDIT_FORM} aria-label="Title" />
                    </Td>
                    <Td>
                      <input name="phone" defaultValue={u.phone ?? ""} className="input" form={EDIT_FORM} aria-label="Phone" />
                    </Td>
                    <Td>
                      <select name="role" defaultValue={u.role} className="input" form={EDIT_FORM} disabled={isSelf} aria-label="Role">
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {roleLabel(r)}
                          </option>
                        ))}
                      </select>
                    </Td>
                    <Td>
                      <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-700">
                        <input
                          type="checkbox"
                          name="canDelay"
                          defaultChecked={u.canDelay || u.role === "ADMIN"}
                          disabled={u.role === "ADMIN"}
                          form={EDIT_FORM}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Can delay jobs
                      </label>
                      <label className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-700">
                        <input
                          name="vacationDays"
                          type="number"
                          min={0}
                          max={365}
                          step="0.5"
                          defaultValue={u.vacationDays ?? ""}
                          placeholder="—"
                          form={EDIT_FORM}
                          className="input !h-7 !w-16 !py-0 text-right"
                          aria-label="Vacation days a year"
                        />
                        vacation days / yr
                      </label>
                    </Td>
                    <Td>
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={u.active}
                        form={EDIT_FORM}
                        disabled={isSelf}
                        className="h-4 w-4 rounded border-slate-300"
                        aria-label="Active"
                        title={isSelf ? "You cannot deactivate yourself" : undefined}
                      />
                    </Td>
                    <Td>
                      <input name="password" type="password" placeholder="New password" className="input" form={EDIT_FORM} autoComplete="new-password" aria-label="New password" />
                    </Td>
                    <Td right>
                      <div className="flex justify-end gap-1.5">
                        <Button type="submit" size="sm" form={EDIT_FORM}>
                          Save
                        </Button>
                        <ButtonLink href="/settings/team" variant="ghost" size="sm">
                          <X className="h-3.5 w-3.5" /> Cancel
                        </ButtonLink>
                      </div>
                    </Td>
                  </Tr>
                );
              }
              const hasHistory = u._count.dailyLogs > 0 || u._count.messages > 0;
              return (
                <Tr key={u.id} className={!u.active ? "text-slate-400" : undefined}>
                  <Td className="font-medium text-slate-900">
                    {u.name}
                    {isSelf ? <span className="ml-1.5 text-xs font-normal text-slate-500">(you)</span> : null}
                  </Td>
                  <Td>{u.email}</Td>
                  <Td>{u.title ?? "—"}</Td>
                  <Td>{u.phone ?? "—"}</Td>
                  <Td>
                    <Badge status={u.role} />
                  </Td>
                  <Td className="text-xs text-slate-600">
                    {u.role === "ADMIN" || u.canDelay ? <span className="block">Can delay jobs</span> : null}
                    {u.vacationDays != null ? <span className="block">{u.vacationDays} vacation days / yr</span> : null}
                    {!(u.role === "ADMIN" || u.canDelay) && u.vacationDays == null ? "—" : null}
                  </Td>
                  <Td>
                    {isSelf ? (
                      <Badge className="bg-emerald-50 text-emerald-800 ring-emerald-200">Active</Badge>
                    ) : (
                      <form action={toggleTeamMemberActive}>
                        <input type="hidden" name="id" value={u.id} />
                        <button
                          type="submit"
                          className={
                            u.active
                              ? "inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100"
                              : "inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-200"
                          }
                          title={u.active ? "Click to deactivate" : "Click to reactivate"}
                        >
                          {u.active ? "Active" : "Inactive"}
                        </button>
                      </form>
                    )}
                  </Td>
                  <Td>{fmtDate(u.createdAt)}</Td>
                  <Td right>
                    <div className="flex justify-end gap-1.5">
                      <ButtonLink href={`/settings/team?edit=${u.id}`} variant="secondary" size="sm">
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </ButtonLink>
                      {!isSelf ? (
                        <ConfirmForm
                          action={deleteTeamMember}
                          hidden={{ id: u.id }}
                          message={
                            hasHistory
                              ? `${u.name} has authored daily logs or messages, so they will be deactivated instead of deleted. Continue?`
                              : `Delete ${u.name}? This cannot be undone.`
                          }
                        >
                          {hasHistory ? "Deactivate" : "Delete"}
                        </ConfirmForm>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>

      <Card>
        <CardHeader title="Client logins" description="Portal accounts linked to a client record. Create or manage them from the client's page." />
        {clients.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={Users} title="No client logins" description="Client portal accounts are created from a client's detail page." />
          </div>
        ) : (
          <Table className="rounded-t-none border-0 shadow-none">
            <THead>
              <tr>
                <Th>Name</Th>
                <Th>Email</Th>
                <Th>Linked client</Th>
                <Th>Projects</Th>
                <Th>Active</Th>
                <Th>Created</Th>
              </tr>
            </THead>
            <TBody>
              {clients.map((u) => (
                <Tr key={u.id}>
                  <Td className="font-medium text-slate-900">{u.name}</Td>
                  <Td>{u.email}</Td>
                  <Td>
                    {u.client ? (
                      <Link href={`/clients/${u.client.id}`} className="text-blue-700 hover:underline">
                        {u.client.firstName} {u.client.lastName}
                        {u.client.company ? ` · ${u.client.company}` : ""}
                      </Link>
                    ) : (
                      <span className="text-amber-700">Not linked to a client</span>
                    )}
                  </Td>
                  <Td>{u.client?._count.projects ?? 0}</Td>
                  <Td>
                    <Badge className={u.active ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : undefined}>{u.active ? "Active" : "Inactive"}</Badge>
                  </Td>
                  <Td>{fmtDate(u.createdAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}

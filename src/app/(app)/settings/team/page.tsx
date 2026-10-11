import Link from "@/components/link";
import { Mail, Pencil, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { openInvites } from "@/lib/invites";
import { fmtDate, fmtDateTime } from "@/lib/utils";
import { Badge, Button, ButtonLink, Card, CardHeader, Collapsible, ConfirmForm, EmptyState, Field, FormGrid, SubmitButton, Table, THead, TBody, Tr, Th, Td } from "@/components/ui";
import { addNoLoginMember, cancelTeamInvite, deleteTeamMember, inviteTeamMember, resendTeamInvite, sendPasswordReset, setRequireTwoStep, toggleTeamMemberActive, updateTeamMember } from "./actions";

export const metadata = { title: "Team" };

const ROLES = ["ADMIN", "STAFF", "SUB"] as const;

/** Subcontractors can be listed (e.g. for schedule assignments) but can't sign in until a sub portal exists. */
function roleLabel(r: (typeof ROLES)[number]) {
  return r === "SUB" ? "Subcontractor (no login)" : r === "ADMIN" ? "Admin" : "Staff";
}

export default async function TeamSettingsPage({ searchParams }: { searchParams: Promise<{ edit?: string; invited?: string; reset?: string }> }) {
  const admin = await requireAdmin();
  const { edit, invited, reset } = await searchParams;

  const [company, waiting, team, clients, securityLog] = await Promise.all([
    db.company.findFirstOrThrow({ select: { requireTwoStep: true } }),
    openInvites({ kind: "TEAM" }),
    db.user.findMany({
      where: { role: { notIn: ["CLIENT", "VENDOR"] } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      include: { _count: { select: { dailyLogs: true, messages: true } } },
    }),
    db.user.findMany({
      where: { role: "CLIENT" },
      orderBy: { name: "asc" },
      include: { client: { select: { id: true, firstName: true, lastName: true, company: true, _count: { select: { projects: true } } } } },
    }),
    // Sign-ins, failed attempts, and changes to logins (by the person or by an admin).
    db.activity.findMany({
      where: { OR: [{ type: { startsWith: "security." } }, { type: { startsWith: "user." } }, { type: "company.two-step" }] },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: { id: true, type: true, description: true, createdAt: true },
    }),
  ]);

  const EDIT_FORM = "edit-team-member";

  return (
    <div className="space-y-6">
      {invited ? (
        <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Invitation sent to {invited}. They&apos;ll choose their own password from the email.</p>
      ) : null}
      {reset ? <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">A link to choose a new password was emailed to {reset}.</p> : null}
      <Collapsible
        defaultOpen={team.length <= 1}
        summary={
          <span className="inline-flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-slate-500" /> Invite a team member
          </span>
        }
      >
        <form action={inviteTeamMember} className="space-y-4">
          <FormGrid className="md:grid-cols-3">
            <Field label="Email" htmlFor="new-email">
              <input id="new-email" name="email" type="email" className="input" required />
            </Field>
            <Field label="Name (optional)" htmlFor="new-name">
              <input id="new-name" name="name" className="input" />
            </Field>
            <Field label="Role" htmlFor="new-role">
              <select id="new-role" name="role" className="input" defaultValue="STAFF">
                <option value="STAFF">Staff</option>
                <option value="ADMIN">Admin (everything, including Settings)</option>
              </select>
            </Field>
          </FormGrid>
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-700">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="canDelay" className="h-4 w-4 rounded border-slate-300" /> Can delay jobs
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="canApproveBills" className="h-4 w-4 rounded border-slate-300" /> Can approve &amp; pay bills
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="canSeeReports" className="h-4 w-4 rounded border-slate-300" /> Can see reports
            </label>
            <label className="flex items-center gap-1.5">
              <input type="checkbox" name="canManageTime" className="h-4 w-4 rounded border-slate-300" /> Can manage everyone&apos;s time
            </label>
          </div>
          <p className="text-xs text-slate-500">They get an email with a link to choose their own password. It works for 7 days.</p>
          <SubmitButton pendingText="Sending…">
            <Mail className="h-4 w-4" /> Send invitation
          </SubmitButton>
        </form>
        <details className="mt-5 border-t border-slate-100 pt-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">Add someone who doesn&apos;t sign in (crew on the schedule or time clock)</summary>
          <form action={addNoLoginMember} className="mt-3 space-y-3">
            <FormGrid className="md:grid-cols-3">
              <Field label="Name" htmlFor="nl-name">
                <input id="nl-name" name="name" className="input" required />
              </Field>
              <Field label="Title" htmlFor="nl-title">
                <input id="nl-title" name="title" className="input" placeholder="Framer" />
              </Field>
              <Field label="Phone" htmlFor="nl-phone">
                <input id="nl-phone" name="phone" type="tel" className="input" />
              </Field>
            </FormGrid>
            <SubmitButton variant="secondary">Add without a login</SubmitButton>
          </form>
        </details>
      </Collapsible>

      {waiting.length ? (
        <Card>
          <CardHeader title="Invitations waiting" description="Sent, not yet accepted." />
          <ul className="divide-y divide-slate-100">
            {waiting.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-slate-900">{i.email}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {i.role === "ADMIN" ? "Admin" : "Staff"} · sent {fmtDate(i.createdAt)}
                    {i.invitedBy ? ` by ${i.invitedBy.name}` : ""} · {i.expiresAt < new Date() ? <span className="text-rose-600">expired</span> : `good until ${fmtDate(i.expiresAt)}`}
                  </span>
                </span>
                <form action={resendTeamInvite}>
                  <input type="hidden" name="id" value={i.id} />
                  <SubmitButton size="sm" variant="ghost" pendingText="Sending…">
                    Resend
                  </SubmitButton>
                </form>
                <ConfirmForm action={cancelTeamInvite} hidden={{ id: i.id }} variant="ghost" message={`Cancel the invitation to ${i.email}? The link in their email stops working.`}>
                  <span className="text-rose-600">Cancel</span>
                </ConfirmForm>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title={
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-slate-400" /> Two-step sign-in for the team
            </span>
          }
          description={
            company.requireTwoStep
              ? "Required: everyone on the team signs in with a code from an authenticator app. Anyone without it sets it up at their next sign-in."
              : "Optional: each person can turn it on under Your account. Require it to protect the whole company if a password leaks."
          }
          actions={
            <form action={setRequireTwoStep}>
              <input type="hidden" name="on" value={company.requireTwoStep ? "" : "on"} />
              <SubmitButton size="sm" variant={company.requireTwoStep ? "ghost" : "secondary"}>
                {company.requireTwoStep ? "Stop requiring it" : "Require it"}
              </SubmitButton>
            </form>
          }
        />
      </Card>

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
                          type="checkbox"
                          name="canApproveBills"
                          defaultChecked={u.canApproveBills || u.role === "ADMIN"}
                          disabled={u.role === "ADMIN"}
                          form={EDIT_FORM}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Can approve &amp; pay bills
                      </label>
                      <label className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-700">
                        <input
                          type="checkbox"
                          name="canSeeReports"
                          defaultChecked={u.canSeeReports || u.role === "ADMIN"}
                          disabled={u.role === "ADMIN"}
                          form={EDIT_FORM}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Can see reports
                      </label>
                      <label className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-700">
                        <input
                          type="checkbox"
                          name="canManageTime"
                          defaultChecked={u.canManageTime || u.role === "ADMIN"}
                          disabled={u.role === "ADMIN"}
                          form={EDIT_FORM}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        Can manage everyone&apos;s time
                      </label>
                      <label className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-700">
                        $
                        <input
                          name="payRate"
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={u.payRate ?? ""}
                          placeholder="—"
                          form={EDIT_FORM}
                          className="input !h-7 !w-20 !py-0 text-right"
                          aria-label="Pay per hour"
                        />
                        / hr pay
                      </label>
                      <label className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-xs text-slate-700">
                        <input type="checkbox" name="salaried" defaultChecked={u.salaried} form={EDIT_FORM} className="h-4 w-4 rounded border-slate-300" />
                        Salaried (no overtime)
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
                      {u.role !== "SUB" && u.active ? (
                        <form action={sendPasswordReset}>
                          <input type="hidden" name="id" value={u.id} />
                          <SubmitButton size="sm" variant="ghost" pendingText="Sending…" title="Emails them a link to choose a new password">
                            Send password reset
                          </SubmitButton>
                        </form>
                      ) : (
                        <span className="text-xs text-slate-400">No login</span>
                      )}
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
                    {u.role === "ADMIN" || u.canApproveBills ? <span className="block">Can approve &amp; pay bills</span> : null}
                    {u.role === "ADMIN" || u.canSeeReports ? <span className="block">Can see reports</span> : null}
                    {u.role === "ADMIN" || u.canManageTime ? <span className="block">Can manage everyone&apos;s time</span> : null}
                    {u.payRate != null ? (
                      <span className="block">
                        ${u.payRate.toFixed(2)} / hr{u.salaried ? " · salaried" : ""}
                      </span>
                    ) : null}
                    {u.vacationDays != null ? <span className="block">{u.vacationDays} vacation days / yr</span> : null}
                    {!(u.role === "ADMIN" || u.canDelay || u.canApproveBills || u.canManageTime) && u.vacationDays == null && u.payRate == null ? "—" : null}
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

      <Card>
        <CardHeader title="Security log" description="Sign-ins, wrong passwords and codes, and changes to logins — the latest 100." />
        {securityLog.length === 0 ? (
          <p className="p-5 text-sm text-slate-500">Nothing yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <Table className="rounded-t-none border-0 shadow-none">
              <THead>
                <tr>
                  <Th className="w-48">When</Th>
                  <Th>What happened</Th>
                </tr>
              </THead>
              <TBody>
                {securityLog.map((e) => (
                  <Tr key={e.id}>
                    <Td className="whitespace-nowrap text-slate-500">{fmtDateTime(e.createdAt)}</Td>
                    <Td className={e.type === "security.failed" ? "font-medium text-amber-800" : undefined}>{e.description}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

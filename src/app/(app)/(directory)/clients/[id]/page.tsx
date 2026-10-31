import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Trash2 } from "lucide-react";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { contractValues } from "@/lib/projects";
import { fmtDate, money } from "@/lib/utils";
import { Badge, ConfirmForm, SubmitButton } from "@/components/ui";
import { ClientInfo } from "@/components/clients/client-info";
import { cancelPortalInvite, deleteClient, grantPortalAccess, resendPortalInvite, resetPortalPassword, revokePortalAccess } from "../actions";
import { openInvites } from "@/lib/invites";

const small = "!h-7 !px-2.5 !text-xs";
const pill = "rounded-full px-2.5 py-0.5 text-xs font-medium";

/**
 * One client, everything in one place, like a sub's page: their info (edited right here), their portal sign-in,
 * and their jobs.
 */
export default async function ClientDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reset?: string; edit?: string }> }) {
  const user = await requireView("leads");
  const canEdit = user.role === "ADMIN" || allows(user.access, "leads", 2);
  const { id } = await params;
  const { reset, edit } = await searchParams;
  const [waiting] = await openInvites({ clientId: id });
  const client = await db.client.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true, active: true, lastSignInAt: true } },
      projects: { orderBy: { number: "desc" } },
    },
  });
  if (!client) notFound();
  const values = await contractValues(client.projects);
  const name = `${client.firstName} ${client.lastName}`;
  const jobs = client.projects.length;

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link href="/clients" className="text-xs text-slate-500 hover:text-slate-800">
          ← Clients
        </Link>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold text-slate-900">{name}</h1>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {client.user ? (
                <span className={`${pill} bg-emerald-50 text-emerald-800`}>Portal: {client.user.lastSignInAt ? "signed in" : "set up"}</span>
              ) : waiting ? (
                <span className={`${pill} bg-amber-50 text-amber-800`}>Portal: invited</span>
              ) : (
                <span className={`${pill} bg-slate-100 text-slate-600`}>No portal yet</span>
              )}
              {jobs ? <span className={`${pill} bg-blue-50 text-blue-800`}>{jobs === 1 ? "1 job" : `${jobs} jobs`}</span> : null}
              {client.source ? <span className={`${pill} bg-slate-100 text-slate-600`}>{client.source}</span> : null}
            </div>
          </div>
          {canEdit ? (
            jobs ? (
              <span className="text-xs text-slate-400">Has jobs, so it can&apos;t be deleted</span>
            ) : (
              <ConfirmForm action={deleteClient} hidden={{ id: client.id }} message={`Delete ${name}? Their portal sign-in goes too.`} variant="ghost">
                <span className="inline-flex items-center gap-1 text-xs text-rose-600">
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </span>
              </ConfirmForm>
            )
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <ClientInfo client={client} canEdit={canEdit} startEditing={edit === "1"} />

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-slate-900">Client portal</h2>
            <p className="text-xs text-slate-500">They follow their job, make selections, approve change orders and pay invoices.</p>
          </header>
          <div className="px-4 py-2">
            {client.user ? (
              <>
                <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 py-1.5 text-sm">
                  <span className="text-slate-500">Sign-in</span>
                  <span className="min-w-0 break-words text-slate-900">{client.user.email}</span>
                </div>
                <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1.5 text-sm">
                  <span className="text-slate-500">Last signed in</span>
                  <span className="text-slate-900">{client.user.lastSignInAt ? fmtDate(client.user.lastSignInAt) : <span className="text-slate-400">Not yet</span>}</span>
                </div>
                {reset === "1" ? <p className="py-1 text-xs text-emerald-700">A link to choose a new password was emailed to {client.user.email}.</p> : null}
                {canEdit ? (
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-2 pb-1">
                    <form action={resetPortalPassword}>
                      <input type="hidden" name="id" value={client.id} />
                      <SubmitButton size="sm" variant="secondary" className={small} pendingText="Sending…">
                        Send password reset
                      </SubmitButton>
                    </form>
                    <ConfirmForm action={revokePortalAccess} hidden={{ id: client.id }} message={`Remove ${name}'s portal sign-in? You can invite them again later.`} variant="ghost">
                      <span className="text-xs text-rose-600">Remove sign-in</span>
                    </ConfirmForm>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                {waiting ? (
                  <div className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                    <span className="min-w-0 flex-1">
                      {waiting.email}{" "}
                      <span className="text-xs text-amber-700">· invited, {waiting.expiresAt < new Date() ? "expired" : `waiting until ${fmtDate(waiting.expiresAt)}`}</span>
                    </span>
                    {canEdit ? (
                      <>
                        <form action={resendPortalInvite}>
                          <input type="hidden" name="id" value={client.id} />
                          <input type="hidden" name="inviteId" value={waiting.id} />
                          <SubmitButton size="sm" variant="ghost" className={small} pendingText="Sending…">
                            Resend
                          </SubmitButton>
                        </form>
                        <ConfirmForm action={cancelPortalInvite} hidden={{ id: client.id, inviteId: waiting.id }} variant="ghost" message="Cancel the invitation? The link in their email stops working.">
                          <span className="text-xs text-rose-600">Cancel</span>
                        </ConfirmForm>
                      </>
                    ) : null}
                  </div>
                ) : (
                  <p className="py-1.5 text-sm text-slate-500">No sign-in yet. They get an email to choose their own password.</p>
                )}
                {canEdit && !waiting ? (
                  <form action={grantPortalAccess} className="flex flex-wrap items-center gap-1.5 pt-1 pb-1">
                    <input type="hidden" name="id" value={client.id} />
                    <input name="email" type="email" required className="input !h-7 !w-56 !py-0 text-xs" placeholder="Email they sign in with" aria-label="Email" defaultValue={client.email ?? ""} />
                    <SubmitButton size="sm" variant="secondary" className={small} pendingText="Sending…">
                      Invite
                    </SubmitButton>
                  </form>
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Jobs</h2>
          <Link href={`/projects/new?client=${client.id}`} className="text-xs font-medium text-blue-700 hover:underline">
            + Start a job for {client.firstName}
          </Link>
        </header>
        {jobs ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Job</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-2 py-2 font-medium">Start</th>
                  <th className="px-4 py-2 text-right font-medium">Contract</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {client.projects.map((p, i) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">
                      <Link href={`/projects/${p.id}`} className="text-slate-900 hover:text-blue-700">
                        <span className="text-slate-400">#{p.number}</span> {p.name}
                      </Link>
                    </td>
                    <td className="px-2 py-2">
                      <Badge status={p.status} />
                    </td>
                    <td className="px-2 py-2 text-slate-600">{p.startDate ? fmtDate(p.startDate) : <span className="text-slate-400">Not started</span>}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money(values[i], true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-3 text-sm text-slate-500">No jobs yet.</p>
        )}
      </section>
    </div>
  );
}

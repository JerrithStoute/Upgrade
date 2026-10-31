import Link from "@/components/link";
import { Plus, ShieldCheck } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyPositions } from "@/lib/positions";
import { openInvites } from "@/lib/invites";
import { cn, fmtDate } from "@/lib/utils";
import { ConfirmForm, PageHeader, SubmitButton } from "@/components/ui";
import { addNoLoginMember, cancelTeamInvite, inviteTeamMember, resendTeamInvite } from "./actions";

export const metadata = { title: "Team" };

const small = "!h-7 !px-2.5 !text-xs";
const box = "input !h-7 !py-0 text-xs";

/**
 * Directory → Team: everyone on your team — click a name for their page. Admins invite people and add crew who
 * don't sign in right here, and set up Positions (what each position sees) from here too.
 */
export default async function TeamDirectoryPage({ searchParams }: { searchParams: Promise<{ invited?: string }> }) {
  const user = await requireStaff();
  const admin = user.role === "ADMIN";
  const { invited } = await searchParams;
  const positions = await companyPositions();
  const [team, waiting, signIns] = await Promise.all([
    db.user.findMany({
      where: { role: { in: ["ADMIN", "STAFF", "SUB"] } },
      orderBy: [{ active: "desc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, phone: true, title: true, role: true, positionId: true, active: true },
    }),
    admin ? openInvites({ kind: "TEAM" }) : [],
    admin ? db.user.findMany({ where: { role: { in: ["ADMIN", "STAFF"] } }, select: { id: true, lastSignInAt: true } }) : [],
  ]);
  const lastIn = new Map(signIns.map((s) => [s.id, s.lastSignInAt]));
  const positionName = (u: { role: string; positionId: string | null }) =>
    u.role === "ADMIN" ? "Admin" : u.role === "SUB" ? "No sign-in" : (positions.find((p) => p.id === u.positionId)?.name ?? "Staff");
  const realEmail = (e: string) => (e.endsWith(".invalid") ? null : e);
  const staffPos = positions.find((p) => p.key === "STAFF") ?? positions[0];
  const active = team.filter((u) => u.active).length;

  return (
    <div className="max-w-5xl space-y-4">
      <PageHeader title="Team" description={`${active} ${active === 1 ? "person" : "people"} on your team.`} />
      {invited ? <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">Invitation sent to {invited}. They&apos;ll choose their own password from the email.</p> : null}

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-slate-900">Everyone</h2>
          {admin ? (
            <Link href="/team/positions" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
              <ShieldCheck className="h-3.5 w-3.5" /> Positions — what each one sees
            </Link>
          ) : null}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Name</th>
                <th className="px-2 py-2 font-medium">Position</th>
                <th className="px-2 py-2 font-medium">Phone</th>
                <th className="px-2 py-2 font-medium">Email</th>
                {admin ? <th className="px-4 py-2 font-medium">Sign-in</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {team.map((u) => (
                <tr key={u.id} className={cn("hover:bg-slate-50", !u.active && "text-slate-400")}>
                  <td className="px-4 py-2">
                    <Link href={`/team/${u.id}`} className={cn("font-medium hover:underline", u.active ? "text-blue-700" : "text-slate-400")}>
                      {u.name}
                    </Link>
                    {u.title ? <span className="block text-xs text-slate-500">{u.title}</span> : null}
                  </td>
                  <td className="px-2 py-2 text-slate-600">{positionName(u)}</td>
                  <td className="px-2 py-2">
                    {u.phone ? (
                      <a href={`tel:${u.phone}`} className="text-slate-700 hover:text-blue-700">
                        {u.phone}
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    {realEmail(u.email) ? (
                      <a href={`mailto:${u.email}`} className="text-slate-700 hover:text-blue-700">
                        {u.email}
                      </a>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  {admin ? (
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1",
                          !u.active ? "bg-slate-50 text-slate-500 ring-slate-200" : u.role === "SUB" ? "bg-slate-50 text-slate-500 ring-slate-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200",
                        )}
                      >
                        {!u.active ? "Turned off" : u.role === "SUB" ? "No sign-in" : lastIn.get(u.id) ? `Signed in ${fmtDate(lastIn.get(u.id), "MMM d")}` : "Active"}
                      </span>
                    </td>
                  ) : null}
                </tr>
              ))}
              {waiting.map((i) => (
                <tr key={i.id} className="bg-amber-50/40">
                  <td className="px-4 py-2 text-slate-800">{i.name ?? i.email}</td>
                  <td className="px-2 py-2 text-slate-600">{i.role === "ADMIN" ? "Admin" : "Invited"}</td>
                  <td className="px-2 py-2 text-slate-300">—</td>
                  <td className="px-2 py-2 text-slate-600">{i.email}</td>
                  <td className="px-4 py-2">
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="whitespace-nowrap rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                        {i.expiresAt < new Date() ? "Invite expired" : "Invited · waiting"}
                      </span>
                      <form action={resendTeamInvite}>
                        <input type="hidden" name="id" value={i.id} />
                        <SubmitButton size="sm" variant="ghost" className={small} pendingText="Sending…">
                          Resend
                        </SubmitButton>
                      </form>
                      <ConfirmForm action={cancelTeamInvite} hidden={{ id: i.id }} variant="ghost" message={`Cancel the invitation to ${i.email}? The link in their email stops working.`}>
                        <span className="text-xs text-rose-600">Cancel</span>
                      </ConfirmForm>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {admin ? (
          <>
            <form action={inviteTeamMember} className="flex flex-wrap items-center gap-1.5 border-t border-slate-100 px-4 py-2.5">
              <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                <Plus className="h-3.5 w-3.5" /> Invite someone
              </span>
              <input name="email" type="email" required placeholder="Email" aria-label="Email" className={cn(box, "!w-52")} />
              <input name="name" placeholder="Name" aria-label="Name" className={cn(box, "!w-36")} />
              <select name="position" aria-label="Position" defaultValue={staffPos ? `pos:${staffPos.id}` : "ADMIN"} className={cn(box, "!w-auto")}>
                <option value="ADMIN">Admin</option>
                {positions.map((p) => (
                  <option key={p.id} value={`pos:${p.id}`}>
                    {p.name}
                  </option>
                ))}
              </select>
              <SubmitButton size="sm" className={small} pendingText="Sending…">
                Send invite
              </SubmitButton>
              <span className="w-full text-xs text-slate-400">They get an email with a link to choose their own password (good for 7 days).</span>
            </form>
            <details className="border-t border-slate-100 px-4 py-2.5">
              <summary className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-blue-700 [&::-webkit-details-marker]:hidden">
                <Plus className="h-3.5 w-3.5" /> Add someone who doesn&apos;t sign in (crew on the schedule or time clock)
              </summary>
              <form action={addNoLoginMember} className="mt-2 flex flex-wrap items-center gap-1.5">
                <input name="name" required placeholder="Name" aria-label="Name" className={cn(box, "!w-44")} />
                <input name="title" placeholder="Framer" aria-label="Title" className={cn(box, "!w-32")} />
                <input name="phone" type="tel" placeholder="Phone" aria-label="Phone" className={cn(box, "!w-32")} />
                <SubmitButton size="sm" variant="secondary" className={small}>
                  Add and open
                </SubmitButton>
              </form>
            </details>
          </>
        ) : null}
      </section>
    </div>
  );
}

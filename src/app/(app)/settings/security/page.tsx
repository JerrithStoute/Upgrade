import Link from "@/components/link";
import { ShieldCheck, Users } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { companyClock } from "@/lib/company-zone";
import { Badge, EmptyState, SubmitButton } from "@/components/ui";
import { setRequireTwoStep } from "./actions";

export const metadata = { title: "Security" };

/**
 * Settings → Security: company-wide sign-in rules, the client portal logins, and the security log. (Your team —
 * inviting, positions, each person's access — is in Directory → Team.)
 */
export default async function SecuritySettingsPage() {
  await requireAdmin();
  const { dateTime } = await companyClock();
  const [company, clients, securityLog] = await Promise.all([
    db.company.findFirstOrThrow({ select: { requireTwoStep: true } }),
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
  const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
  const head = "border-b border-slate-100 px-4 py-2.5";

  return (
    <div className="max-w-5xl space-y-4">
      <p className="text-sm text-slate-600">
        Your team — inviting people, positions and what each person sees — is in{" "}
        <Link href="/team" className="font-medium text-blue-700 hover:underline">
          Directory → Team
        </Link>
        .
      </p>

      <section className={card}>
        <header className={`${head} flex flex-wrap items-center justify-between gap-2`}>
          <div>
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
              <ShieldCheck className="h-4 w-4 text-slate-400" /> Two-step sign-in for the team
            </h2>
            <p className="text-xs text-slate-500">
              {company.requireTwoStep
                ? "Required: everyone on the team signs in with a code from an authenticator app. Anyone without it sets it up at their next sign-in."
                : "Optional: each person can turn it on under Your account. Require it to protect the whole company if a password leaks."}
            </p>
          </div>
          <form action={setRequireTwoStep}>
            <input type="hidden" name="on" value={company.requireTwoStep ? "" : "on"} />
            <SubmitButton size="sm" variant={company.requireTwoStep ? "ghost" : "secondary"} className="!h-7 !px-2.5 !text-xs">
              {company.requireTwoStep ? "Stop requiring it" : "Require it"}
            </SubmitButton>
          </form>
        </header>
      </section>

      <section className={card}>
        <header className={head}>
          <h2 className="text-sm font-semibold text-slate-900">Client portal logins</h2>
          <p className="text-xs text-slate-500">Made and managed from each client&apos;s page.</p>
        </header>
        {clients.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Users} title="No client logins" description="Client portal accounts are created from a client's page." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Name</th>
                  <th className="px-2 py-2 font-medium">Email</th>
                  <th className="px-2 py-2 font-medium">Client</th>
                  <th className="px-2 py-2 font-medium">Projects</th>
                  <th className="px-2 py-2 font-medium">Active</th>
                  <th className="px-4 py-2 font-medium">Since</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {clients.map((u) => (
                  <tr key={u.id}>
                    <td className="px-4 py-2 font-medium text-slate-900">{u.name}</td>
                    <td className="px-2 py-2 text-slate-600">{u.email}</td>
                    <td className="px-2 py-2">
                      {u.client ? (
                        <Link href={`/clients/${u.client.id}`} className="text-blue-700 hover:underline">
                          {u.client.firstName} {u.client.lastName}
                          {u.client.company ? ` · ${u.client.company}` : ""}
                        </Link>
                      ) : (
                        <span className="text-amber-700">Not linked to a client</span>
                      )}
                    </td>
                    <td className="px-2 py-2">{u.client?._count.projects ?? 0}</td>
                    <td className="px-2 py-2">
                      <Badge className={u.active ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : undefined}>{u.active ? "Active" : "Inactive"}</Badge>
                    </td>
                    <td className="px-4 py-2 text-slate-500">{fmtDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={card}>
        <header className={head}>
          <h2 className="text-sm font-semibold text-slate-900">Security log</h2>
          <p className="text-xs text-slate-500">Sign-ins, wrong passwords and codes, and changes to logins — the latest 100.</p>
        </header>
        {securityLog.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">Nothing yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                {securityLog.map((e) => (
                  <tr key={e.id}>
                    <td className="w-48 whitespace-nowrap px-4 py-1.5 text-slate-500">{dateTime(e.createdAt)}</td>
                    <td className={`px-2 py-1.5 ${e.type === "security.failed" ? "font-medium text-amber-800" : "text-slate-700"}`}>{e.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

import { CheckCircle2, ChevronDown } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyPositions } from "@/lib/positions";
import { NOTIFY_DEFS, ROLES, readRules, type Audience } from "@/lib/notify-rules";
import { cn } from "@/lib/utils";
import { ConfirmForm, SubmitButton } from "@/components/ui";
import { WhoPicker } from "@/components/who-picker";
import { allNotifyOff, saveNotifyRule } from "./actions";

export const metadata = { title: "Email notifications" };

const GROUPS: { audience: Audience; title: string; note: string }[] = [
  { audience: "team", title: "To your team", note: "Pick who gets each one: someone worked out each time (the job's manager…), whole positions, or people by name." },
  { audience: "sub", title: "To your subs", note: "Nothing goes to a sub by itself unless you turn it on here." },
  { audience: "client", title: "To your clients", note: "Reminders and updates to your clients, as things happen." },
];

/**
 * Every email the program sends by itself, each the builder's choice: on or off, and who gets it. (Emails
 * someone sends with a button — a PO, a bid, a proposal — aren't here: they go when you send them.)
 */
export default async function NotificationSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  await requireAdmin();
  const { saved } = await searchParams;
  const [company, positions, people] = await Promise.all([
    db.company.findFirst({ select: { notifyRules: true } }),
    companyPositions(),
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "STAFF"] } }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true } }),
  ]);
  const { rules, legacy } = readRules(company?.notifyRules);
  const posName = new Map(positions.map((p) => [p.id, p.name]));
  const personName = new Map(people.map((p) => [p.id, p.name]));
  const roleName = new Map(Object.values(ROLES).map((r) => [r.key, r.label]));
  const whoText = (to: string[]) =>
    to
      .map((w) => {
        const [kind, id] = w.split(":");
        return kind === "role" ? roleName.get(id) : kind === "pos" ? posName.get(id) : personName.get(id);
      })
      .filter(Boolean)
      .join(", ");
  const anyOn = Object.values(rules).some((r) => r.on);

  return (
    <div className="max-w-4xl space-y-5">
      {saved ? (
        <p className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> {saved === "all" ? "Every automatic email is off." : "Saved."}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-2xl text-sm text-slate-600">
          Nothing is emailed by itself unless you turn it on. Emails you send with a button (a PO, a bid, a proposal) aren&apos;t here — they go when you send them.
          {legacy ? " These are set the way they've been working so far — change any of them." : ""} Phone notifications follow the same choices.
        </p>
        {anyOn ? (
          <ConfirmForm action={allNotifyOff} message="Turn every automatic email off? You can turn each back on here." variant="secondary">
            Turn them all off
          </ConfirmForm>
        ) : null}
      </div>

      {GROUPS.map((g) => (
        <section key={g.audience} className="space-y-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">{g.title}</h2>
            <p className="text-xs text-slate-500">{g.note}</p>
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
            {NOTIFY_DEFS.filter((d) => d.audience === g.audience).map((d) => {
              const rule = rules[d.key];
              const who = g.audience === "team" ? whoText(rule.to) : "";
              return (
                <li key={d.key} id={d.key} className="scroll-mt-24">
                  <details className="group" open={saved === d.key}>
                    <summary className="flex cursor-pointer select-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
                      <span className={cn("w-10 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-semibold", rule.on ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500")}>
                        {rule.on ? "On" : "Off"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900">{d.label}</span>
                        <span className="block truncate text-xs text-slate-500">{rule.on && who ? `To: ${who}` : d.about}</span>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
                    </summary>
                    <form action={saveNotifyRule} className="space-y-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                      <input type="hidden" name="key" value={d.key} />
                      <p className="text-xs text-slate-500">{d.about}</p>
                      <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                        <input type="checkbox" name="on" defaultChecked={rule.on} className="h-4 w-4 rounded border-slate-300" />
                        Send it
                      </label>
                      {g.audience === "team" ? (
                        <div className="space-y-1">
                          <p className="text-xs font-medium text-slate-600">Who gets it</p>
                          <WhoPicker idPrefix={d.key} roles={d.roles} positions={positions} people={people} value={rule.to} />
                        </div>
                      ) : null}
                      <SubmitButton size="sm">Save</SubmitButton>
                    </form>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

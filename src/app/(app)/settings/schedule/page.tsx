import Link from "next/link";
import { Trash2 } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { DAY_NAMES, parseWorkDays } from "@/lib/workdays";
import { Card, CardBody, CardHeader, SubmitButton } from "@/components/ui";
import { addDelayReason, deleteDelayReason, renameDelayReason, saveWorkDays } from "./actions";

export const metadata = { title: "Schedule settings" };

const COMMON = ["Rain / weather", "Inspection", "Material late", "Sub no-show", "Client change", "Holiday", "Other"];

/** Your work week (schedules count these days) and the reasons a job gets delayed. */
export default async function ScheduleSettingsPage() {
  await requireAdmin();
  const [company, reasons] = await Promise.all([
    db.company.findFirst({ select: { workDays: true } }),
    db.delayReason.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
  ]);
  const days = parseWorkDays(company?.workDays);
  const have = new Set(reasons.map((r) => r.name.trim().toLowerCase()));
  const suggestions = COMMON.filter((c) => !have.has(c.toLowerCase()));
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Work week" description="The days your crews work. Task lengths count these days, and schedules skip the rest — and the holidays on the calendar." />
        <CardBody>
          <form action={saveWorkDays} className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {/* Monday first, the way a work week reads. */}
              {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                <label
                  key={d}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 has-[:checked]:border-blue-300 has-[:checked]:bg-blue-50"
                >
                  <input type="checkbox" name="day" value={d} defaultChecked={days.includes(d)} className="h-4 w-4 rounded border-slate-300" />
                  {DAY_NAMES[d]}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <SubmitButton size="sm">Save work week</SubmitButton>
              <span className="text-xs text-slate-500">
                Dates already on schedules stay; new tasks, templates, moves and delays use it. Holidays go on the{" "}
                <Link href="/schedule/calendar" className="text-blue-700 hover:underline">
                  calendar
                </Link>
                .
              </span>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Delay reasons" description="The list you pick from when you delay a job. Delays already logged keep their reason." />
        <CardBody className="space-y-3">
          {reasons.length === 0 ? <p className="text-sm text-slate-600">No reasons yet — click the ones you use below, or add your own.</p> : null}
          {reasons.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {reasons.map((r) => (
                <li key={r.id} className="flex items-center gap-2 px-3 py-1.5">
                  <form action={renameDelayReason} className="flex flex-1 items-center gap-2">
                    <input type="hidden" name="id" value={r.id} />
                    <input name="name" defaultValue={r.name} className="input !h-8 !py-0 text-sm" aria-label="Reason" />
                    <SubmitButton size="sm" variant="ghost">
                      Rename
                    </SubmitButton>
                  </form>
                  <form action={deleteDelayReason}>
                    <input type="hidden" name="id" value={r.id} />
                    <button type="submit" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${r.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          ) : null}
          {/* Common reasons you haven't added yet stay offered — adding one only takes that one off. */}
          {suggestions.length ? (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              Common reasons:
              {suggestions.map((c) => (
                <form key={c} action={addDelayReason}>
                  <input type="hidden" name="name" value={c} />
                  <button type="submit" className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    + {c}
                  </button>
                </form>
              ))}
            </div>
          ) : null}
          <form action={addDelayReason} className="flex items-center gap-2">
            <input name="name" required placeholder="Add a reason, e.g. Utility locate" className="input !h-9 max-w-xs" aria-label="New reason" />
            <SubmitButton size="sm" variant="secondary">
              Add
            </SubmitButton>
          </form>
        </CardBody>
      </Card>

      <p className="text-sm text-slate-600">
        Schedule templates are under{" "}
        <Link href="/settings/schedule-templates" className="font-medium text-blue-700 hover:underline">
          Schedule templates
        </Link>
        .
      </p>
    </div>
  );
}

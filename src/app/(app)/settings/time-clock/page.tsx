import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { runAsCompany } from "@/lib/tenant";
import { findMissingSites } from "@/lib/job-site";
import { timeRules } from "@/lib/time-clock";
import { DAYS } from "@/lib/time-rules";
import { costWeek, fmtHours } from "@/lib/time-math";
import { Card, CardBody, CardHeader, Field, SubmitButton } from "@/components/ui";
import { money } from "@/lib/utils";
import { saveTimePay, saveTimeRules } from "./actions";

export const metadata = { title: "Time clock" };

/** A box + a number on one line: "☑ Weekly overtime after [40] hours". */
function Limit({
  name,
  label,
  value,
  after,
  min = 1,
  max = 168,
  step = "0.5",
}: {
  name: string;
  label: string;
  value: number | null;
  after: string;
  min?: number;
  max?: number;
  step?: string;
}) {
  return (
    <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" name={`${name}On`} defaultChecked={value != null} className="h-4 w-4 rounded border-slate-300" />
      {label}
      <input type="number" name={name} min={min} max={max} step={step} defaultValue={value ?? ""} className="input !h-8 !w-20 !py-0 text-right" aria-label={label} />
      {after}
    </label>
  );
}

/** Settings → Time clock: how hours and overtime count, rounding, lunch, long shifts, job sites — and pay. */
export default async function TimeClockSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const admin = await requireAdmin();
  const { saved } = await searchParams;
  const [rules, company, people] = await Promise.all([
    timeRules(),
    db.company.findFirst({ select: { laborBurden: true } }),
    db.user.findMany({
      where: { active: true, role: { in: ["ADMIN", "STAFF", "SUB"] } },
      select: { id: true, name: true, title: true, payRate: true, salaried: true },
      orderBy: { name: "asc" },
    }),
  ]);
  // Jobs from before sites were checked get theirs found, in the background.
  void runAsCompany(admin.companyId, () => findMissingSites()).catch(() => {});

  // What the overtime rules make of a long day — worked out by the same math as the Budget.
  const day = new Date(2026, 0, 6, 7);
  const sample = costWeek(
    [{ id: "x", userId: "x", projectId: "", costCodeId: null, rate: 20, clockIn: day, clockOut: new Date(day.getTime() + 12 * 3_600_000), breakMinutes: 0 }],
    new Map([["x", { salaried: false, rate: 20 }]]),
    { ...rules, rounding: 0, lunchMinutes: 0 },
  ).get("x")!;
  const h = (n: number) => fmtHours(n, rules.hoursFormat);

  return (
    <div className="space-y-6">
      {saved ? (
        <p className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {saved === "pay" ? "Saved — new time uses these rates." : "Saved. Labor on the Budget is being worked out again by these rules."}
        </p>
      ) : null}
      <form action={saveTimeRules} className="space-y-6">
        <Card>
          <CardHeader title="Week & hours" />
          <CardBody className="flex flex-wrap gap-6">
            <Field label="Work week starts on" htmlFor="tc-week">
              <select id="tc-week" name="weekStart" className="input" defaultValue={rules.weekStart}>
                {DAYS.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <fieldset>
              <legend className="label">Show hours as</legend>
              <div className="flex gap-4 pt-1.5 text-sm text-slate-700">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="hoursFormat" value="DECIMAL" defaultChecked={rules.hoursFormat === "DECIMAL"} className="h-4 w-4" /> 7.5 hrs
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="hoursFormat" value="CLOCK" defaultChecked={rules.hoursFormat === "CLOCK"} className="h-4 w-4" /> 7:30 hrs
                </label>
              </div>
            </fieldset>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Overtime" description="For hourly people — salaried people never get overtime. Turn on whichever your state needs." />
          <CardBody className="grid gap-6 lg:grid-cols-[1fr_20rem]">
            <div className="space-y-3">
              <Limit name="weeklyAfter" label="Weekly overtime after" value={rules.weeklyAfter} after="hours in a week" />
              <Limit name="dailyAfter" label="Daily overtime after" value={rules.dailyAfter} after="hours in a day" />
              <Limit name="doubleAfter" label="Double time after" value={rules.doubleAfter} after="hours in a day" />
              <div className="flex flex-wrap gap-6 pt-2">
                <Field label="Overtime pays" htmlFor="tc-ot">
                  <span className="flex items-center gap-2 text-sm text-slate-600">
                    <input id="tc-ot" type="number" name="overtimeTimes" min={1} max={5} step="0.05" defaultValue={rules.overtimeTimes} className="input !w-20 text-right" />× pay
                  </span>
                </Field>
                <Field label="Double time pays" htmlFor="tc-dt">
                  <span className="flex items-center gap-2 text-sm text-slate-600">
                    <input id="tc-dt" type="number" name="doubleTimes" min={1} max={5} step="0.05" defaultValue={rules.doubleTimes} className="input !w-20 text-right" />× pay
                  </span>
                </Field>
              </div>
              <p className="text-xs text-slate-500">Hours already overtime for the day don&apos;t count again toward the week. Job costs include the extra pay.</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">With these settings, one 12-hour day at $20/hr:</p>
              <p className="mt-2 tabular-nums">
                {h(sample.hours - sample.overtime - sample.double)} regular · {h(sample.overtime)} overtime · {h(sample.double)} double time
              </p>
              <p className="mt-1 tabular-nums">
                Costs <span className="font-semibold">{money(sample.cost)}</span> ({money(12 * 20)} with no overtime)
              </p>
              <p className="mt-2 text-xs text-slate-500">Save to update this.</p>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Rounding" />
          <CardBody className="space-y-3">
            <Field label="Count punches to the nearest" htmlFor="tc-round">
              <select id="tc-round" name="rounding" className="input !w-56" defaultValue={rules.rounding}>
                <option value={0}>Don&apos;t round (as punched)</option>
                <option value={5}>5 minutes</option>
                <option value={6}>6 minutes (tenth of an hour)</option>
                <option value={15}>15 minutes</option>
              </select>
            </Field>
            <p className="text-xs text-slate-500">
              7:52 → 7:45 and 7:53 → 8:00 with 15 minutes. Timesheets still show the real punch times; only the hours counted change. Rounding has to come out even for workers over
              time — check your state&apos;s labor rules before you use it.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Lunch & long shifts" />
          <CardBody className="space-y-3">
            <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="lunchOn" defaultChecked={rules.lunchMinutes > 0} className="h-4 w-4 rounded border-slate-300" />
              Take out a
              <input
                type="number"
                name="lunchMinutes"
                min={5}
                max={120}
                step={5}
                defaultValue={rules.lunchMinutes || 30}
                className="input !h-8 !w-16 !py-0 text-right"
                aria-label="Lunch minutes"
              />
              minute lunch on shifts longer than
              <input
                type="number"
                name="lunchAfter"
                min={1}
                max={24}
                step="0.5"
                defaultValue={rules.lunchAfter}
                className="input !h-8 !w-16 !py-0 text-right"
                aria-label="Lunch after hours"
              />
              hours
            </label>
            <p className="-mt-1 pl-6 text-xs text-slate-500">Only when no break was typed in for that time.</p>
            <Limit name="longShiftHours" label="Email the person, and whoever fixes time, after" value={rules.longShiftHours} after="hours on the clock" min={4} max={24} />
            <p className="-mt-1 pl-6 text-xs text-slate-500">Once per shift — it catches a forgotten clock-out the same day.</p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Job sites" description="Each job's spot on the map comes from its address (or from a phone at the site — on the job's Edit page)." />
          <CardBody className="space-y-2">
            <label className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
              Flag a punch as off site when it&apos;s more than
              <input
                type="number"
                name="siteFeet"
                min={100}
                max={5280}
                step={50}
                defaultValue={rules.siteFeet}
                className="input !h-8 !w-24 !py-0 text-right"
                aria-label="Feet from the job"
              />
              feet from the job
            </label>
            <p className="text-xs text-slate-500">
              Flagged on Timesheets, never blocked. A phone&apos;s location can be off by a lot indoors, so a punch is only flagged when it&apos;s that far even allowing for how
              sure the phone was.
            </p>
          </CardBody>
        </Card>

        <SubmitButton>Save</SubmitButton>
      </form>

      <div id="pay" className="scroll-mt-24">
        <Card>
          <CardHeader title="Pay" description="Each person's pay per hour, for job costs. New time uses these; time already worked keeps the rate it was worked at." />
          <form action={saveTimePay}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Person</th>
                  <th className="px-4 py-2 text-left font-medium">Pay / hr</th>
                  <th className="px-4 py-2 text-left font-medium">Salaried (no overtime)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {people.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2">
                      <span className="font-medium text-slate-900">{p.name}</span>
                      {p.title ? <span className="block text-xs text-slate-500">{p.title}</span> : null}
                    </td>
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-1 text-slate-500">
                        $
                        <input
                          type="number"
                          name={`pay_${p.id}`}
                          min={0}
                          step="0.01"
                          defaultValue={p.payRate ?? ""}
                          placeholder="—"
                          className="input !h-8 !w-24 !py-0 text-right"
                          aria-label={`Pay per hour for ${p.name}`}
                        />
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="checkbox"
                        name={`salaried_${p.id}`}
                        defaultChecked={p.salaried}
                        className="h-4 w-4 rounded border-slate-300"
                        aria-label={`${p.name} is salaried`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex flex-wrap items-end gap-4 border-t border-slate-200 p-4">
              <Field label="Labor burden %" htmlFor="tc-burden" hint="Payroll taxes, workers' comp, insurance — added to everyone's pay for job costs.">
                <input id="tc-burden" type="number" name="laborBurden" min={0} max={200} step="0.5" className="input !w-28" defaultValue={company?.laborBurden ?? 0} />
              </Field>
              <SubmitButton>Save pay</SubmitButton>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}

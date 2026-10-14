import Link from "@/components/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, MapPin, MapPinOff, Pencil, Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageTime, laborBurden, weekOf } from "@/lib/time-clock";
import { overtimeSentence, siteCheck } from "@/lib/time-rules";
import { costWeek, entryHours, fmtHours, loadedRate, looksForgotten, nextWeek, parseWeek, weekDays, weekKey, type Person } from "@/lib/time-math";
import { zoneLabel } from "@/lib/zone";
import { ButtonLink, Card, CardBody, CardHeader, ConfirmForm, Field, PageHeader, SubmitButton } from "@/components/ui";
import { fmtFeet } from "@/lib/utils";
import { cn, dateInput, money } from "@/lib/utils";
import { clockOutFor, deleteTimeEntry, saveTimeEntry } from "../actions";

export const metadata = { title: "Timesheets" };

const timeOf = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const hhmm = (d: Date | null) => (d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "");
const codeLabel = (c: { code: string | null; name: string }) => (c.code ? `${c.code} ${c.name}` : c.name);

/**
 * Where the phone was at a punch: a pin that opens the spot on a map. Only on Timesheets (people
 * who manage time). Surely farther from the job site than Settings → Time clock allows: "off site".
 */
function Pin({ lat, lng, accuracy, what, check }: { lat: number | null; lng: number | null; accuracy: number | null; what: string; check: { feet: number; offSite: boolean } | null }) {
  if (lat === null || lng === null) return null;
  const off = check?.offSite;
  return (
    <a
      href={`https://www.google.com/maps?q=${lat},${lng}`}
      target="_blank"
      rel="noopener noreferrer"
      title={`${what} here${accuracy ? ` (within about ${Math.round(accuracy * 3.28084)} ft)` : ""}${check ? ` — ${fmtFeet(check.feet)} from the job site` : ""} — opens a map`}
      aria-label={`${what} location on a map${off ? " (off site)" : ""}`}
      className={cn("ml-0.5 inline-flex items-center gap-0.5 align-middle", off ? "text-amber-600 hover:text-amber-800" : "text-blue-600 hover:text-blue-800")}
    >
      <MapPin className="h-3.5 w-3.5" />
      {off ? <span className="rounded bg-amber-50 px-1 text-[10px] font-semibold uppercase text-amber-800 ring-1 ring-inset ring-amber-200">off site</span> : null}
    </a>
  );
}

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string; edit?: string; add?: string }> }) {
  const user = await requireStaff();
  if (!canManageTime(user)) redirect("/time");
  const sp = await searchParams;
  const now = new Date();
  // Days, weeks and times on the company's clock.
  const { key, monday, from, to, clock, rules, dayOf } = await weekOf(parseWeek(sp.week) ? sp.week! : now);
  const hrs = (h: number) => fmtHours(h, rules.hoursFormat);
  // Labor dollars and pay only for someone whose position sees costs and profit.
  const seesCosts = user.access.costs;
  const at = (punch: { lat: number | null; lng: number | null; accuracy: number | null }, job: { siteLat: number | null; siteLng: number | null }) =>
    siteCheck(punch, { lat: job.siteLat, lng: job.siteLng }, rules.siteFeet);
  const { wall } = clock;
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  const [entries, staff, burden, projects, costCodes, forgotten] = await Promise.all([
    db.timeEntry.findMany({
      where: { clockIn: { gte: from, lt: to } },
      orderBy: { clockIn: "asc" },
      include: {
        user: { select: { id: true, name: true, payRate: true, salaried: true } },
        project: { select: { id: true, number: true, name: true, siteLat: true, siteLng: true } },
        costCode: { select: { code: true, name: true } },
        editedBy: { select: { name: true } },
      },
    }),
    db.user.findMany({ where: { active: true, role: { in: ["ADMIN", "STAFF"] } }, select: { id: true, name: true, payRate: true, salaried: true }, orderBy: { name: "asc" } }),
    laborBurden(),
    db.project.findMany({ where: { status: { not: "CANCELLED" } }, select: { id: true, number: true, name: true }, orderBy: { number: "desc" } }),
    db.costCode.findMany({
      where: { active: true },
      select: { id: true, code: true, name: true, division: true },
      orderBy: [{ division: "asc" }, { sortOrder: "asc" }, { code: "asc" }],
    }),
    db.timeEntry.findMany({
      where: { clockOut: null },
      include: { user: { select: { name: true } }, project: { select: { number: true, name: true } } },
      orderBy: { clockIn: "asc" },
    }),
  ]);
  const stuck = forgotten.filter((e) => looksForgotten(e, now, rules.longShiftHours ?? 14));

  const finished = entries.filter((e) => e.clockOut);
  const people = new Map<string, Person>([...staff, ...entries.map((e) => e.user)].map((u) => [u.id, { salaried: u.salaried, rate: loadedRate(u.payRate, burden) }]));
  const costed = costWeek(finished, people, rules, dayOf);
  const ids = [...new Set([...entries.map((e) => e.userId), ...staff.map((s) => s.id)])];
  const nameOf = new Map([...staff, ...entries.map((e) => e.user)].map((u) => [u.id, u.name]));
  const rows = ids
    .map((id) => {
      const list = entries.filter((e) => e.userId === id);
      const hours = list.reduce((n, e) => n + entryHours(e, now, rules), 0);
      const overtime = list.reduce((n, e) => n + (costed.get(e.id)?.overtime ?? 0) + (costed.get(e.id)?.double ?? 0), 0);
      const cost = list.reduce((n, e) => n + (costed.get(e.id)?.cost ?? 0), 0);
      return { id, name: nameOf.get(id) ?? "?", list, hours, overtime, cost, person: people.get(id) };
    })
    .sort((a, b) => Number(b.list.length > 0) - Number(a.list.length > 0) || a.name.localeCompare(b.name));
  const totals = rows.reduce((t, r) => ({ hours: t.hours + r.hours, overtime: t.overtime + r.overtime, cost: t.cost + r.cost }), { hours: 0, overtime: 0, cost: 0 });
  const noRate = rows.filter((r) => r.list.length && r.person?.rate == null);

  const base = `/time/sheets?week=${key}`;
  const editing = sp.edit ? entries.find((e) => e.id === sp.edit) : undefined;
  const adding = sp.add !== undefined;
  const range = `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const thisWeek = key === weekKey(clock.now, rules.weekStart);
  const divisions = [...new Set(costCodes.map((c) => c.division))];

  const entryForm = (e?: (typeof entries)[number]) => (
    <form action={saveTimeEntry} className="space-y-4">
      <input type="hidden" name="id" value={e?.id ?? ""} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        {e ? (
          <input type="hidden" name="userId" value={e.userId} />
        ) : (
          <Field label="Person" htmlFor="te-user" className="col-span-2">
            <select id="te-user" name="userId" className="input" required defaultValue={sp.add || ""}>
              <option value="">— Pick —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Job" htmlFor="te-job" className={cn("col-span-2", e && "md:col-span-3")}>
          <select id="te-job" name="projectId" className="input" required defaultValue={e?.projectId ?? ""}>
            <option value="">— Pick —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                #{p.number} {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Cost code" htmlFor="te-code" className={cn("col-span-2", e && "md:col-span-3")}>
          <select id="te-code" name="costCodeId" className="input" defaultValue={e?.costCodeId ?? ""}>
            <option value="">— None —</option>
            {divisions.map((d) => (
              <optgroup key={d} label={d}>
                {costCodes
                  .filter((c) => c.division === d)
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {codeLabel(c)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="Day" htmlFor="te-date" className="col-span-2">
          <input id="te-date" type="date" name="date" className="input" required defaultValue={dateInput(e ? wall(e.clockIn) : thisWeek ? clock.now : monday)} />
        </Field>
        <Field label="Started" htmlFor="te-in">
          <input id="te-in" type="time" name="in" className="input" required defaultValue={e ? hhmm(wall(e.clockIn)) : "07:00"} />
        </Field>
        <Field label="Stopped" htmlFor="te-out" hint={e && !e.clockOut ? "Blank = still on the clock" : undefined}>
          <input id="te-out" type="time" name="out" className="input" defaultValue={e ? hhmm(e.clockOut ? wall(e.clockOut) : null) : "15:30"} />
        </Field>
        <Field label="Break (min)" htmlFor="te-break">
          <input id="te-break" type="number" min={0} step={5} name="breakMinutes" className="input" defaultValue={e?.breakMinutes ?? 30} />
        </Field>
        <Field label="Note" htmlFor="te-notes" className="col-span-2 md:col-span-1">
          <input id="te-notes" name="notes" className="input" defaultValue={e?.notes ?? ""} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton>{e ? "Save" : "Add time"}</SubmitButton>
        <ButtonLink href={base} variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Time clock", href: "/time" }, { label: "Timesheets" }]}
        title="Timesheets"
        description={`Everyone's time, by week (${zoneLabel(clock.zone)} time). ${overtimeSentence(rules)} Each job's labor posts to its Budget by cost code.`}
        actions={
          <>
            <ButtonLink href={`${base}&add=`} variant="secondary" size="sm">
              <Plus className="h-3.5 w-3.5" /> Add time
            </ButtonLink>
            <a href={`/time/sheets/export?week=${key}`} className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline">
              <Download className="h-4 w-4" /> Download for payroll
            </a>
          </>
        }
      />

      {stuck.length ? (
        <Card className="border-amber-300">
          <CardHeader title="Still on the clock — forgot to clock out?" description="On the clock more than 14 hours. Put in when they really stopped." />
          <CardBody className="space-y-2">
            {stuck.map((e) => (
              <form key={e.id} action={clockOutFor} className="flex flex-wrap items-center gap-2 text-sm">
                <input type="hidden" name="id" value={e.id} />
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="font-medium text-slate-900">{e.user.name}</span>
                <span className="text-slate-500">
                  #{e.project.number} {e.project.name} · since {wall(e.clockIn).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} {timeOf(wall(e.clockIn))}
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <label className="text-xs text-slate-500" htmlFor={`out-${e.id}`}>
                    Stopped at
                  </label>
                  <input id={`out-${e.id}`} type="time" name="out" defaultValue="15:30" className="input w-32" required />
                  <SubmitButton size="sm">Clock out</SubmitButton>
                </span>
              </form>
            ))}
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <ButtonLink href={`/time/sheets?week=${weekKey(nextWeek(monday, -1), rules.weekStart)}`} variant="secondary" size="sm" aria-label="Week before">
          <ChevronLeft className="h-4 w-4" />
        </ButtonLink>
        <span className="min-w-48 text-center text-sm font-semibold text-slate-900">{range}</span>
        <ButtonLink href={`/time/sheets?week=${weekKey(nextWeek(monday), rules.weekStart)}`} variant="secondary" size="sm" aria-label="Week after">
          <ChevronRight className="h-4 w-4" />
        </ButtonLink>
        {!thisWeek ? (
          <Link href="/time/sheets" className="text-xs font-medium text-blue-700 hover:underline">
            This week
          </Link>
        ) : null}
        <span className="ml-auto text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{hrs(totals.hours)}</span> hrs
          {totals.overtime > 0.004 ? <> · {hrs(totals.overtime)} overtime</> : null}
          {seesCosts ? (
            <>
              {" "}
              · <span className="font-semibold text-slate-900">{money(totals.cost)}</span> labor
            </>
          ) : null}
        </span>
      </div>

      {adding ? (
        <Card>
          <CardHeader title="Add time" description="Time someone worked but didn't clock (or a crew member without a phone)." />
          <CardBody>{entryForm()}</CardBody>
        </Card>
      ) : null}

      {seesCosts && noRate.length ? (
        <p className="rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          No pay rate for {noRate.map((r) => r.name).join(", ")} — their hours count, but cost nothing on the Budget until one is set in{" "}
          <Link href="/settings/time-clock#pay" className="font-medium underline">
            Settings → Time clock
          </Link>
          .
        </p>
      ) : null}

      {rows.map((r) => (
        <Card key={r.id}>
          <CardHeader
            title={r.name}
            description={
              r.list.length
                ? `${hrs(r.hours)} hrs${r.overtime > 0.004 ? ` · ${hrs(r.overtime)} overtime` : ""}${seesCosts && r.person?.rate != null ? ` · ${money(r.cost)}` : ""}${r.person?.salaried ? " · salaried" : ""}`
                : "No time this week"
            }
            actions={
              <Link href={`${base}&add=${r.id}`} className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline">
                <Plus className="h-3.5 w-3.5" /> Add
              </Link>
            }
          />
          {r.list.length ? (
            <ul className="divide-y divide-slate-100">
              {weekDays(monday).flatMap((d) =>
                r.list
                  .filter((e) => wall(e.clockIn).toDateString() === d.toDateString())
                  .map((e) => {
                    const c = costed.get(e.id);
                    const hours = entryHours(e, now, rules);
                    return (
                      <li key={e.id} className={cn("px-4 py-2.5 text-sm", editing?.id === e.id && "bg-blue-50/50")}>
                        {editing?.id === e.id ? (
                          <div className="space-y-3 py-1">
                            {entryForm(e)}
                            <ConfirmForm
                              action={deleteTimeEntry}
                              hidden={{ id: e.id }}
                              variant="ghost"
                              message={`Delete ${r.name}'s ${hrs(hours)} hours on ${d.toLocaleDateString("en-US", { weekday: "long" })}?`}
                            >
                              <span className="text-xs text-rose-600">Delete this time</span>
                            </ConfirmForm>
                          </div>
                        ) : (
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                            <span className="w-24 shrink-0 font-medium text-slate-700">{d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                            <span className="min-w-0 flex-1 text-slate-900">
                              #{e.project.number} {e.project.name}
                              <span className="text-slate-500">{e.costCode ? ` · ${codeLabel(e.costCode)}` : " · no cost code"}</span>
                              {e.notes ? <span className="block text-xs text-slate-500">{e.notes}</span> : null}
                            </span>
                            <span className="tabular-nums text-slate-600">
                              {timeOf(wall(e.clockIn))}
                              <Pin lat={e.inLat} lng={e.inLng} accuracy={e.inAccuracy} what="Clocked in" check={at({ lat: e.inLat, lng: e.inLng, accuracy: e.inAccuracy }, e.project)} /> –{" "}
                              {e.clockOut ? timeOf(wall(e.clockOut)) : <span className="font-medium text-emerald-700">on the clock</span>}
                              <Pin lat={e.outLat} lng={e.outLng} accuracy={e.outAccuracy} what="Clocked out" check={at({ lat: e.outLat, lng: e.outLng, accuracy: e.outAccuracy }, e.project)} />
                              {/* A real punch (not typed in by a manager) that came without a location says so. */}
                              {!e.editedBy && e.inLat === null && e.outLat === null ? (
                                <span title="No location came with this punch (not shared, or no signal)" className="ml-0.5 inline-flex align-middle text-slate-300">
                                  <MapPinOff className="h-3.5 w-3.5" aria-label="No location" />
                                </span>
                              ) : null}
                              {e.breakMinutes ? (
                                <span className="text-xs text-slate-400"> · {e.breakMinutes} min break</span>
                              ) : rules.lunchMinutes && entryHours(e, now, { ...rules, lunchMinutes: 0 }) > rules.lunchAfter ? (
                                <span className="text-xs text-slate-400" title="Settings → Time clock takes out a lunch on long shifts with no break typed in">
                                  {" "}
                                  · {rules.lunchMinutes} min lunch (automatic)
                                </span>
                              ) : null}
                            </span>
                            <span className="w-24 text-right tabular-nums font-medium text-slate-900">
                              {hrs(hours)} hrs
                              {c && c.overtime > 0.004 ? <span className="block text-[11px] font-normal text-amber-700">{hrs(c.overtime)} overtime</span> : null}
                              {c && c.double > 0.004 ? <span className="block text-[11px] font-normal text-rose-700">{hrs(c.double)} double time</span> : null}
                            </span>
                            <Link
                              href={`${base}&edit=${e.id}`}
                              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              title={e.editedBy ? `Fix this time (last changed by ${e.editedBy.name})` : "Fix this time"}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Link>
                          </div>
                        )}
                      </li>
                    );
                  }),
              )}
            </ul>
          ) : null}
        </Card>
      ))}

      <p className="text-xs text-slate-500">
        Overtime, rounding, lunch, the week{seesCosts ? `, pay rates and labor burden (${burden}%)` : ""} are set in{" "}
        <Link href="/settings/time-clock" className="font-medium text-blue-700 hover:underline">
          Settings → Time clock
        </Link>
        .
      </p>
    </div>
  );
}

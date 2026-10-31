import Link from "@/components/link";
import { Fragment } from "react";
import { redirect } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Download, MapPin, MapPinOff, Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { canManageTime, laborBurden, weekOf } from "@/lib/time-clock";
import { overtimeSentence, siteCheck } from "@/lib/time-rules";
import { costWeek, entryHours, fmtHours, loadedRate, looksForgotten, nextWeek, parseWeek, sameDay, weekDays, weekKey, type Person } from "@/lib/time-math";
import { zoneLabel } from "@/lib/zone";
import { ConfirmForm, SubmitButton } from "@/components/ui";
import { Tile } from "@/components/ui/tile";
import { fmtFeet } from "@/lib/utils";
import { cn, dateInput, money } from "@/lib/utils";
import { clockOutFor, deleteTimeEntry, saveTimeEntry } from "../actions";

export const metadata = { title: "Timesheets" };

const timeOf = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const hhmm = (d: Date | null) => (d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "");
const codeLabel = (c: { code: string | null; name: string }) => (c.code ? `${c.code} ${c.name}` : c.name);

const small = "!h-7 !px-2.5 !text-xs";
const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
const head = "flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5";
const editLink = "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700 hover:underline";
const plainBtn = "inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
const box = "input !h-8 !py-0 text-sm";

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
      {off ? <span className="rounded bg-amber-50 px-1 text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">off site</span> : null}
    </a>
  );
}

export default async function TimesheetsPage({ searchParams }: { searchParams: Promise<{ week?: string; edit?: string; add?: string; person?: string }> }) {
  const user = await requireStaff();
  if (!canManageTime(user)) redirect("/time");
  const sp = await searchParams;
  const now = new Date();
  // Days, weeks and times on the company's clock.
  const { key, monday, from, to, clock, rules, dayOf } = await weekOf(parseWeek(sp.week) ? sp.week! : now);
  const hrs = (h: number) => fmtHours(h, rules.hoursFormat);
  // Dollars here are people's pay (hours × their rate): admins only, whatever a position allows. A job's
  // labor total on its Budget is the place for everyone else who sees costs.
  const seesCosts = user.role === "ADMIN";
  const at = (punch: { lat: number | null; lng: number | null; accuracy: number | null }, job: { siteLat: number | null; siteLng: number | null }) =>
    siteCheck(punch, { lat: job.siteLat, lng: job.siteLng }, rules.siteFeet);
  const { wall } = clock;
  const days = weekDays(monday);
  const sunday = days[6];
  const [entries, staff, burden, projects, costCodes, onClock] = await Promise.all([
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
    db.project.findMany({ where: { status: { not: "CANCELLED" }, isTemplate: false }, select: { id: true, number: true, name: true }, orderBy: { number: "desc" } }),
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
  const stuck = onClock.filter((e) => looksForgotten(e, now, rules.longShiftHours ?? 14));

  const finished = entries.filter((e) => e.clockOut);
  const people = new Map<string, Person>([...staff, ...entries.map((e) => e.user)].map((u) => [u.id, { salaried: u.salaried, rate: loadedRate(u.payRate, burden) }]));
  const costed = costWeek(finished, people, rules, dayOf);
  const ids = [...new Set([...entries.map((e) => e.userId), ...staff.map((s) => s.id)])];
  const nameOf = new Map([...staff, ...entries.map((e) => e.user)].map((u) => [u.id, u.name]));
  const onDay = (list: typeof entries, d: Date) => list.filter((e) => sameDay(wall(e.clockIn), d));
  const rows = ids
    .map((id) => {
      const list = entries.filter((e) => e.userId === id);
      const hours = list.reduce((n, e) => n + entryHours(e, now, rules), 0);
      const overtime = list.reduce((n, e) => n + (costed.get(e.id)?.overtime ?? 0) + (costed.get(e.id)?.double ?? 0), 0);
      const cost = list.reduce((n, e) => n + (costed.get(e.id)?.cost ?? 0), 0);
      const byDay = days.map((d) => {
        const day = onDay(list, d);
        return { hours: day.reduce((n, e) => n + entryHours(e, now, rules), 0), running: day.some((e) => !e.clockOut) };
      });
      return { id, name: nameOf.get(id) ?? "?", list, hours, overtime, cost, byDay, person: people.get(id) };
    })
    .sort((a, b) => Number(b.list.length > 0) - Number(a.list.length > 0) || a.name.localeCompare(b.name));
  const totals = rows.reduce((t, r) => ({ hours: t.hours + r.hours, overtime: t.overtime + r.overtime, cost: t.cost + r.cost }), { hours: 0, overtime: 0, cost: 0 });
  const dayTotals = days.map((_, i) => rows.reduce((n, r) => n + r.byDay[i].hours, 0));
  const noRate = rows.filter((r) => r.list.length && r.person?.rate == null);

  const base = `/time/sheets?week=${key}`;
  const editing = sp.edit ? entries.find((e) => e.id === sp.edit) : undefined;
  // Whose punches are open: the one picked, or the one whose time is being fixed or added.
  const openId = editing?.userId ?? (sp.add ? sp.add : sp.person);
  const addingTop = sp.add === "";
  const range = `${monday.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${sunday.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const thisWeek = key === weekKey(clock.now, rules.weekStart);
  const divisions = [...new Set(costCodes.map((c) => c.division))];
  const cols = 9 + (seesCosts ? 1 : 0);
  const close = openId ? `${base}&person=${openId}` : base;

  // A punch as boxes, in the same order as its line: job · cost code, day, in – out, break, note.
  const entryForm = (e?: (typeof entries)[number], forId?: string) => (
    // Delete is its own form (forms can't sit inside each other), laid over the end of the button row.
    <div className="relative">
    <form action={saveTimeEntry} className="space-y-2">
      <input type="hidden" name="id" value={e?.id ?? ""} />
      {e || forId ? <input type="hidden" name="userId" value={e?.userId ?? forId} /> : null}
      <div className="flex flex-wrap items-center gap-1.5">
        {!e && !forId ? (
          <select name="userId" className={cn(box, "!w-44")} required defaultValue="" aria-label="Person">
            <option value="">— Who —</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null}
        <select name="projectId" className={cn(box, "!w-52")} required defaultValue={e?.projectId ?? ""} aria-label="Job">
          <option value="">— Job —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              #{p.number} {p.name}
            </option>
          ))}
        </select>
        <select name="costCodeId" className={cn(box, "!w-48")} defaultValue={e?.costCodeId ?? ""} aria-label="Cost code">
          <option value="">— No cost code —</option>
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
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
        <input type="date" name="date" className={cn(box, "!w-40")} required defaultValue={dateInput(e ? wall(e.clockIn) : thisWeek ? clock.now : monday)} aria-label="Day" />
        <span className="flex items-center gap-1 whitespace-nowrap">
          <input type="time" name="in" className={cn(box, "!w-32")} required defaultValue={e ? hhmm(wall(e.clockIn)) : "07:00"} aria-label="Started" />
          –
          <input type="time" name="out" className={cn(box, "!w-32")} defaultValue={e ? hhmm(e.clockOut ? wall(e.clockOut) : null) : "15:30"} aria-label="Stopped" />
        </span>
        <span className="flex items-center gap-1 whitespace-nowrap">
          <input type="number" min={0} step={5} name="breakMinutes" className={cn(box, "!w-20")} defaultValue={e?.breakMinutes ?? 30} aria-label="Break (min)" /> min break
        </span>
        <input name="notes" className={cn(box, "min-w-[10rem] flex-1")} defaultValue={e?.notes ?? ""} placeholder="Note" aria-label="Note" />
      </div>
      {e && !e.clockOut ? <p className="text-xs text-slate-500">Leave Stopped blank if they&apos;re still on the clock.</p> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/70 pt-2">
        <span className="flex gap-1.5">
          <SubmitButton size="sm" className={small} pendingText="Saving…">
            {e ? "Save" : "Add time"}
          </SubmitButton>
          <Link href={close} scroll={false} className={plainBtn}>
            Cancel
          </Link>
        </span>
      </div>
    </form>
        {e ? (
          <ConfirmForm
            action={deleteTimeEntry}
            hidden={{ id: e.id }}
            className="absolute bottom-0 right-0 [&_button]:!h-7 [&_button]:!px-2.5 [&_button]:!text-xs"
            message={`Delete ${nameOf.get(e.userId)}'s ${hrs(entryHours(e, now, rules))} hours on ${wall(e.clockIn).toLocaleDateString("en-US", { weekday: "long" })}?`}
          >
            Delete this time
          </ConfirmForm>
        ) : null}
    </div>
  );

  // The top of a form that's open: what it is, and a way out.
  const formHead = (title: string) => (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-sm font-semibold text-slate-900">{title}</span>
      <Link href={close} scroll={false} className={editLink}>
        Cancel
      </Link>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link href="/time" className="text-xs font-medium text-blue-700 hover:underline">
          ← Time clock
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <h1 className="mr-2 text-xl font-semibold text-slate-900">Timesheets</h1>
            <span className="flex items-center gap-1.5">
            <Link href={`/time/sheets?week=${weekKey(nextWeek(monday, -1), rules.weekStart)}`} className={plainBtn} aria-label="Week before">
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
            <span className="min-w-40 whitespace-nowrap text-center text-sm font-semibold text-slate-900">{range}</span>
            <Link href={`/time/sheets?week=${weekKey(nextWeek(monday), rules.weekStart)}`} className={plainBtn} aria-label="Week after">
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
            </span>
            {!thisWeek ? (
              <Link href="/time/sheets" className={cn(editLink, "ml-1")}>
                This week
              </Link>
            ) : null}
          </div>
          <div className="flex gap-1.5">
            <Link href={`${base}&add=`} scroll={false} className={plainBtn}>
              <Plus className="h-3.5 w-3.5" /> Add time
            </Link>
            <a href={`/time/sheets/export?week=${key}`} className={plainBtn}>
              <Download className="h-3.5 w-3.5" /> Download for payroll
            </a>
          </div>
        </div>
      </div>

      <div className={cn("grid grid-cols-2 gap-2", seesCosts ? "sm:grid-cols-4" : "sm:grid-cols-3")}>
        <Tile label="Hours" value={hrs(totals.hours)} />
        <Tile label="Overtime" value={hrs(totals.overtime)} tone={totals.overtime > 0.004 ? "warn" : undefined} />
        {seesCosts ? <Tile label="Labor" value={money(totals.cost)} /> : null}
        <Tile label="On the clock now" value={onClock.length} hint={onClock.length ? onClock.map((e) => e.user.name.split(" ")[0]).join(", ") : undefined} />
      </div>

      {stuck.map((e) => (
        <form
          key={e.id}
          action={clockOutFor}
          className="flex flex-wrap items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200"
        >
          <input type="hidden" name="id" value={e.id} />
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span className="min-w-[12rem] flex-1">
            <span className="font-medium">{e.user.name}</span> has been on the clock since{" "}
            {wall(e.clockIn).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} {timeOf(wall(e.clockIn))} (#{e.project.number} {e.project.name}) — forgot to
            clock out?
          </span>
          <span className="flex items-center gap-1.5">
            <label className="text-xs" htmlFor={`out-${e.id}`}>
              Stopped at
            </label>
            <input id={`out-${e.id}`} type="time" name="out" defaultValue="15:30" className={cn(box, "!w-32")} required />
            <SubmitButton size="sm" className={small}>
              Clock out
            </SubmitButton>
          </span>
        </form>
      ))}

      {seesCosts && noRate.length ? (
        <p className="text-xs text-amber-800">
          No pay rate for {noRate.map((r) => r.name).join(", ")} — their hours count, but cost nothing on the Budget until one is set in{" "}
          <Link href="/settings/time-clock#pay" className="font-medium underline">
            Settings → Time clock
          </Link>
          .
        </p>
      ) : null}

      {addingTop ? (
        <section className={cn(card, "px-4 py-3")}>
          {formHead("Add time")}
          <p className="mb-2 text-xs text-slate-500">Time someone worked but didn&apos;t clock (or a crew member without a phone).</p>
          {entryForm()}
        </section>
      ) : null}

      <section className={cn(card, "@container")}>
        <header className={head}>
          <h2 className="text-sm font-semibold text-slate-900">Everyone this week</h2>
          <span className="text-xs text-slate-500">Click a name to see their punches</span>
        </header>
        <div className="overflow-x-auto">
          <table className={cn("w-full text-sm tabular-nums", seesCosts ? "min-w-[44rem]" : "min-w-[38rem]")}>
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="px-4 py-2 text-left font-normal">Person</th>
                {days.map((d) => (
                  <th key={d.toISOString()} className={cn("px-2 py-2 text-right font-normal", sameDay(d, clock.now) && "font-semibold text-slate-900")}>
                    {d.toLocaleDateString("en-US", { weekday: "short" })} <span className="text-slate-400">{d.getDate()}</span>
                  </th>
                ))}
                <th className="px-2 py-2 text-right font-normal">Total</th>
                {seesCosts ? <th className="px-4 py-2 text-right font-normal">Labor</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const open = openId === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className={cn("border-b border-slate-100 hover:bg-slate-50", open && "bg-slate-50")}>
                      <td className="px-4 py-2">
                        <Link href={open ? base : `${base}&person=${r.id}`} scroll={false} className="flex items-center gap-1 font-medium text-slate-900 hover:text-blue-700">
                          <ChevronDown className={cn("h-3.5 w-3.5 text-slate-400 transition-transform", !open && "-rotate-90")} />
                          {r.name}
                        </Link>
                        {r.person?.salaried ? <span className="ml-5 block text-xs text-slate-400">salaried</span> : null}
                      </td>
                      {r.byDay.map((d, i) => (
                        <td key={i} className="px-2 py-2 text-right">
                          {d.running ? (
                            <span className="text-xs font-medium text-emerald-700">on the clock</span>
                          ) : d.hours ? (
                            hrs(d.hours)
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right">
                        {r.list.length ? <span className="font-semibold text-slate-900">{hrs(r.hours)}</span> : <span className="text-slate-300">—</span>}
                        {r.overtime > 0.004 ? <span className="block text-[11px] text-amber-700">{hrs(r.overtime)} OT</span> : null}
                      </td>
                      {seesCosts ? (
                        <td className="px-4 py-2 text-right">
                          {!r.list.length ? (
                            <span className="text-slate-300">—</span>
                          ) : r.person?.rate == null ? (
                            <span className="text-xs text-slate-400">no rate</span>
                          ) : (
                            money(r.cost)
                          )}
                        </td>
                      ) : null}
                    </tr>
                    {open ? (
                      <tr className="border-b border-slate-100 bg-slate-50/60">
                        <td colSpan={cols} className="px-0 py-2">
                          {/* Stays in view as wide as the box when the table slides sideways (a phone), so Cancel and Delete aren't off the edge. */}
                          <div className="sticky left-0 w-[100cqw] max-w-full px-4">
                          <Punches
                            r={r}
                            days={days}
                            editingId={editing?.id}
                            adding={sp.add === r.id}
                            base={base}
                            wall={wall}
                            hrs={hrs}
                            hoursOf={(e) => entryHours(e, now, rules)}
                            autoLunch={(e) =>
                              !e.breakMinutes && !!rules.lunchMinutes && entryHours(e, now, { ...rules, lunchMinutes: 0 }) > rules.lunchAfter ? rules.lunchMinutes : 0
                            }
                            costed={costed}
                            at={at}
                            form={entryForm}
                            formHead={formHead}
                          />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-sm">
                <td className="px-4 py-2 font-semibold text-slate-900">Total</td>
                {dayTotals.map((h, i) => (
                  <td key={i} className="px-2 py-2 text-right text-slate-700">
                    {h ? hrs(h) : <span className="text-slate-300">—</span>}
                  </td>
                ))}
                <td className="px-2 py-2 text-right">
                  <span className="font-semibold text-slate-900">{hrs(totals.hours)}</span>
                  {totals.overtime > 0.004 ? <span className="block text-[11px] text-amber-700">{hrs(totals.overtime)} OT</span> : null}
                </td>
                {seesCosts ? <td className="px-4 py-2 text-right font-semibold text-slate-900">{money(totals.cost)}</td> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <p className="text-xs text-slate-500">
        {overtimeSentence(rules)} Times are {zoneLabel(clock.zone)} time. Each job&apos;s labor posts to its Budget by cost code. Overtime, rounding, lunch, the week
        {seesCosts ? `, pay rates and labor burden (${burden}%)` : ""} are set in{" "}
        <Link href="/settings/time-clock" className="font-medium text-blue-700 hover:underline">
          Settings → Time clock
        </Link>
        .
      </p>
    </div>
  );
}

type Entry = {
  id: string;
  userId: string;
  clockIn: Date;
  clockOut: Date | null;
  breakMinutes: number;
  notes: string | null;
  inLat: number | null;
  inLng: number | null;
  inAccuracy: number | null;
  outLat: number | null;
  outLng: number | null;
  outAccuracy: number | null;
  project: { number: number; name: string; siteLat: number | null; siteLng: number | null };
  costCode: { code: string | null; name: string } | null;
  editedBy: { name: string } | null;
};

/** One person's punches for the week, opened under their row. Fixing one opens it right on its line. */
function Punches<E extends Entry>({
  r,
  days,
  editingId,
  adding,
  base,
  wall,
  hrs,
  hoursOf,
  autoLunch,
  costed,
  at,
  form,
  formHead,
}: {
  r: { id: string; name: string; list: E[] };
  days: Date[];
  editingId?: string;
  adding: boolean;
  base: string;
  wall: (d: Date) => Date;
  hrs: (h: number) => string;
  hoursOf: (e: E) => number;
  autoLunch: (e: E) => number;
  costed: Map<string, { overtime: number; double: number }>;
  at: (punch: { lat: number | null; lng: number | null; accuracy: number | null }, job: { siteLat: number | null; siteLng: number | null }) => { feet: number; offSite: boolean } | null;
  form: (e?: E, forId?: string) => React.ReactNode;
  formHead: (title: string) => React.ReactNode;
}) {
  const first = r.name.split(" ")[0];
  const list = days.flatMap((d) => r.list.filter((e) => sameDay(wall(e.clockIn), d)));
  return (
    <div className="text-xs">
      {list.length ? (
        <table className="w-full">
          <thead>
            <tr className="text-left text-slate-500">
              <th className="py-1 pr-3 font-normal">Day</th>
              <th className="py-1 pr-3 font-normal">Job · cost code</th>
              <th className="py-1 pr-3 font-normal">In – out</th>
              <th className="py-1 pr-3 text-right font-normal">Break</th>
              <th className="py-1 pr-3 text-right font-normal">Hours</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {list.map((e) => {
              const c = costed.get(e.id);
              const lunch = autoLunch(e);
              if (e.id === editingId)
                return (
                  <tr key={e.id}>
                    <td colSpan={6} className="rounded-lg bg-blue-50/70 px-3 py-2">
                      {formHead(`Fix ${first}'s time — ${wall(e.clockIn).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`)}
                      {form(e)}
                    </td>
                  </tr>
                );
              return (
                <tr key={e.id} className="border-t border-slate-200/70 align-top">
                  <td className="whitespace-nowrap py-1.5 pr-3 font-medium text-slate-700">
                    {wall(e.clockIn).toLocaleDateString("en-US", { weekday: "short" })} {wall(e.clockIn).getDate()}
                  </td>
                  <td className="py-1.5 pr-3 text-slate-900">
                    #{e.project.number} {e.project.name}
                    <span className="text-slate-500">{e.costCode ? ` · ${codeLabel(e.costCode)}` : " · no cost code"}</span>
                    {e.notes ? <span className="block text-slate-500">{e.notes}</span> : null}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-slate-700">
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
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right text-slate-500">
                    {e.breakMinutes ? (
                      `${e.breakMinutes} min`
                    ) : lunch ? (
                      <span title="Settings → Time clock takes out a lunch on long shifts with no break typed in">{lunch} min (auto)</span>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-1.5 pr-3 text-right font-medium text-slate-900">
                    {hrs(hoursOf(e))}
                    {c && c.overtime > 0.004 ? <span className="block text-[11px] font-normal text-amber-700">{hrs(c.overtime)} OT</span> : null}
                    {c && c.double > 0.004 ? <span className="block text-[11px] font-normal text-rose-700">{hrs(c.double)} double</span> : null}
                  </td>
                  <td className="whitespace-nowrap py-1.5 text-right">
                    <Link
                      href={`${base}&edit=${e.id}`}
                      scroll={false}
                      className={editLink}
                      title={e.editedBy ? `Last changed by ${e.editedBy.name}` : undefined}
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="py-1 text-slate-500">No time this week.</p>
      )}
      {adding ? (
        <div className="mt-2 rounded-lg bg-blue-50/70 px-3 py-2">
          {formHead(`Add time for ${first}`)}
          {form(undefined, r.id)}
        </div>
      ) : (
        <Link href={`${base}&add=${r.id}`} scroll={false} className={cn(editLink, "mt-1.5")}>
          <Plus className="h-3 w-3" /> Add time for {first}
        </Link>
      )}
    </div>
  );
}

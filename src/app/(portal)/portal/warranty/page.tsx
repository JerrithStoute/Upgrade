import Link from "@/components/link";
import { differenceInCalendarMonths } from "date-fns";
import { ChevronDown, Phone, Plus, Send, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { getClientProjects } from "@/lib/portal";
import { companyClock } from "@/lib/company-zone";
import { cn, fmtDate } from "@/lib/utils";
import { isOpen, showsWarranty, sortWarranty, warrantyEnds, warrantyNo } from "@/lib/warranty";
import { EmptyState, Field, SubmitButton } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";
import { PhotoInput, WarrantyNotes, WarrantyPhotos, WarrantyStatus } from "@/components/warranty/parts";
import { clientWarrantyNote, reportWarranty } from "../actions";

export const metadata = { title: "Warranty" };

/** After move-in: report something to fix, and follow it to done. */
export default async function PortalWarrantyPage({ searchParams }: { searchParams: Promise<{ project?: string; new?: string; open?: string }> }) {
  const user = await requireClient();
  const { project: projectParam, new: newParam, open: openParam } = await searchParams;
  const all = await getClientProjects(user.clientId);
  const counts = new Map(
    (await db.warrantyRequest.groupBy({ by: ["projectId"], where: { projectId: { in: all.map((p) => p.id) } }, _count: { _all: true } })).map((g) => [g.projectId, g._count._all]),
  );
  const finished = all.filter((p) => showsWarranty(p, counts.get(p.id) ?? 0));
  let project = projectParam ? (all.find((p) => p.id === projectParam) ?? null) : (finished[0] ?? null);
  if (projectParam && !project) notFound();
  if (project && !finished.includes(project)) project = null;

  if (!project) {
    return (
      <>
        <PortalPageHeader title="Warranty" projects={finished} project={null} />
        <EmptyState icon={ShieldCheck} title="Your warranty starts when your home is finished" description="Once it is, this is where you tell us about anything that needs fixing." />
      </>
    );
  }

  const [rows, company, clock] = await Promise.all([
    db.warrantyRequest.findMany({
      where: { projectId: project.id },
      include: {
        notes: { where: { teamOnly: false }, orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } } } },
        files: { where: { clientVisible: true }, orderBy: { createdAt: "asc" }, select: { id: true, name: true, mimeType: true } },
      },
    }),
    db.company.findFirst({ select: { warrantyMonths: true } }),
    companyClock(),
  ]);
  const list = sortWarranty(rows);
  const open = list.filter((r) => isOpen(r.status)).length;
  const ends = warrantyEnds(project.actualEndDate, company?.warrantyMonths ?? 12);
  const covered = ends ? ends >= clock.now : null;
  const monthsLeft = ends && covered ? differenceInCalendarMonths(ends, clock.now) : 0;
  const reporting = newParam === "1" || list.length === 0;
  const base = `/portal/warranty?project=${project.id}`;
  const manager = project.manager;

  return (
    <>
      <PortalPageHeader title="Warranty" description="Tell us about anything that needs fixing." projects={finished} project={project} />
      <div className="flex flex-col items-start gap-4 lg:flex-row">
        <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:sticky lg:top-32 lg:w-80">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500">Your warranty</span>
            {covered === null ? null : (
              <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", covered ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600")}>{covered ? "Covered" : "Ended"}</span>
            )}
          </div>
          <p className="mt-0.5 text-lg font-semibold text-slate-900">
            {ends ? `${covered ? "Until" : "Ended"} ${fmtDate(ends, "MMM d, yyyy")}` : "Starts when your home is finished"}
          </p>
          <p className="text-xs text-slate-500">
            {[covered && monthsLeft > 0 ? `${monthsLeft} month${monthsLeft === 1 ? "" : "s"} left` : null, list.length ? `${open} open request${open === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
          </p>
          {reporting ? null : (
            <Link href={`${base}&new=1`} className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white hover:bg-slate-800">
              <Plus className="h-4 w-4" /> Report something to fix
            </Link>
          )}
          {manager?.phone ? (
            <p className="mt-2 text-xs text-slate-500">
              Emergency?{" "}
              <a href={`tel:${manager.phone}`} className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline">
                <Phone className="h-3 w-3" /> Call {manager.name.split(" ")[0]}
              </a>{" "}
              too.
            </p>
          ) : null}
        </aside>

        <div className="w-full min-w-0 flex-1 space-y-4">
          {reporting ? (
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-slate-900">Report something to fix</h2>
                {list.length ? (
                  <Link href={base} className="text-sm text-slate-600 hover:underline">
                    Cancel
                  </Link>
                ) : null}
              </header>
              <form action={reportWarranty} className="space-y-4 px-4 py-3">
                <input type="hidden" name="projectId" value={project.id} />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <Field label="What needs fixing?" htmlFor="r-title">
                    <input id="r-title" name="title" className="input" required maxLength={200} placeholder="Kitchen faucet drips" />
                  </Field>
                  <Field label="Where in the house?" htmlFor="r-location">
                    <input id="r-location" name="location" className="input" maxLength={120} placeholder="Kitchen" />
                  </Field>
                </div>
                <Field label="Tell us more" htmlFor="r-description" hint="When it started, what you've noticed, the best times to come by.">
                  <textarea id="r-description" name="description" className="input" rows={4} />
                </Field>
                <PhotoInput id="r-photos" />
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="urgent" className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                  <span>
                    It&apos;s urgent — water leaking, no heat or no power, or something unsafe.
                    <span className="block text-xs text-slate-500">For an emergency, call us too{manager?.phone ? ` at ${manager.phone}` : ""}.</span>
                  </span>
                </label>
                <SubmitButton pendingText="Sending…" className="w-full justify-center sm:w-auto">
                  Send request
                </SubmitButton>
              </form>
            </section>
          ) : null}

          {list.length ? (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <h2 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">Your requests</h2>
              <ul className="divide-y divide-slate-100">
                {list.map((r) => {
                  const live = isOpen(r.status);
                  const visit = r.status === "SCHEDULED" && r.scheduledFor;
                  const line = visit
                    ? `Someone comes ${fmtDate(r.scheduledFor, "EEE, MMM d")}`
                    : live
                      ? `Reported ${fmtDate(r.createdAt, "MMM d")}`
                      : `${r.status === "DONE" ? "Done" : "Closed"} ${fmtDate(r.closedAt, "MMM d")}`;
                  return (
                    <li key={r.id}>
                      <details open={r.id === openParam} className="group">
                        <summary
                          className={cn(
                            "flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden",
                            visit ? "bg-blue-50/70 hover:bg-blue-50" : "hover:bg-slate-50",
                          )}
                        >
                          <span className="min-w-0">
                            <span className={cn("line-clamp-2 block text-sm font-medium", visit ? "text-blue-900" : live ? "text-slate-900" : "text-slate-500")}>{r.title}</span>
                            <span className={cn("block text-xs", visit ? "text-blue-800" : "text-slate-500")}>{[r.location, line].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            <WarrantyStatus status={r.status} urgent={r.urgent} />
                            <ChevronDown className="h-4 w-4 text-slate-400 transition-transform group-open:rotate-180" />
                          </span>
                        </summary>
                        <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
                          <p className="text-xs text-slate-500">
                            {warrantyNo(r.number)} · reported {fmtDate(r.createdAt, "MMM d, yyyy")}
                          </p>
                          {visit ? (
                            <p className="rounded-md bg-blue-50 px-3 py-2 text-sm font-medium text-blue-900">Someone will be there {fmtDate(r.scheduledFor, "EEEE, MMMM d")}.</p>
                          ) : r.status === "NEW" ? (
                            <p className="text-sm text-slate-600">We have it, and we&apos;ll let you know when it&apos;s scheduled.</p>
                          ) : (
                            <div className={cn("rounded-md px-3 py-2 text-sm", r.status === "DONE" ? "bg-emerald-50 text-emerald-900" : "bg-slate-100 text-slate-700")}>
                              <p className="font-medium">
                                {r.status === "DONE" ? "Done" : "Not covered by your warranty"} · {fmtDate(r.closedAt)}
                              </p>
                              {r.closeNote ? <p className="mt-0.5 whitespace-pre-line">{r.closeNote}</p> : null}
                            </div>
                          )}
                          {r.description ? <p className="whitespace-pre-line text-sm text-slate-800">{r.description}</p> : null}
                          <WarrantyPhotos files={r.files} small />
                          <WarrantyNotes notes={r.notes} dateTime={clock.dateTime} />
                          {live ? (
                            <form action={clientWarrantyNote} className="space-y-2 border-t border-slate-100 pt-3">
                              <input type="hidden" name="id" value={r.id} />
                              <div className="flex items-end gap-2">
                                <textarea name="body" rows={1} aria-label="Note" placeholder="Add a note…" className="input min-h-[2.5rem] flex-1 resize-y rounded-2xl" />
                                <SubmitButton pendingText="…" className="h-10 w-10 shrink-0 justify-center rounded-full !px-0" aria-label="Send note">
                                  <Send className="h-4 w-4" />
                                </SubmitButton>
                              </div>
                              <PhotoInput id={`p-${r.id}`} compact label="Add photos" />
                            </form>
                          ) : null}
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}

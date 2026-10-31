import Link from "@/components/link";
import { Plus } from "lucide-react";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { companyClock } from "@/lib/company-zone";
import { cn, fmtDate } from "@/lib/utils";
import { isOpen, sortWarranty, warrantyEnds } from "@/lib/warranty";
import { SubmitButton } from "@/components/ui";
import { Tile } from "@/components/ui/tile";
import { ListFind } from "@/components/list-find";
import { PhotoInput } from "@/components/warranty/parts";
import { WarrantyTable } from "@/components/warranty/table";
import { addWarranty } from "./actions";

export const metadata = { title: "Warranty" };

const small = "!h-7 !px-2.5 !text-xs";
const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
const head = "flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5";
const editLink = "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700 hover:underline";
const plainBtn = "inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
const compact = "[&_.input]:!h-8 [&_.input]:!py-0 [&_.input]:text-sm [&_.label]:!normal-case [&_.label]:!tracking-normal";
const row = "grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 border-t border-slate-100 py-1 text-sm first:border-t-0";

const SHOWS = [
  { key: "open", label: "Open" },
  { key: "done", label: "Closed" },
  { key: "all", label: "All" },
] as const;

/** A finished job's warranty requests: the client's (from their portal) and the ones you add. */
export default async function ProjectWarrantyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ add?: string; show?: string }> }) {
  const user = await requireView("field");
  const { id } = await params;
  const sp = await searchParams;
  const project = await getProject(id);
  const [rows, company, clock] = await Promise.all([
    db.warrantyRequest.findMany({
      where: { projectId: project.id },
      include: { vendor: { select: { name: true } }, assignee: { select: { name: true } }, _count: { select: { files: true } } },
    }),
    db.company.findFirst({ select: { warrantyMonths: true } }),
    companyClock(),
  ]);
  const months = company?.warrantyMonths ?? 12;
  const ends = warrantyEnds(project.actualEndDate, months);
  const list = sortWarranty(rows).map((r) => ({ ...r, project: { id: project.id, number: project.number, name: project.name } }));
  const open = list.filter((r) => isOpen(r.status));
  const canEdit = allows(user.access, "field", 2);
  const adding = canEdit && sp.add === "1";
  const show = sp.show === "done" || sp.show === "all" ? sp.show : "open";
  const here = `/projects/${project.id}/warranty`;
  const showHref = (k: string) => (k === "open" ? here : `${here}?show=${k}`);
  const shown = show === "open" ? open : show === "done" ? list.filter((r) => !isOpen(r.status)) : list;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
          Warranty
          {ends ? (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
                ends >= clock.now ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-amber-50 text-amber-900 ring-amber-200",
              )}
            >
              {ends >= clock.now ? `Covered until ${fmtDate(ends)}` : `Ended ${fmtDate(ends)}`}
            </span>
          ) : (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">Starts when the job is finished</span>
          )}
          <span className="text-xs font-normal text-slate-400">
            {months} months —{" "}
            {ends === null && canEdit ? (
              <Link href={`/projects/${project.id}?edit=1`} className="text-blue-700 hover:underline">
                set the completed date
              </Link>
            ) : (
              "Settings → Company"
            )}
          </span>
        </h2>
        {canEdit && !adding ? (
          <Link href={`${here}?add=1`} scroll={false} className={plainBtn}>
            <Plus className="h-3.5 w-3.5" /> Add a request
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Open" value={open.length} />
        <Tile label="Urgent" value={open.filter((r) => r.urgent).length} tone={open.some((r) => r.urgent) ? "bad" : undefined} />
        <Tile label="Scheduled" value={open.filter((r) => r.status === "SCHEDULED").length} />
        <Tile label="Closed" value={list.length - open.length} />
      </div>

      {adding ? (
        <section className={card}>
          <header className={head}>
            <h3 className="text-sm font-semibold text-slate-900">New request</h3>
            <Link href={here} scroll={false} className={editLink}>
              Cancel
            </Link>
          </header>
          <form action={addWarranty} className={cn("px-4 py-2", compact)}>
            <input type="hidden" name="projectId" value={project.id} />
            <p className="pb-1.5 text-xs text-slate-500">
              From a phone call or a walk-through. {project.clientId ? "Your client can also report them from their portal's Warranty tab." : null}
            </p>
            <label className={row}>
              <span className="text-slate-500">What</span>
              <input name="title" className="input" required maxLength={200} placeholder="Drywall crack over the stairs" aria-label="What needs fixing?" />
            </label>
            <label className={row}>
              <span className="text-slate-500">Where</span>
              <input name="location" className="input" maxLength={120} placeholder="Stairway" aria-label="Where in the house?" />
            </label>
            <label className={cn(row, "items-start")}>
              <span className="pt-1.5 text-slate-500">Details</span>
              <textarea name="description" className="input !h-auto !py-1.5" rows={2} aria-label="Details" />
            </label>
            <div className={cn(row, "items-start")}>
              <span className="pt-1 text-slate-500">Photos</span>
              <PhotoInput compact />
            </div>
            <div className={row}>
              <span />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" name="urgent" className="h-4 w-4 rounded border-slate-300" /> Urgent — water, no heat, safety
              </label>
            </div>
            <div className="flex gap-1.5 border-t border-slate-100 pt-2 pb-1">
              <SubmitButton size="sm" className={small} pendingText="Adding…">
                Add request
              </SubmitButton>
              <Link href={here} scroll={false} className={plainBtn}>
                Cancel
              </Link>
            </div>
          </form>
        </section>
      ) : null}

      <section className={card}>
        <header className={head}>
          <h3 className="text-sm font-semibold text-slate-900">Requests</h3>
          <div className="flex flex-wrap items-center gap-2">
            {list.length ? <ListFind listId="job-warranty" placeholder="Find a request…" /> : null}
            <nav className="flex gap-1" aria-label="Show">
              {SHOWS.map((s) => (
                <Link
                  key={s.key}
                  href={showHref(s.key)}
                  scroll={false}
                  className={cn("rounded-md px-2.5 py-1 text-xs font-medium", show === s.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
                >
                  {s.label}
                </Link>
              ))}
            </nav>
          </div>
        </header>
        <div id="job-warranty">
          <WarrantyTable
            rows={shown}
            empty={
              list.length === 0
                ? "No warranty requests. When your client reports something to fix, or you add one, it shows here until it's done."
                : show === "open"
                  ? "Nothing open."
                  : "None here."
            }
          />
        </div>
      </section>
    </div>
  );
}

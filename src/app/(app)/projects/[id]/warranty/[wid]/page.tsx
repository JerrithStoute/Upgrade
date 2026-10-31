import Link from "@/components/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { getProject, staffUsers } from "@/lib/projects";
import { vendorChoices } from "@/lib/paperwork-server";
import { notifyOn } from "@/lib/notify-recipients";
import { VendorPick } from "@/components/vendors/vendor-pick";
import { companyClock } from "@/lib/company-zone";
import { cn, dateInput, fmtDate } from "@/lib/utils";
import { isOpen, warrantyLabel, warrantyNo } from "@/lib/warranty";
import { ConfirmForm, SubmitButton } from "@/components/ui";
import { PhotoInput, WarrantyNotes, WarrantyPhotos, WarrantyStatus } from "@/components/warranty/parts";
import { assignWarranty, closeWarranty, deleteWarranty, editWarranty, noteWarranty, reopenWarranty } from "../actions";

const small = "!h-7 !px-2.5 !text-xs";
const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
const head = "flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5";
const editLink = "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700 hover:underline";
const plainBtn = "inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
// The forms here, at the size of the rest of the page.
const compact = "[&_.input]:!h-8 [&_.input]:!py-0 [&_.input]:text-sm [&_.label]:!normal-case [&_.label]:!tracking-normal";

/** A label and its value, like a sub's or client's page. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1.5 text-sm first:border-t-0">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-slate-900">{children || <span className="text-slate-300">—</span>}</span>
    </div>
  );
}

/** The same row in Edit: the label, then its box. */
function EditRow({ label, top, children }: { label: string; top?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1 text-sm first:border-t-0", top ? "items-start" : "items-center")}>
      <span className={cn("text-slate-500", top && "pt-1.5")}>{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

/** One warranty request: what's wrong, who's fixing it and when, the notes, and closing it out. */
export default async function WarrantyRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; wid: string }>;
  searchParams: Promise<{ edit?: string; close?: string }>;
}) {
  const user = await requireView("field");
  const { id, wid } = await params;
  const sp = await searchParams;
  const project = await getProject(id);
  const w = await db.warrantyRequest.findFirst({
    where: { id: wid, projectId: project.id },
    include: {
      vendor: { select: { id: true, name: true, contact: true, phone: true, email: true, logins: { where: { active: true }, select: { id: true } } } },
      createdBy: { select: { name: true } },
      notes: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } } } },
      files: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, mimeType: true } },
    },
  });
  if (!w) notFound();
  const [vendors, staff, clock, emailsSub] = await Promise.all([vendorChoices(), staffUsers(), companyClock(), notifyOn("warrantyToSub")]);
  const canEdit = allows(user.access, "field", 2);
  const open = isOpen(w.status);
  const client = project.client;
  const hasClient = !!client;
  const here = `/projects/${project.id}/warranty/${w.id}`;
  const editing = canEdit ? sp.edit : undefined;
  const closing = canEdit && open ? (sp.close === "DONE" || sp.close === "NOT_COVERED" ? sp.close : null) : null;
  const assignee = staff.find((s) => s.id === w.assigneeId)?.name;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Link href={`/projects/${project.id}/warranty`} className="text-xs font-medium text-blue-700 hover:underline">
          ← Warranty
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-900">
            <span className="text-slate-400">{warrantyNo(w.number)}</span> {w.title} <WarrantyStatus status={w.status} urgent={w.urgent} />
          </h2>
          {canEdit ? (
            open ? (
              closing ? null : (
                <div className="flex gap-1.5">
                  <Link href={`${here}?close=DONE`} scroll={false} className={plainBtn}>
                    Mark done…
                  </Link>
                  <Link href={`${here}?close=NOT_COVERED`} scroll={false} className={plainBtn}>
                    Not covered…
                  </Link>
                </div>
              )
            ) : (
              <form action={reopenWarranty}>
                <input type="hidden" name="id" value={w.id} />
                <SubmitButton variant="secondary" size="sm" className={small} pendingText="Reopening…">
                  Reopen
                </SubmitButton>
              </form>
            )
          ) : null}
        </div>
      </div>

      {closing ? (
        <section className={card}>
          <header className={head}>
            <h3 className="text-sm font-semibold text-slate-900">{closing === "DONE" ? "Mark it done" : "Close it as not covered"}</h3>
            <Link href={here} scroll={false} className={editLink}>
              Cancel
            </Link>
          </header>
          <form action={closeWarranty} className={cn("px-4 py-2", compact)}>
            <input type="hidden" name="id" value={w.id} />
            <input type="hidden" name="status" value={closing} />
            <EditRow label={closing === "DONE" ? "What was done" : "Why not"} top>
              <textarea
                name="closeNote"
                className="input !h-auto !py-1.5"
                rows={2}
                required={closing === "NOT_COVERED"}
                aria-label={closing === "DONE" ? "What was done" : "Why it isn't covered"}
              />
              <span className="mt-0.5 block text-xs text-slate-500">The client reads this.</span>
            </EditRow>
            {closing === "DONE" ? (
              <EditRow label="After photos" top>
                <PhotoInput id="c-photos" label="After photos" compact />
              </EditRow>
            ) : null}
            {hasClient ? (
              <EditRow label="">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="tellClient" defaultChecked className="h-4 w-4 rounded border-slate-300" /> Email the client
                </label>
              </EditRow>
            ) : null}
            <div className="flex gap-1.5 border-t border-slate-100 pt-2 pb-1">
              <SubmitButton size="sm" className={small} pendingText="Closing…">
                {closing === "DONE" ? "Mark done" : "Close as not covered"}
              </SubmitButton>
              <Link href={here} scroll={false} className={plainBtn}>
                Cancel
              </Link>
            </div>
          </form>
        </section>
      ) : null}

      {!open ? (
        <section className={card}>
          <header className={head}>
            <h3 className="text-sm font-semibold text-slate-900">{warrantyLabel(w.status)}</h3>
            <span className="text-xs text-slate-500">{fmtDate(w.closedAt)}</span>
          </header>
          <div className="px-4 py-2">
            <Row label={w.status === "DONE" ? "What was done" : "Why not"}>
              {w.closeNote ? <span className="whitespace-pre-line">{w.closeNote}</span> : null}
            </Row>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <section className={card}>
          <header className={head}>
            <h3 className="text-sm font-semibold text-slate-900">The request</h3>
            {canEdit && editing !== "info" ? (
              <Link href={`${here}?edit=info`} scroll={false} className={editLink}>
                <Pencil className="h-3 w-3" /> Edit
              </Link>
            ) : editing === "info" ? (
              <Link href={here} scroll={false} className={editLink}>
                Cancel
              </Link>
            ) : null}
          </header>
          {editing === "info" ? (
            // The same rows as the view, each with its box.
            <div className={cn("px-4 py-2", compact)}>
              <form action={editWarranty}>
                <input type="hidden" name="id" value={w.id} />
                <EditRow label="What">
                  <input name="title" className="input" required maxLength={200} defaultValue={w.title} aria-label="What needs fixing?" />
                </EditRow>
                <EditRow label="Where">
                  <input name="location" className="input" maxLength={120} defaultValue={w.location ?? ""} aria-label="Where in the house?" />
                </EditRow>
                <EditRow label="Urgent">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="urgent" defaultChecked={w.urgent} className="h-4 w-4 rounded border-slate-300" /> Water, no heat, safety
                  </label>
                </EditRow>
                <EditRow label="Details" top>
                  <textarea name="description" className="input !h-auto !py-1.5" rows={3} defaultValue={w.description ?? ""} aria-label="Details" />
                </EditRow>
                <div className="flex gap-1.5 border-t border-slate-100 pt-2 pb-1">
                  <SubmitButton size="sm" className={small} pendingText="Saving…">
                    Save
                  </SubmitButton>
                  <Link href={here} scroll={false} className={plainBtn}>
                    Cancel
                  </Link>
                </div>
              </form>
              <div className="flex justify-end border-t border-slate-100 pt-2 pb-1">
                <ConfirmForm action={deleteWarranty} hidden={{ id: w.id }} className="[&_button]:!h-7 [&_button]:!px-2.5 [&_button]:!text-xs" message={`Delete ${warrantyNo(w.number)} for good? Its photos stay in the job's Files.`}>
                  Delete request
                </ConfirmForm>
              </div>
            </div>
          ) : (
            <div className="px-4 py-2">
              <Row label="What">{w.title}</Row>
              <Row label="Where">{w.location}</Row>
              <Row label="Urgent">{w.urgent ? <span className="font-medium text-red-700">Yes</span> : "No"}</Row>
              <Row label="Details">{w.description ? <span className="whitespace-pre-line">{w.description}</span> : null}</Row>
              <Row label="Photos">{w.files.length ? <WarrantyPhotos files={w.files} small /> : null}</Row>
              <Row label="Reported">{`${fmtDate(w.createdAt)} ${w.fromClient ? "by the client" : `by ${w.createdBy?.name ?? "the team"}`}`}</Row>
              {client ? (
                <Row label="Homeowner">
                  {`${client.firstName} ${client.lastName}`}
                  {client.phone ? (
                    <>
                      {" · "}
                      <a href={`tel:${client.phone}`} className="text-blue-700 hover:underline">
                        {client.phone}
                      </a>
                    </>
                  ) : null}
                </Row>
              ) : null}
              {project.address ? <Row label="Address">{[project.address, project.city].filter(Boolean).join(", ")}</Row> : null}
            </div>
          )}
        </section>

        <section className={card}>
          <header className={head}>
            <h3 className="text-sm font-semibold text-slate-900">Who&apos;s fixing it</h3>
            {canEdit && open && editing !== "who" ? (
              <Link href={`${here}?edit=who`} scroll={false} className={editLink}>
                <Pencil className="h-3 w-3" /> Edit
              </Link>
            ) : editing === "who" ? (
              <Link href={here} scroll={false} className={editLink}>
                Cancel
              </Link>
            ) : null}
          </header>
          {editing === "who" && open ? (
            <form action={assignWarranty} className={cn("px-4 py-2", compact)}>
              <input type="hidden" name="id" value={w.id} />
              <EditRow label="Sub">
                <VendorPick id="a-vendor" vendors={vendors} defaultValue={w.vendorId} emptyLabel="— None —" />
              </EditRow>
              <EditRow label="Your team">
                <select name="assigneeId" className="input" defaultValue={w.assigneeId ?? ""} aria-label="Someone on your team">
                  <option value="">— None —</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </EditRow>
              <EditRow label="Day">
                <input name="scheduledFor" type="date" className="input !w-44" defaultValue={dateInput(w.scheduledFor)} aria-label="Day" />
              </EditRow>
              {hasClient ? (
                <EditRow label="">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="tellClient" defaultChecked className="h-4 w-4 rounded border-slate-300" /> Email the client the day
                  </label>
                </EditRow>
              ) : null}
              <p className="border-t border-slate-100 py-1.5 text-xs text-slate-500">
                A day makes it Scheduled. The sub sees it on their portal&apos;s Warranty page{emailsSub ? " and is emailed" : ""}.
              </p>
              <div className="flex gap-1.5 border-t border-slate-100 pt-2 pb-1">
                <SubmitButton size="sm" className={small} pendingText="Saving…">
                  Save
                </SubmitButton>
                <Link href={here} scroll={false} className={plainBtn}>
                  Cancel
                </Link>
              </div>
            </form>
          ) : (
            <div className="px-4 py-2">
              <Row label="Sub">
                {w.vendor ? (
                  <>
                    <Link href={`/vendors/${w.vendor.id}`} className="text-blue-700 hover:underline">
                      {w.vendor.name}
                    </Link>
                    <span className="block text-xs text-slate-500">
                      {[w.vendor.contact, w.vendor.phone, w.vendor.email, w.vendor.logins.length ? "has a portal sign-in" : "no portal sign-in (emailed only)"]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </>
                ) : null}
              </Row>
              <Row label="Your team">{assignee}</Row>
              <Row label="Day">{w.scheduledFor ? fmtDate(w.scheduledFor, "EEE, MMM d") : null}</Row>
            </div>
          )}
        </section>
      </div>

      <section className={card}>
        <header className={head}>
          <h3 className="text-sm font-semibold text-slate-900">Notes</h3>
          <span className="text-xs text-slate-500">The client sees notes unless they&apos;re team only. The sub sees all of them.</span>
        </header>
        <div className="space-y-2 px-4 py-3">
          <WarrantyNotes notes={w.notes} showTeamOnly dateTime={clock.dateTime} />
          {!w.notes.length ? <p className="text-sm text-slate-400">No notes yet.</p> : null}
          {canEdit ? (
            <form action={noteWarranty} className={cn("space-y-2 border-t border-slate-100 pt-2", compact)}>
              <input type="hidden" name="id" value={w.id} />
              <textarea name="body" className="input !h-auto !py-1.5" rows={2} placeholder="Write a note…" aria-label="Note" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <PhotoInput id="n-photos" compact />
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" name="teamOnly" className="h-3.5 w-3.5 rounded border-slate-300" /> Team only
                  </label>
                  <SubmitButton size="sm" variant="secondary" className={small} pendingText="Adding…">
                    Add note
                  </SubmitButton>
                </span>
              </div>
            </form>
          ) : null}
        </div>
      </section>
    </div>
  );
}

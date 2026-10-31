import Link from "@/components/link";
import { notFound } from "next/navigation";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { getProject, staffUsers } from "@/lib/projects";
import { vendorChoices } from "@/lib/paperwork-server";
import { notifyOn } from "@/lib/notify-recipients";
import { VendorPick } from "@/components/vendors/vendor-pick";
import { companyClock } from "@/lib/company-zone";
import { fmtDate } from "@/lib/utils";
import { isOpen, warrantyLabel, warrantyNo } from "@/lib/warranty";
import { Card, CardBody, CardHeader, Collapsible, ConfirmForm, Field, SubmitButton } from "@/components/ui";
import { PhotoInput, WarrantyNotes, WarrantyPhotos, WarrantyStatus } from "@/components/warranty/parts";
import { assignWarranty, closeWarranty, deleteWarranty, editWarranty, noteWarranty, reopenWarranty } from "../actions";

const dateInput = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");

/** One warranty request: what's wrong, who's fixing it and when, the notes, and closing it out. */
export default async function WarrantyRequestPage({ params }: { params: Promise<{ id: string; wid: string }> }) {
  const user = await requireView("field");
  const { id, wid } = await params;
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

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <Link href={`/projects/${project.id}/warranty`} className="text-blue-700 hover:underline">
          ← Warranty
        </Link>
      </p>

      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400">{warrantyNo(w.number)}</span> {w.title} <WarrantyStatus status={w.status} urgent={w.urgent} />
            </span>
          }
          description={[w.location, `Reported ${fmtDate(w.createdAt)} ${w.fromClient ? "by the client" : `by ${w.createdBy?.name ?? "the team"}`}`].filter(Boolean).join(" · ")}
        />
        <CardBody className="space-y-3">
          {w.description ? <p className="whitespace-pre-line text-sm text-slate-800">{w.description}</p> : <p className="text-sm text-slate-400">No details.</p>}
          <WarrantyPhotos files={w.files} />
          {client ? (
            <p className="text-sm text-slate-600">
              Homeowner: <span className="font-medium text-slate-800">{`${client.firstName} ${client.lastName}`}</span>
              {client.phone ? (
                <>
                  {" · "}
                  <a href={`tel:${client.phone}`} className="text-blue-700 hover:underline">
                    {client.phone}
                  </a>
                </>
              ) : null}
              {project.address ? ` · ${[project.address, project.city].filter(Boolean).join(", ")}` : null}
            </p>
          ) : null}
          {canEdit ? (
            <Collapsible summary="Change what it says">
              <form action={editWarranty} className="space-y-3">
                <input type="hidden" name="id" value={w.id} />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <Field label="What needs fixing?" htmlFor="e-title">
                    <input id="e-title" name="title" className="input" required maxLength={200} defaultValue={w.title} />
                  </Field>
                  <Field label="Where in the house?" htmlFor="e-location">
                    <input id="e-location" name="location" className="input" maxLength={120} defaultValue={w.location ?? ""} />
                  </Field>
                </div>
                <Field label="Details" htmlFor="e-description">
                  <textarea id="e-description" name="description" className="input" rows={3} defaultValue={w.description ?? ""} />
                </Field>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="urgent" defaultChecked={w.urgent} className="h-4 w-4 rounded border-slate-300" /> Urgent
                </label>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <SubmitButton pendingText="Saving…" variant="secondary">
                    Save
                  </SubmitButton>
                </div>
              </form>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <ConfirmForm action={deleteWarranty} hidden={{ id: w.id }} message={`Delete ${warrantyNo(w.number)} for good? Its photos stay in the job's Files.`}>
                  Delete request
                </ConfirmForm>
              </div>
            </Collapsible>
          ) : null}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Who's fixing it" description={open ? "Pick a sub, someone on your team, or both — and the day." : `${warrantyLabel(w.status)} ${fmtDate(w.closedAt)}`} />
          <CardBody className="space-y-3">
            {open && canEdit ? (
              // (Keyed by what's saved: a select keeps its first value through a save otherwise.)
              <form key={`${w.vendorId}|${w.assigneeId}|${w.scheduledFor?.getTime()}`} action={assignWarranty} className="space-y-3">
                <input type="hidden" name="id" value={w.id} />
                <Field label="Sub" htmlFor="a-vendor" hint={`They see it in their portal's Warranty page${emailsSub ? ", and are emailed" : ""}.`}>
                  <VendorPick id="a-vendor" vendors={vendors} defaultValue={w.vendorId} emptyLabel="— None —" />
                </Field>
                <Field label="Someone on your team" htmlFor="a-assignee">
                  <select id="a-assignee" name="assigneeId" className="input" defaultValue={w.assigneeId ?? ""}>
                    <option value="">— None —</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Day" htmlFor="a-day" hint="A day makes it Scheduled.">
                  <input id="a-day" name="scheduledFor" type="date" className="input w-48" defaultValue={dateInput(w.scheduledFor)} />
                </Field>
                {hasClient ? (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="tellClient" defaultChecked className="h-4 w-4 rounded border-slate-300" /> Email the client the day
                  </label>
                ) : null}
                <SubmitButton pendingText="Saving…">Save</SubmitButton>
              </form>
            ) : (
              <p className="text-sm text-slate-700">
                {[w.vendor?.name, staff.find((s) => s.id === w.assigneeId)?.name].filter(Boolean).join(" · ") || "Nobody"}
                {w.scheduledFor ? ` · ${fmtDate(w.scheduledFor, "EEE, MMM d")}` : ""}
              </p>
            )}
            {w.vendor ? (
              <p className="text-xs text-slate-500">
                {w.vendor.name}
                {w.vendor.contact ? ` · ${w.vendor.contact}` : ""}
                {w.vendor.phone ? ` · ${w.vendor.phone}` : ""}
                {w.vendor.email ? ` · ${w.vendor.email}` : ""}
                {w.vendor.logins.length ? " · has a portal sign-in" : " · no portal sign-in (emailed only)"}
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={open ? "Close it out" : warrantyLabel(w.status)} />
          <CardBody className="space-y-3">
            {open ? (
              canEdit ? (
                <form action={closeWarranty} className="space-y-3">
                  <input type="hidden" name="id" value={w.id} />
                  <div className="flex flex-wrap gap-4 text-sm text-slate-700">
                    <label className="flex items-center gap-2">
                      <input type="radio" name="status" value="DONE" defaultChecked /> Done
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="radio" name="status" value="NOT_COVERED" /> Not covered
                    </label>
                  </div>
                  <Field label="What was done (or why it isn't covered)" htmlFor="c-note" hint="The client sees this.">
                    <textarea id="c-note" name="closeNote" className="input" rows={3} />
                  </Field>
                  <PhotoInput id="c-photos" label="After photos" />
                  {hasClient ? (
                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" name="tellClient" defaultChecked className="h-4 w-4 rounded border-slate-300" /> Email the client
                    </label>
                  ) : null}
                  <SubmitButton pendingText="Closing…">Close request</SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-slate-500">Open.</p>
              )
            ) : (
              <>
                <p className="text-sm text-slate-500">{fmtDate(w.closedAt)}</p>
                {w.closeNote ? <p className="whitespace-pre-line text-sm text-slate-800">{w.closeNote}</p> : null}
                {canEdit ? (
                  <form action={reopenWarranty}>
                    <input type="hidden" name="id" value={w.id} />
                    <SubmitButton variant="secondary" size="sm" pendingText="Reopening…">
                      Reopen
                    </SubmitButton>
                  </form>
                ) : null}
              </>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Notes" description="The client sees notes unless they're team only. The sub sees all of them." />
        <CardBody className="space-y-4">
          <WarrantyNotes notes={w.notes} showTeamOnly dateTime={clock.dateTime} />
          {canEdit ? (
            <form action={noteWarranty} className="space-y-3">
              <input type="hidden" name="id" value={w.id} />
              <textarea name="body" className="input" rows={3} placeholder="Write a note…" aria-label="Note" />
              <PhotoInput id="n-photos" />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" name="teamOnly" className="h-4 w-4 rounded border-slate-300" /> Team only (the client doesn&apos;t see it)
                </label>
                <SubmitButton pendingText="Adding…" variant="secondary">
                  Add note
                </SubmitButton>
              </div>
            </form>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

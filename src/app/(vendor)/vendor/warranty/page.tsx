import { ShieldCheck } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyClock } from "@/lib/company-zone";
import { fmtDate } from "@/lib/utils";
import { isOpen, sortWarranty, warrantyNo } from "@/lib/warranty";
import { Card, CardBody, CardHeader, Collapsible, EmptyState, Field, SubmitButton } from "@/components/ui";
import { PhotoInput, WarrantyNotes, WarrantyPhotos, WarrantyStatus } from "@/components/warranty/parts";
import { vendorWarrantyDay, vendorWarrantyDone, vendorWarrantyNote } from "../actions";

export const metadata = { title: "Warranty" };

const dateInput = (d: Date | null) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "");

/** Warranty work they've been sent to: where, what, who to call — set the day, mark it done. */
export default async function VendorWarrantyPage() {
  const user = await requireVendor();
  const clock = await companyClock();
  const rows = sortWarranty(
    await db.warrantyRequest.findMany({
      where: { vendorId: user.vendorId },
      take: 200,
      orderBy: { createdAt: "desc" },
      include: {
        project: { select: { name: true, address: true, city: true, state: true, client: { select: { firstName: true, lastName: true, phone: true } } } },
        notes: { orderBy: { createdAt: "asc" }, include: { author: { select: { name: true, role: true } } } },
        files: { orderBy: { createdAt: "asc" }, select: { id: true, name: true, mimeType: true } },
      },
    }),
  );
  const open = rows.filter((r) => isOpen(r.status));
  const closed = rows.filter((r) => !isOpen(r.status)).slice(0, 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Warranty work</h1>
        <p className="text-sm text-slate-500">Things to fix at finished homes. Call the homeowner, set the day you&apos;ll be there, and mark it done when it is.</p>
      </div>
      {open.length === 0 ? <EmptyState icon={ShieldCheck} title="No warranty work for you right now" /> : null}
      {open.map((r) => {
        const client = r.project.client;
        const where = [r.project.address, r.project.city, r.project.state].filter(Boolean).join(", ");
        return (
          <Card key={r.id}>
            <CardHeader
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {r.title} <WarrantyStatus status={r.status} urgent={r.urgent} />
                </span>
              }
              description={[warrantyNo(r.number), r.project.name, r.location].filter(Boolean).join(" · ")}
            />
            <CardBody className="space-y-3">
              <div className="text-sm text-slate-700">
                {where ? (
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(where)}`} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline">
                    {where}
                  </a>
                ) : null}
                {client ? (
                  <p>
                    Homeowner: {client.firstName} {client.lastName}
                    {client.phone ? (
                      <>
                        {" · "}
                        <a href={`tel:${client.phone}`} className="text-blue-700 hover:underline">
                          {client.phone}
                        </a>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
              {r.description ? <p className="whitespace-pre-line text-sm text-slate-800">{r.description}</p> : null}
              <WarrantyPhotos files={r.files} />
              <WarrantyNotes notes={r.notes} dateTime={clock.dateTime} />
              <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-3 md:grid-cols-2">
                <form action={vendorWarrantyDay} className="space-y-2">
                  <input type="hidden" name="id" value={r.id} />
                  <Field label="The day you'll be there" htmlFor={`d-${r.id}`} hint="The homeowner and the builder are told.">
                    <input id={`d-${r.id}`} name="scheduledFor" type="date" className="input w-48" defaultValue={dateInput(r.scheduledFor)} required />
                  </Field>
                  <SubmitButton pendingText="Saving…" variant="secondary" size="sm">
                    Set the day
                  </SubmitButton>
                </form>
                <form action={vendorWarrantyDone} className="space-y-2">
                  <input type="hidden" name="id" value={r.id} />
                  <Field label="What you did" htmlFor={`w-${r.id}`}>
                    <textarea id={`w-${r.id}`} name="closeNote" className="input" rows={2} required />
                  </Field>
                  <PhotoInput id={`a-${r.id}`} label="After photos" />
                  <SubmitButton pendingText="Saving…" size="sm">
                    Mark done
                  </SubmitButton>
                </form>
              </div>
              <Collapsible summary="Add a note for the builder">
                <form action={vendorWarrantyNote} className="space-y-2">
                  <input type="hidden" name="id" value={r.id} />
                  <textarea name="body" className="input" rows={2} aria-label="Note" placeholder="Needs a part, back on Tuesday…" />
                  <PhotoInput id={`n-${r.id}`} />
                  <SubmitButton pendingText="Sending…" variant="secondary" size="sm">
                    Send
                  </SubmitButton>
                </form>
              </Collapsible>
            </CardBody>
          </Card>
        );
      })}
      {closed.length ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-slate-700">Done lately</h2>
          <ul className="divide-y divide-slate-100 rounded-lg bg-white text-sm ring-1 ring-slate-200">
            {closed.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-slate-600">
                <span>
                  {r.title} <span className="text-slate-400">· {r.project.name}</span>
                </span>
                <span className="flex items-center gap-2 text-xs">
                  <WarrantyStatus status={r.status} /> {fmtDate(r.closedAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

import { ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { getClientProjects } from "@/lib/portal";
import { companyClock } from "@/lib/company-zone";
import { cn, fmtDate } from "@/lib/utils";
import { isOpen, showsWarranty, sortWarranty, warrantyNo, warrantyWords } from "@/lib/warranty";
import { Card, CardBody, CardHeader, Collapsible, EmptyState, Field, SubmitButton } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";
import { PhotoInput, WarrantyNotes, WarrantyPhotos, WarrantyStatus } from "@/components/warranty/parts";
import { clientWarrantyNote, reportWarranty } from "../actions";

export const metadata = { title: "Warranty" };

/** After move-in: report something to fix, and follow it to done. */
export default async function PortalWarrantyPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireClient();
  const { project: projectParam } = await searchParams;
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
  const period = warrantyWords(project.actualEndDate, company?.warrantyMonths ?? 12, clock.now, (d) => fmtDate(d, "MMMM d, yyyy"));
  const list = sortWarranty(rows);

  return (
    <>
      <PortalPageHeader title="Warranty" description={period.covered === null ? "Tell us about anything that needs fixing." : period.text} projects={finished} project={project} />
      <div className="space-y-6">
        <Collapsible summary="Report something that needs fixing" defaultOpen={list.length === 0}>
          <form action={reportWarranty} className="space-y-4">
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
                <span className="block text-xs text-slate-500">For an emergency, call us too{project.manager?.phone ? ` at ${project.manager.phone}` : ""}.</span>
              </span>
            </label>
            <SubmitButton pendingText="Sending…">Send request</SubmitButton>
          </form>
        </Collapsible>

        {list.length === 0 ? (
          <EmptyState icon={ShieldCheck} title="No requests yet" description="Anything you report shows here, with who's coming and when." />
        ) : (
          <div className="space-y-4">
            {list.map((r) => (
              <Card key={r.id} className={cn(!isOpen(r.status) && "opacity-90")}>
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {r.title} <WarrantyStatus status={r.status} urgent={r.urgent} />
                    </span>
                  }
                  description={[warrantyNo(r.number), r.location, `Reported ${fmtDate(r.createdAt)}`].filter(Boolean).join(" · ")}
                />
                <CardBody className="space-y-3">
                  {r.status === "SCHEDULED" && r.scheduledFor ? (
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
                  <WarrantyPhotos files={r.files} />
                  <WarrantyNotes notes={r.notes} dateTime={clock.dateTime} />
                  {isOpen(r.status) ? (
                    <Collapsible summary="Add a note or photo">
                      <form action={clientWarrantyNote} className="space-y-3">
                        <input type="hidden" name="id" value={r.id} />
                        <textarea name="body" className="input" rows={3} aria-label="Note" placeholder="Anything else we should know?" />
                        <PhotoInput id={`p-${r.id}`} />
                        <SubmitButton pendingText="Sending…" variant="secondary">
                          Send
                        </SubmitButton>
                      </form>
                    </Collapsible>
                  ) : null}
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

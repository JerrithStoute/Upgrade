import Link from "@/components/link";
import { ShieldCheck } from "lucide-react";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { companyClock } from "@/lib/company-zone";
import { cn, fmtDate } from "@/lib/utils";
import { isOpen, sortWarranty, warrantyNo, warrantyWords } from "@/lib/warranty";
import { Card, CardBody, Collapsible, EmptyState, Field, SubmitButton, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { PhotoInput, WarrantyStatus } from "@/components/warranty/parts";
import { addWarranty } from "./actions";

export const metadata = { title: "Warranty" };

/** A finished job's warranty requests: the client's (from their portal) and the ones you add. */
export default async function ProjectWarrantyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireView("field");
  const { id } = await params;
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
  const period = warrantyWords(project.actualEndDate, months, clock.now, (d) => fmtDate(d));
  const list = sortWarranty(rows);
  const open = list.filter((r) => isOpen(r.status)).length;
  const canEdit = allows(user.access, "field", 2);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-900">Warranty</h2>
        <p className={cn("text-sm", period.covered === false ? "text-amber-800" : "text-slate-600")}>
          {period.text}{" "}
          {period.covered === null && canEdit ? (
            <Link href={`/projects/${project.id}/edit`} className="font-medium text-blue-700 hover:underline">
              Set the end date
            </Link>
          ) : (
            <span className="text-slate-400">({months} months — Settings → Company)</span>
          )}
        </p>
      </div>

      {canEdit ? (
        <Collapsible summary="Add a warranty request" defaultOpen={rows.length === 0}>
          <form action={addWarranty} className="space-y-4">
            <input type="hidden" name="projectId" value={project.id} />
            <p className="text-sm text-slate-500">
              From a phone call or a walk-through. {project.clientId ? "Your client can also report them from their portal's Warranty tab." : null}
            </p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="What needs fixing?" htmlFor="w-title">
                <input id="w-title" name="title" className="input" required maxLength={200} placeholder="Drywall crack over the stairs" />
              </Field>
              <Field label="Where in the house?" htmlFor="w-location">
                <input id="w-location" name="location" className="input" maxLength={120} placeholder="Stairway" />
              </Field>
            </div>
            <Field label="Details" htmlFor="w-description">
              <textarea id="w-description" name="description" className="input" rows={3} />
            </Field>
            <PhotoInput />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="urgent" className="h-4 w-4 rounded border-slate-300" /> Urgent — water, no heat, safety
            </label>
            <SubmitButton pendingText="Adding…">Add request</SubmitButton>
          </form>
        </Collapsible>
      ) : null}

      {list.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No warranty requests" description="When your client reports something to fix, or you add one, it shows here until it's done." />
      ) : (
        <Card>
          <CardBody className="p-0">
            <p className="border-b border-slate-100 px-5 py-2.5 text-sm text-slate-600">
              {open ? `${open} open` : "Nothing open"} · {list.length} in all
            </p>
            <Table>
              <THead>
                <tr>
                  <Th>#</Th>
                  <Th>What</Th>
                  <Th>Status</Th>
                  <Th>Who&apos;s fixing it</Th>
                  <Th>Reported</Th>
                </tr>
              </THead>
              <TBody>
                {list.map((r) => (
                  <Tr key={r.id} className={cn(!isOpen(r.status) && "text-slate-500")}>
                    <Td className="whitespace-nowrap text-xs text-slate-500">{warrantyNo(r.number)}</Td>
                    <Td>
                      <Link href={`/projects/${project.id}/warranty/${r.id}`} className="font-medium text-blue-700 hover:underline">
                        {r.title}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {[r.location, r._count.files ? `${r._count.files} photo${r._count.files === 1 ? "" : "s"}` : null].filter(Boolean).join(" · ")}
                      </span>
                    </Td>
                    <Td>
                      <WarrantyStatus status={r.status} urgent={r.urgent} />
                      {r.status === "SCHEDULED" && r.scheduledFor ? <span className="block text-xs text-slate-500">{fmtDate(r.scheduledFor, "EEE, MMM d")}</span> : null}
                    </Td>
                    <Td className="text-sm">{[r.vendor?.name, r.assignee?.name].filter(Boolean).join(" · ") || <span className="text-slate-400">Nobody yet</span>}</Td>
                    <Td className="whitespace-nowrap text-xs">
                      {fmtDate(r.createdAt)}
                      <span className="block text-slate-400">{r.fromClient ? "by the client" : "by the team"}</span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

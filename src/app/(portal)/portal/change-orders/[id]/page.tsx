import { notFound } from "next/navigation";
import { Check, X } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPortalProject, portalHref } from "@/lib/portal";
import { fmtDate, fmtDateTime, money, num, linePrice, sum } from "@/lib/utils";
import { Badge, Card, CardBody, CardHeader, PageHeader, SubmitButton, Field, Table, THead, TBody, Tr, Th, Td, TFoot } from "@/components/ui";
import { PrintButton } from "@/components/portal/print-button";
import { approveChangeOrder, declineChangeOrder } from "../../actions";

export const metadata = { title: "Change Order" };

export default async function PortalChangeOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  const co = await db.changeOrder.findFirst({
    where: { id, status: { not: "DRAFT" }, project: { clientId: user.clientId } },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!co) notFound();
  const project = await getPortalProject(user.clientId, co.projectId);
  const total = sum(co.items.map(linePrice));
  const pending = co.status === "PENDING_APPROVAL";

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Change Orders", href: portalHref("/portal/change-orders", project.id) }, { label: `#${co.number}` }]}
        title={`Change Order #${co.number}: ${co.title}`}
        meta={<Badge status={co.status} />}
        description={`${project.name} · Sent ${fmtDate(co.sentAt ?? co.createdAt)}`}
        actions={<PrintButton />}
      />

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="What's changing" />
            <CardBody className="space-y-4 text-sm text-slate-700">
              <div>
                <p className="label">Description</p>
                <p className="whitespace-pre-line">{co.description || "—"}</p>
              </div>
              <div>
                <p className="label">Reason</p>
                <p className="whitespace-pre-line">{co.reason || "—"}</p>
              </div>
            </CardBody>
          </Card>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <Card>
              <CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Price change</p>
                <p className={`mt-1 text-2xl font-semibold tabular-nums ${total < 0 ? "text-emerald-700" : "text-slate-900"}`}>
                  {total < 0 ? "−" : "+"}
                  {money(Math.abs(total))}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Schedule impact</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
                  {co.scheduleImpactDays ? `${co.scheduleImpactDays > 0 ? "+" : ""}${co.scheduleImpactDays} days` : "None"}
                </p>
              </CardBody>
            </Card>
          </div>
        </div>

        <Table>
          <THead>
            <tr>
              <Th>Item</Th>
              <Th right>Qty</Th>
              <Th>Unit</Th>
              <Th right>Unit price</Th>
              <Th right>Price</Th>
            </tr>
          </THead>
          <TBody>
            {co.items.map((item) => {
              const price = linePrice(item);
              return (
                <Tr key={item.id}>
                  <Td>{item.description}</Td>
                  <Td right>{num(item.quantity)}</Td>
                  <Td>{item.unit}</Td>
                  <Td right>{money(item.quantity ? price / item.quantity : 0)}</Td>
                  <Td right>{money(price)}</Td>
                </Tr>
              );
            })}
            {co.items.length === 0 ? (
              <Tr>
                <td className="px-4 py-2.5 text-slate-500" colSpan={5}>
                  No line items.
                </td>
              </Tr>
            ) : null}
          </TBody>
          <TFoot>
            <tr>
              <td colSpan={4} className="px-4 py-2.5 text-right font-semibold">
                Total
              </td>
              <Td right className="font-semibold">
                {money(total)}
              </Td>
            </tr>
          </TFoot>
        </Table>

        {pending ? (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="border-emerald-200">
              <CardHeader title="Approve this change order" description="Typing your name acts as your electronic signature." />
              <CardBody>
                <form action={approveChangeOrder} className="space-y-4">
                  <input type="hidden" name="id" value={co.id} />
                  <Field label="Your full name (signature)" htmlFor="signature">
                    <input id="signature" name="signature" className="input" required defaultValue={user.name} autoComplete="name" />
                  </Field>
                  <Field label="Note (optional)" htmlFor="approve-note">
                    <textarea id="approve-note" name="note" className="input" rows={2} />
                  </Field>
                  <p className="text-xs text-slate-500">
                    By approving, you authorize the work above for {money(total)} and accept the schedule impact of{" "}
                    {co.scheduleImpactDays || 0} day{co.scheduleImpactDays === 1 ? "" : "s"}.
                  </p>
                  <SubmitButton variant="success" pendingText="Approving…">
                    <Check className="h-4 w-4" /> Approve change order
                  </SubmitButton>
                </form>
              </CardBody>
            </Card>
            <Card className="border-rose-200">
              <CardHeader title="Decline" description="Let your team know why so they can revise it." />
              <CardBody>
                <form action={declineChangeOrder} className="space-y-4">
                  <input type="hidden" name="id" value={co.id} />
                  <Field label="Reason (optional)" htmlFor="decline-note">
                    <textarea id="decline-note" name="note" className="input" rows={4} />
                  </Field>
                  <SubmitButton variant="danger" pendingText="Declining…">
                    <X className="h-4 w-4" /> Decline change order
                  </SubmitButton>
                </form>
              </CardBody>
            </Card>
          </div>
        ) : (
          <Card>
            <CardHeader title="Decision" />
            <CardBody>
              <dl className="grid gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="label">Status</dt>
                  <dd>
                    <Badge status={co.status} />
                  </dd>
                </div>
                <div>
                  <dt className="label">Decided by</dt>
                  <dd className="text-slate-800">{co.decidedBy || "—"}</dd>
                </div>
                <div>
                  <dt className="label">Decided on</dt>
                  <dd className="text-slate-800">{co.decidedAt ? fmtDateTime(co.decidedAt) : "—"}</dd>
                </div>
                {co.decisionNote ? (
                  <div className="sm:col-span-3">
                    <dt className="label">Note</dt>
                    <dd className="whitespace-pre-line text-slate-800">{co.decisionNote}</dd>
                  </div>
                ) : null}
              </dl>
            </CardBody>
          </Card>
        )}
      </div>
    </>
  );
}

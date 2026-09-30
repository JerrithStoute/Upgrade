import Link from "next/link";
import { Receipt } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext, invoiceTotals } from "@/lib/portal";
import { fmtDate, money, sum } from "@/lib/utils";
import { Badge, EmptyState, Table, THead, TBody, Tr, Th, Td, TFoot, Stat } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";

export const metadata = { title: "Invoices" };

export default async function PortalInvoicesPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireClient();
  const { project: projectParam } = await searchParams;
  const { projects, project } = await portalContext(user.clientId, projectParam);

  if (!project) {
    return (
      <>
        <PortalPageHeader title="Invoices" projects={projects} project={null} />
        <EmptyState icon={Receipt} title="No projects yet" description="Invoices will appear here once your project is set up." />
      </>
    );
  }

  const invoices = await db.invoice.findMany({
    where: { projectId: project.id, status: { not: "DRAFT" } },
    orderBy: { number: "desc" },
    include: { items: true, payments: true },
  });
  const rows = invoices.map((inv) => ({ ...inv, ...invoiceTotals(inv) }));
  const live = rows.filter((r) => r.status !== "VOID");
  const totalInvoiced = sum(live.map((r) => r.total));
  const totalPaid = sum(live.map((r) => r.paid));
  const balance = totalInvoiced - totalPaid;

  return (
    <>
      <PortalPageHeader title="Invoices" description="Billing history and outstanding balance for your project." projects={projects} project={project} />
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Total invoiced" value={money(totalInvoiced)} />
          <Stat label="Paid" value={money(totalPaid)} tone="good" />
          <Stat label="Balance due" value={money(balance)} tone={balance > 0.005 ? "warn" : "default"} />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={Receipt} title="No invoices yet" description="You haven't been invoiced on this project." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>#</Th>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th right>Total</Th>
                <Th right>Paid</Th>
                <Th right>Balance</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((inv) => (
                <Tr key={inv.id} className={inv.balance > 0.005 && inv.status !== "VOID" ? "bg-amber-50/40" : undefined}>
                  <Td className="tabular-nums">{inv.number}</Td>
                  <Td>
                    <Link href={`/portal/invoices/${inv.id}`} className="font-medium text-blue-700 hover:underline">
                      {inv.title}
                    </Link>
                  </Td>
                  <Td>
                    <Badge status={inv.status} />
                  </Td>
                  <Td>{fmtDate(inv.issueDate)}</Td>
                  <Td>{fmtDate(inv.dueDate)}</Td>
                  <Td right>{money(inv.total)}</Td>
                  <Td right>{money(inv.paid)}</Td>
                  <Td right className={inv.balance > 0.005 && inv.status !== "VOID" ? "font-semibold text-amber-800" : undefined}>
                    {inv.status === "VOID" ? "—" : money(inv.balance)}
                  </Td>
                </Tr>
              ))}
            </TBody>
            <TFoot>
              <tr>
                <td colSpan={5} className="px-4 py-2.5 text-right">
                  Totals
                </td>
                <Td right>{money(totalInvoiced)}</Td>
                <Td right>{money(totalPaid)}</Td>
                <Td right>{money(balance)}</Td>
              </tr>
            </TFoot>
          </Table>
        )}
      </div>
    </>
  );
}

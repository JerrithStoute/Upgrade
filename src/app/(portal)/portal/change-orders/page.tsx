import Link from "next/link";
import { FileDiff } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext } from "@/lib/portal";
import { fmtDate, money, linePrice, sum } from "@/lib/utils";
import { Badge, EmptyState, Table, THead, TBody, Tr, Th, Td, Stat } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";

export const metadata = { title: "Change Orders" };

export default async function PortalChangeOrdersPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireClient();
  const { project: projectParam } = await searchParams;
  const { projects, project } = await portalContext(user.clientId, projectParam);

  if (!project) {
    return (
      <>
        <PortalPageHeader title="Change Orders" projects={projects} project={null} />
        <EmptyState icon={FileDiff} title="No projects yet" description="Change orders will appear here once your project is set up." />
      </>
    );
  }

  const changeOrders = await db.changeOrder.findMany({
    where: { projectId: project.id, status: { not: "DRAFT" } },
    orderBy: { number: "desc" },
    include: { items: true },
  });
  const rows = changeOrders.map((co) => ({ ...co, total: sum(co.items.map(linePrice)) }));
  const pending = rows.filter((r) => r.status === "PENDING_APPROVAL");
  const approved = rows.filter((r) => r.status === "APPROVED");

  return (
    <>
      <PortalPageHeader
        title="Change Orders"
        description="Changes to the original scope of work. Items awaiting your approval are highlighted."
        projects={projects}
        project={project}
      />
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Awaiting approval" value={pending.length} tone={pending.length ? "warn" : "default"} hint={money(sum(pending.map((r) => r.total)))} />
          <Stat label="Approved" value={approved.length} hint={money(sum(approved.map((r) => r.total)))} tone="good" />
          <Stat label="Schedule impact" value={`${sum(approved.map((r) => r.scheduleImpactDays))} days`} hint="From approved change orders" />
        </div>
        {rows.length === 0 ? (
          <EmptyState icon={FileDiff} title="No change orders" description="There are no change orders on this project." />
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>#</Th>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th right>Total</Th>
                <Th right>Schedule</Th>
                <Th>Sent</Th>
                <Th>Decided</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((co) => (
                <Tr key={co.id} className={co.status === "PENDING_APPROVAL" ? "bg-amber-50/40" : undefined}>
                  <Td className="tabular-nums">{co.number}</Td>
                  <Td>
                    <Link href={`/portal/change-orders/${co.id}`} className="font-medium text-blue-700 hover:underline">
                      {co.title}
                    </Link>
                  </Td>
                  <Td>
                    <Badge status={co.status} />
                  </Td>
                  <Td right>{money(co.total)}</Td>
                  <Td right>{co.scheduleImpactDays ? `${co.scheduleImpactDays > 0 ? "+" : ""}${co.scheduleImpactDays} days` : "—"}</Td>
                  <Td>{fmtDate(co.sentAt)}</Td>
                  <Td>{fmtDate(co.decidedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </>
  );
}

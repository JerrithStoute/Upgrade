import Link from "@/components/link";
import { FileText } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext } from "@/lib/portal";
import { loadProposal } from "@/lib/proposal-data";
import { buildProposal } from "@/lib/proposal-options";
import { fmtDate, money } from "@/lib/utils";
import { Badge, EmptyState, Table, THead, TBody, Tr, Th, Td } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";

export const metadata = { title: "Proposals" };

export default async function PortalProposalsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireClient();
  const { project: projectParam } = await searchParams;
  const { projects, project } = await portalContext(user.clientId, projectParam);

  if (!project) {
    return (
      <>
        <PortalPageHeader title="Proposals" projects={projects} project={null} />
        <EmptyState icon={FileText} title="No projects yet" description="Your proposal will appear here once your builder sends it." />
      </>
    );
  }

  // Only what's been sent — a draft is still being worked on.
  const sent = await db.estimate.findMany({
    where: { projectId: project.id, status: { in: ["SENT", "APPROVED", "DECLINED"] } },
    orderBy: { version: "desc" },
    select: { id: true, name: true, version: true, status: true, sentAt: true, decidedAt: true, approvedAt: true, basePrice: true },
  });
  const rows = await Promise.all(
    sent.map(async (e) => {
      const p = await loadProposal(project.id, e.id);
      return { ...e, total: p ? buildProposal(p.specs, p.options, e.basePrice, p.extras).total : 0 };
    }),
  );

  return (
    <>
      <PortalPageHeader title="Proposals" description="What your builder has proposed for this project. One waiting for your answer is highlighted." projects={projects} project={project} />
      {rows.length === 0 ? (
        <EmptyState icon={FileText} title="No proposal yet" description="Your proposal will appear here once your builder sends it." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Proposal</Th>
              <Th>Status</Th>
              <Th right>Total</Th>
              <Th>Sent</Th>
              <Th>Answered</Th>
            </tr>
          </THead>
          <TBody>
            {rows.map((e) => (
              <Tr key={e.id} className={e.status === "SENT" ? "bg-amber-50/40" : undefined}>
                <Td>
                  <Link href={`/portal/proposals/${e.id}`} className="font-medium text-blue-700 hover:underline">
                    {e.name}
                    {rows.length > 1 ? ` (version ${e.version})` : ""}
                  </Link>
                </Td>
                <Td>{e.status === "SENT" ? <Badge status="PENDING_APPROVAL">Waiting for your answer</Badge> : <Badge status={e.status} />}</Td>
                <Td right>{money(e.total)}</Td>
                <Td>{fmtDate(e.sentAt)}</Td>
                <Td>{fmtDate(e.decidedAt ?? e.approvedAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </>
  );
}

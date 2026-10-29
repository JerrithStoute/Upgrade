import Link from "@/components/link";
import { ShieldCheck } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn, fmtDate } from "@/lib/utils";
import { isOpen, OPEN_WARRANTY, sortWarranty, warrantyNo } from "@/lib/warranty";
import { Card, CardBody, EmptyState, PageHeader, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { WarrantyStatus } from "@/components/warranty/parts";

export const metadata = { title: "Warranty" };

const SHOWS = [
  { key: "open", label: "Open" },
  { key: "done", label: "Closed" },
  { key: "all", label: "All" },
] as const;

/** Every job's warranty requests in one list — what's still to fix, and who's on it. */
export default async function WarrantyPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireView("field");
  const sp = await searchParams;
  const show = sp.show === "done" || sp.show === "all" ? sp.show : "open";
  const where: Prisma.WarrantyRequestWhereInput = show === "open" ? { status: { in: OPEN_WARRANTY } } : show === "done" ? { status: { notIn: OPEN_WARRANTY } } : {};
  const rows = sortWarranty(
    await db.warrantyRequest.findMany({
      where,
      take: 500,
      orderBy: { createdAt: "desc" },
      include: { project: { select: { id: true, number: true, name: true } }, vendor: { select: { name: true } }, assignee: { select: { name: true } } },
    }),
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Warranty" description="Requests from every finished job — the client's, from their portal, and the ones you add on a job's Warranty tab." />
      <nav className="flex gap-1" aria-label="Show">
        {SHOWS.map((s) => (
          <Link
            key={s.key}
            href={s.key === "open" ? "/warranty" : `/warranty?show=${s.key}`}
            className={cn("rounded-md px-3 py-1.5 text-sm font-medium", show === s.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
          >
            {s.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={show === "open" ? "Nothing to fix right now" : "No warranty requests"}
          description="When a client reports something from their portal, it shows here and on the job's Warranty tab."
        />
      ) : (
        <Card>
          <CardBody className="p-0">
            <Table>
              <THead>
                <tr>
                  <Th>#</Th>
                  <Th>Job</Th>
                  <Th>What</Th>
                  <Th>Status</Th>
                  <Th>Who&apos;s fixing it</Th>
                  <Th>Reported</Th>
                </tr>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <Tr key={r.id} className={cn(!isOpen(r.status) && "text-slate-500")}>
                    <Td className="whitespace-nowrap text-xs text-slate-500">{warrantyNo(r.number)}</Td>
                    <Td className="text-sm">
                      <Link href={`/projects/${r.project.id}/warranty`} className="hover:underline">
                        #{r.project.number} {r.project.name}
                      </Link>
                    </Td>
                    <Td>
                      <Link href={`/projects/${r.project.id}/warranty/${r.id}`} className="font-medium text-blue-700 hover:underline">
                        {r.title}
                      </Link>
                      {r.location ? <span className="block text-xs text-slate-500">{r.location}</span> : null}
                    </Td>
                    <Td>
                      <WarrantyStatus status={r.status} urgent={r.urgent} />
                      {r.status === "SCHEDULED" && r.scheduledFor ? <span className="block text-xs text-slate-500">{fmtDate(r.scheduledFor, "EEE, MMM d")}</span> : null}
                    </Td>
                    <Td className="text-sm">{[r.vendor?.name, r.assignee?.name].filter(Boolean).join(" · ") || <span className="text-slate-400">Nobody yet</span>}</Td>
                    <Td className="whitespace-nowrap text-xs">{fmtDate(r.createdAt)}</Td>
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

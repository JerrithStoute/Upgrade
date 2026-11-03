import Link from "@/components/link";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext } from "@/lib/portal";
import { loadProposal } from "@/lib/proposal-data";
import { buildProposal, proposalExpired } from "@/lib/proposal-options";
import { companyClock } from "@/lib/company-zone";
import { cn, fmtDate, money } from "@/lib/utils";
import { EmptyState } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";

export const metadata = { title: "Proposals" };

export default async function PortalProposalsPage({ searchParams }: { searchParams: Promise<{ project?: string; list?: string }> }) {
  const user = await requireClient();
  const { project: projectParam, list } = await searchParams;
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
  const today = fmtDate((await companyClock()).now, "yyyy-MM-dd");
  const rows = await Promise.all(
    sent.map(async (e) => {
      const p = await loadProposal(project.id, e.id);
      return {
        ...e,
        total: p ? buildProposal(p.specs, p.options, e.basePrice, p.extras).total : 0,
        // Past its good-through day: it can't be approved, only asked about.
        expired: !!p && e.status === "SENT" && proposalExpired(p.pricedOn, p.options.validDays, today),
      };
    }),
  );

  // Most jobs have one: the tab opens it.
  if (rows.length === 1 && !list) redirect(`/portal/proposals/${rows[0].id}`);
  const ordered = [...rows.filter((r) => r.status === "SENT"), ...rows.filter((r) => r.status !== "SENT")];

  return (
    <>
      <PortalPageHeader title="Proposals" description="What your builder has proposed for this project." projects={projects} project={project} />
      {rows.length === 0 ? (
        <EmptyState icon={FileText} title="No proposal yet" description="Your proposal will appear here once your builder sends it." />
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {ordered.map((e) => {
            const waiting = e.status === "SENT" && !e.expired;
            const when = e.expired ? `Sent ${fmtDate(e.sentAt, "MMM d")} · pricing expired` : waiting ? `Sent ${fmtDate(e.sentAt, "MMM d")}` : e.status === "APPROVED" ? `Approved ${fmtDate(e.decidedAt ?? e.approvedAt, "MMM d")}` : `Declined ${fmtDate(e.decidedAt, "MMM d")}`;
            return (
              <li key={e.id}>
                <Link
                  href={`/portal/proposals/${e.id}`}
                  className={cn("flex items-center justify-between gap-3 px-4 py-2.5", waiting ? "bg-amber-50/70 hover:bg-amber-50" : "hover:bg-slate-50", e.status === "DECLINED" && "opacity-60")}
                >
                  <span className="min-w-0">
                    <span className={cn("line-clamp-2 block text-sm", waiting ? "font-medium text-amber-900" : "text-slate-900")}>
                      {e.name}
                      {rows.length > 1 ? ` (version ${e.version})` : ""}
                    </span>
                    <span className={cn("block text-xs", waiting ? "text-amber-800" : "text-slate-500")}>{when}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    <span className="text-right">
                      <span className={cn("block text-sm tabular-nums", waiting ? "font-semibold text-amber-900" : "text-slate-900")}>{money(e.total)}</span>
                      {waiting ? null : <span className={cn("block text-xs", e.status === "APPROVED" ? "text-emerald-700" : "text-slate-500")}>{e.expired ? "Expired" : e.status === "APPROVED" ? "Approved" : "Declined"}</span>}
                    </span>
                    {waiting ? <span className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white">Review</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

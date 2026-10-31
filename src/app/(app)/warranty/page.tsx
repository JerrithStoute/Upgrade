import Link from "@/components/link";
import type { Prisma } from "@prisma/client";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { cn } from "@/lib/utils";
import { OPEN_WARRANTY, sortWarranty } from "@/lib/warranty";
import { PageHeader } from "@/components/ui";
import { ListFind } from "@/components/list-find";
import { WarrantyTable } from "@/components/warranty/table";

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
      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <ListFind listId="warranty-list" placeholder="Find by job, what, or who's fixing it…" />
          <nav className="flex gap-1" aria-label="Show">
            {SHOWS.map((s) => (
              <Link
                key={s.key}
                href={s.key === "open" ? "/warranty" : `/warranty?show=${s.key}`}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium", show === s.key ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}
              >
                {s.label}
              </Link>
            ))}
          </nav>
        </header>
        <div id="warranty-list">
          <WarrantyTable
            rows={rows}
            showJob
            empty={
              show === "open"
                ? "Nothing to fix right now. When a client reports something from their portal, it shows here and on the job's Warranty tab."
                : "No warranty requests."
            }
          />
        </div>
      </section>
    </div>
  );
}

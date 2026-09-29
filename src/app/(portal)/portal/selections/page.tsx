import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext } from "@/lib/portal";
import { fmtDate, money } from "@/lib/utils";
import { Badge, Card, CardHeader, EmptyState, Stat } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";

export const metadata = { title: "Selections" };

export default async function PortalSelectionsPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const user = await requireClient();
  const { project: projectParam } = await searchParams;
  const { projects, project } = await portalContext(user.clientId, projectParam);

  if (!project) {
    return (
      <>
        <PortalPageHeader title="Selections" projects={projects} project={null} />
        <EmptyState icon={ListChecks} title="No projects yet" description="Selections will appear here once your project is set up." />
      </>
    );
  }

  const selections = await db.selection.findMany({
    where: { projectId: project.id },
    orderBy: [{ category: "asc" }, { dueDate: "asc" }, { title: "asc" }],
    include: { options: { select: { id: true, name: true, price: true } } },
  });

  const groups = new Map<string, typeof selections>();
  for (const s of selections) {
    const list = groups.get(s.category) ?? [];
    list.push(s);
    groups.set(s.category, list);
  }
  const pending = selections.filter((s) => s.status === "PENDING").length;
  const awaiting = selections.filter((s) => s.status === "CHOSEN").length;
  const decided = selections.length - pending - awaiting;

  return (
    <>
      <PortalPageHeader
        title="Selections"
        description="Choose finishes and fixtures for your project. Each item has an allowance included in your contract."
        projects={projects}
        project={project}
      />
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Needs your choice" value={pending} tone={pending ? "warn" : "default"} />
          <Stat label="Awaiting your approval" value={awaiting} tone={awaiting ? "warn" : "default"} />
          <Stat label="Finalized" value={decided} tone="good" />
        </div>

        {selections.length === 0 ? (
          <EmptyState icon={ListChecks} title="No selections yet" description="Your team hasn't added any selections for this project." />
        ) : (
          [...groups.entries()].map(([category, items]) => (
            <Card key={category}>
              <CardHeader title={category} description={`${items.length} item${items.length === 1 ? "" : "s"}`} />
              <ul className="divide-y divide-slate-100">
                {items.map((s) => {
                  const chosen = s.options.find((o) => o.id === s.chosenOptionId);
                  const diff = chosen ? chosen.price - s.allowance : null;
                  return (
                    <li key={s.id}>
                      <Link href={`/portal/selections/${s.id}`} className="flex items-center justify-between gap-4 px-5 py-3 hover:bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900">
                            {s.title}
                            <Badge status={s.status} />
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {s.location ? `${s.location} · ` : ""}
                            Allowance {money(s.allowance)}
                            {s.dueDate ? ` · Due ${fmtDate(s.dueDate)}` : ""}
                            {" · "}
                            {s.options.length} option{s.options.length === 1 ? "" : "s"}
                          </p>
                          {chosen ? (
                            <p className="mt-0.5 text-xs text-slate-700">
                              Chosen: <span className="font-medium">{chosen.name}</span> · {money(chosen.price)}
                              {diff !== null && Math.abs(diff) > 0.005 ? (
                                <span className={diff > 0 ? "text-rose-700" : "text-emerald-700"}>
                                  {" "}
                                  ({diff > 0 ? "+" : "−"}
                                  {money(Math.abs(diff))} {diff > 0 ? "over" : "under"} allowance)
                                </span>
                              ) : null}
                            </p>
                          ) : (
                            <p className="mt-0.5 text-xs text-amber-700">No option chosen yet</p>
                          )}
                        </div>
                        <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))
        )}
      </div>
    </>
  );
}

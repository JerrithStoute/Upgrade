import Link from "next/link";
import { ListChecks } from "lucide-react";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { portalContext } from "@/lib/portal";
import { boardForViewer } from "@/lib/selections";
import { deadlineState } from "@/lib/deadlines";
import { money } from "@/lib/utils";
import { Badge, EmptyState, Stat } from "@/components/ui";
import { PortalPageHeader } from "@/components/portal/page-header";
import { PortalSelectionCards, type PortalCard } from "@/components/portal/selection-cards";

export const metadata = { title: "Selections" };

/**
 * The client's selections, like the CoConstruct client view: spec text and notes,
 * the allowance, the choices (with pictures) and "I do not want this selection",
 * Make Choice, files and comments. Never the budget, your costs or team-only notes.
 */
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

  const { cards, others } = await boardForViewer(project.id, user.id, true, { markSeen: !user.preview });
  // Only what the client may see.
  const safe: PortalCard[] = cards.map((c) => ({
    selectionId: c.selectionId,
    name: c.name,
    division: c.division,
    specText: c.specText,
    clientNotes: c.clientNotes,
    allowance: c.allowance,
    choices: c.choices.map((x) => ({
      id: x.id,
      name: x.name,
      description: x.description,
      price: x.price,
      vendor: x.vendor,
      modelNumber: x.modelNumber,
      pictureId: x.pictureId,
      pictureSeen: x.pictureSeen,
      files: x.files,
    })),
    chosenId: c.chosenId,
    status: c.status,
    deadline: c.deadline.date,
    deadlineTask: c.deadline.task?.name ?? null,
    updated: c.updated,
    comments: c.comments.filter((m) => !m.internal),
    files: c.files,
  }));
  const waiting = safe.filter((c) => c.status === "PENDING").length;
  const overdue = safe.filter((c) => deadlineState(c.deadline, c.status) === "overdue").length;
  const otherList = others.length ? await db.selection.findMany({ where: { id: { in: others.map((o) => o.id) } }, orderBy: [{ category: "asc" }, { title: "asc" }] }) : [];

  return (
    <>
      <PortalPageHeader
        title="Selections"
        description="Choose the finishes and fixtures for your home. Allowances are included in your contract; a choice over or under its allowance is adjusted on a change order."
        projects={projects}
        project={project}
      />
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Stat label="Needs your choice" value={waiting} tone={waiting ? "warn" : "default"} />
          <Stat label="Past the deadline" value={overdue} tone={overdue ? "bad" : "default"} />
          <Stat label="Chosen" value={safe.length - waiting} tone="good" />
        </div>

        {safe.length === 0 && otherList.length === 0 ? (
          <EmptyState icon={ListChecks} title="No selections yet" description="Your builder hasn't added any selections for this project yet." />
        ) : (
          <PortalSelectionCards cards={safe} />
        )}

        {otherList.length ? (
          <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-slate-900">Other selections</h3>
            <ul className="mt-2 divide-y divide-slate-100 text-sm">
              {otherList.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={`/portal/selections/${s.id}`} className="font-medium text-slate-800 hover:text-blue-700 hover:underline">
                    {s.title}
                  </Link>
                  <span className="flex items-center gap-2 text-xs text-slate-500">
                    {s.allowance ? `Allowance ${money(s.allowance)}` : null}
                    <Badge status={s.status} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}

import Link from "next/link";
import { Palette, Plus } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { boardForViewer, scheduleOptions } from "@/lib/selections";
import { deadlineState } from "@/lib/deadlines";
import { money } from "@/lib/utils";
import { Badge, ButtonLink, EmptyState, Stat } from "@/components/ui";
import { SelectionsBoard } from "./_components/selections-board";

/**
 * The job's selections, from its estimate: every category marked Selection or with
 * an allowance. Choices, the client's pick and over / under live here; names, spec
 * text and allowances follow the estimate.
 */
export default async function SelectionsPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  const [{ estimate, cards, others, profitDefault }, tasks] = await Promise.all([boardForViewer(project.id, user.id, false), scheduleOptions(project.id)]);
  const overdue = cards.filter((c) => deadlineState(c.deadline.date, c.status) === "overdue").length;

  const allowances = cards.reduce((n, c) => n + (c.allowance ?? 0), 0);
  const made = cards.filter((c) => c.status !== "PENDING");
  const diff = cards.reduce((n, c) => {
    if (c.allowance === null) return n;
    if (c.status === "DECLINED") return n - c.allowance;
    const pick = c.choices.find((x) => x.id === c.chosenId);
    return pick ? n + pick.price - c.allowance : n;
  }, 0);

  if (!estimate) {
    return (
      <EmptyState
        icon={Palette}
        title="No estimate yet"
        description="Selections come from the estimate: mark a category as a Selection, or tick Allowance, and it shows up here with its choices."
        action={<ButtonLink href={`/projects/${project.id}/estimate`}>Go to the estimate</ButtonLink>}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Selections" value={String(cards.length)} hint={`From estimate v${estimate.version} (${estimate.status.toLowerCase()})`} />
        <Stat label="Still to choose" value={String(cards.length - made.length)} tone={overdue ? "bad" : undefined} hint={overdue ? `${overdue} overdue` : undefined} />
        <Stat label="Allowances" value={money(allowances)} />
        <Stat
          label="Over / under"
          value={`${diff > 0.004 ? "+" : ""}${money(diff)}`}
          tone={diff > 0.004 ? "bad" : diff < -0.004 ? "good" : undefined}
          hint="Choices made vs. their allowances"
        />
      </div>

      {cards.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No selections on this estimate"
          description="On the estimate, open a category and switch it to Selection, or tick Allowance. It shows up here with its choices."
          action={<ButtonLink href={`/projects/${project.id}/estimate?estimate=${estimate.id}`}>Open the estimate</ButtonLink>}
        />
      ) : (
        <SelectionsBoard
          projectId={project.id}
          estimateHref={`/projects/${project.id}/estimate?estimate=${estimate.id}`}
          cards={cards}
          profitDefault={profitDefault}
          tasks={tasks}
        />
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Other selections</h3>
            <p className="text-xs text-slate-500">Selections that aren&apos;t on the estimate (added by hand, or from a category since removed).</p>
          </div>
          <ButtonLink href={`/projects/${project.id}/selections/new`} variant="secondary" size="sm">
            <Plus className="h-3.5 w-3.5" /> New selection
          </ButtonLink>
        </div>
        {others.length ? (
          <ul className="mt-3 divide-y divide-slate-100 text-sm">
            {others.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-2">
                <Link href={`/projects/${project.id}/selections/${s.id}`} className="font-medium text-slate-800 hover:text-blue-700 hover:underline">
                  {s.title}
                </Link>
                <span className="flex items-center gap-2 text-xs text-slate-500">
                  {s.allowance ? `Allowance ${money(s.allowance)}` : null}
                  <Badge status={s.status} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

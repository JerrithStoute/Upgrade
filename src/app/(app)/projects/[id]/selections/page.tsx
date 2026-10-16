import Link from "@/components/link";
import { Palette, Plus } from "lucide-react";
import { requireView } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { boardForViewer, scheduleOptions } from "@/lib/selections";
import { deadlineState } from "@/lib/deadlines";
import { money } from "@/lib/utils";
import { Badge, ButtonLink, EmptyState, Stat } from "@/components/ui";
import { SelectionsBoard } from "./_components/selections-board";
import { HelpLink } from "@/components/help/help-link";
import { ConfirmForm } from "@/components/ui";
import { deleteSelection } from "./actions";

/**
 * The job's selections, from its estimate: every category marked Selection or with
 * an allowance. Choices, the client's pick and over / under live here; names, spec
 * text and allowances follow the estimate.
 */
export default async function SelectionsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string }> }) {
  const user = await requireView("selections");
  const { id } = await params;
  const { s: openFirst } = await searchParams;
  const project = await getProject(id);
  const [{ estimate, cards: all, others, profitDefault }, tasks] = await Promise.all([boardForViewer(project.id, user.id, false), scheduleOptions(project.id)]);
  // Their position doesn't see costs and profit: none of it is sent to the page.
  const showCosts = user.access.costs;
  const cards = showCosts ? all : all.map((c) => ({ ...c, budget: null, choices: c.choices.map((x) => ({ ...x, cost: null })) }));
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
          showCosts={showCosts}
          initialId={openFirst}
        />
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-900">
              Other selections <HelpLink slug="selections" section="Other selections" />
            </h3>
            <p className="text-xs text-slate-600">
              Things the client picks that aren&apos;t on your estimate, like house numbers or a mailbox. Add one with <strong>New selection</strong>. (A selection taken off the
              estimate after choices were made lands here too, so its choices aren&apos;t lost.)
            </p>
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
                  {s.options.length === 0 && s.status === "PENDING" ? (
                    <ConfirmForm
                      action={deleteSelection}
                      hidden={{ projectId: project.id, id: s.id }}
                      message={`Remove "${s.title}"? It has no choices on it.`}
                      variant="ghost"
                    >
                      Remove
                    </ConfirmForm>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

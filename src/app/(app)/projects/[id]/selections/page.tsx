import Link from "@/components/link";
import { Palette, Plus } from "lucide-react";
import { requireView } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { boardForViewer, scheduleOptions } from "@/lib/selections";
import { deadlineState } from "@/lib/deadlines";
import { cn, money } from "@/lib/utils";
import { Badge, ButtonLink, EmptyState } from "@/components/ui";
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
    <div className="space-y-3">
      {/* Where the job's selections stand: the counts, and the money big on the right. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <p className="flex flex-wrap items-center gap-x-1 text-xs text-slate-500">
          <span>
            {cards.length} selection{cards.length === 1 ? "" : "s"} from estimate v{estimate.version} ({estimate.status.toLowerCase()}) ·
          </span>
          <span className="font-medium text-slate-800">{cards.length - made.length} still to choose</span>
          {overdue ? <span className="font-medium text-rose-700">· {overdue} overdue</span> : null}
        </p>
        <div className="flex items-end gap-6">
          <div>
            <span className="block text-xs text-slate-500">Allowances</span>
            <span className="text-xl font-semibold tabular-nums text-slate-900">{money(allowances)}</span>
          </div>
          <div title="Choices made vs. their allowances">
            <span className="block text-xs text-slate-500">Over / under</span>
            <span className={cn("text-xl font-semibold tabular-nums", diff > 0.004 ? "text-rose-700" : diff < -0.004 ? "text-emerald-700" : "text-slate-900")}>
              {`${diff > 0.004 ? "+" : ""}${money(diff)}`}
            </span>
          </div>
        </div>
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

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
          <h3 className="flex items-center gap-1 text-sm font-semibold text-slate-900">
            Other selections <HelpLink slug="selections" section="Other selections" />
          </h3>
          <Link
            href={`/projects/${project.id}/selections/new`}
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800"
          >
            <Plus className="h-3.5 w-3.5" /> New selection
          </Link>
        </header>
        <p className="px-4 py-2 text-xs text-slate-500">
          Things the client picks that aren&apos;t on your estimate, like house numbers or a mailbox. (A selection taken off the estimate after choices were made lands here
          too, so its choices aren&apos;t lost.)
        </p>
        {others.length ? (
          <ul className="border-t border-slate-100 text-sm">
            {others.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-4 py-2 first:border-t-0">
                <Link href={`/projects/${project.id}/selections/${s.id}`} className="font-medium text-blue-700 hover:underline">
                  {s.title}
                </Link>
                <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                  {s.allowance ? `Allowance ${money(s.allowance)}` : null}
                  <Badge status={s.status} />
                  {s.options.length === 0 && s.status === "PENDING" ? (
                    <ConfirmForm
                      action={deleteSelection}
                      hidden={{ projectId: project.id, id: s.id }}
                      message={`Remove "${s.title}"? It has no choices on it.`}
                      variant="ghost"
                      size="xs"
                    >
                      <span className="text-rose-600">Remove…</span>
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

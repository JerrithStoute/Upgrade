import { Trash2 } from "lucide-react";
import { db } from "@/lib/db";
import { COMMON_SOURCES } from "@/lib/leads-math";
import { Card, CardBody, CardHeader, SubmitButton } from "@/components/ui";
import { addLeadSource, deleteLeadSource, renameLeadSource } from "../../leads/actions";
import { requireView } from "@/lib/auth";

export const metadata = { title: "Lead sources" };

/** How leads find you: your own list, with the common ones always offered too. */
export default async function LeadSourcesPage() {
  await requireView("lists");
  const [sources, counts] = await Promise.all([
    db.leadSource.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.lead.groupBy({ by: ["source"], _count: { _all: true } }),
  ]);
  const used = new Map(counts.map((c) => [c.source ?? "", c._count._all]));
  const have = new Set(sources.map((s) => s.name.trim().toLowerCase()));
  const suggestions = COMMON_SOURCES.filter((c) => !have.has(c.toLowerCase()));

  return (
    <Card>
      <CardHeader
        title="Lead sources"
        description="How leads find you — picked on each lead, and used for win rate by source in Reports. The common ones below are always offered on a lead, whether you add them here or not."
      />
      <CardBody className="space-y-3">
        {sources.length ? (
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
            {sources.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-3 py-1.5">
                <form action={renameLeadSource} className="flex flex-1 items-center gap-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input name="name" defaultValue={s.name} className="input !h-8 !py-0 text-sm" aria-label="Source" />
                  <SubmitButton size="sm" variant="ghost">
                    Rename
                  </SubmitButton>
                </form>
                <span className="w-16 text-right text-xs text-slate-500">{used.get(s.name) ?? 0} leads</span>
                <form action={deleteLeadSource}>
                  <input type="hidden" name="id" value={s.id} />
                  <button type="submit" className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700" aria-label={`Remove ${s.name}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">None of your own yet — the common ones are offered on every lead. Add any others you get leads from.</p>
        )}
        {suggestions.length ? (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            Always offered:
            {suggestions.map((c) => (
              <form key={c} action={addLeadSource}>
                <input type="hidden" name="name" value={c} />
                <button
                  type="submit"
                  className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  title="Add it to your list (to rename or order it)"
                >
                  + {c}
                </button>
              </form>
            ))}
          </div>
        ) : null}
        <form action={addLeadSource} className="flex items-center gap-2">
          <input name="name" required placeholder="Add a source, e.g. Parade of Homes" className="input !h-9 max-w-xs" aria-label="New source" />
          <SubmitButton size="sm" variant="secondary">
            Add
          </SubmitButton>
        </form>
      </CardBody>
    </Card>
  );
}

import { CheckCircle2 } from "lucide-react";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { money } from "@/lib/utils";
import { duplicatePairs } from "@/lib/unit-parts";
import { loadUnitParts } from "@/lib/unit-parts-server";
import { GROUP_LABELS, REASON_LABELS, groupOfItem, markDifferences, namePairs, type DuplicateGroup, type DuplicateReason } from "@/lib/item-duplicates";
import { Card, CardBody, ConfirmForm, EmptyState, SubmitButton } from "@/components/ui";
import { FilterChip } from "@/components/ui/filter-chip";
import { markNotSame, mergeDuplicateItems } from "../actions";

export const metadata = { title: "Possible duplicates" };

const TAGS: Record<DuplicateReason | "unit", { label: string; className: string }> = {
  letters: { label: REASON_LABELS.letters, className: "bg-amber-50 text-amber-800" },
  size: { label: REASON_LABELS.size, className: "bg-emerald-50 text-emerald-800" },
  order: { label: REASON_LABELS.order, className: "bg-violet-50 text-violet-800" },
  unit: { label: "Same size, nothing different", className: "bg-sky-50 text-sky-800" },
};

/**
 * Items that could be one thing under two names: misspellings, the same words in another order, a size
 * written two ways (item-duplicates.ts) — and doors and windows of the same size that say nothing
 * different (unit-parts.ts). Nothing here is decided for you: keep one (the other's uses move to it), or
 * say they're not the same and the pair goes away.
 */
export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<{ merged?: string; show?: string }> }) {
  const user = await requireView("lists");
  const { merged, show } = await searchParams;
  const canEdit = user.role === "ADMIN" || allows(user.access, "lists", 2);
  const [items, doorParts, windowParts] = await Promise.all([
    db.materialItem.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        kind: true,
        category: true,
        unit: true,
        unitCost: true,
        trimUses: true,
        widthIn: true,
        heightIn: true,
        exterior: true,
        style: true,
        color: true,
        details: true,
        _count: { select: { measurements: true, estimateItems: true, assemblyItems: true } },
      },
    }),
    loadUnitParts("door"),
    loadUnitParts("window"),
  ]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const notSame = [...doorParts.notSame, ...windowParts.notSame];
  const units = items.filter((i) => i.kind === "doors" || i.kind === "windows");
  const all = [
    ...namePairs(items, notSame),
    ...duplicatePairs(units, (k) => (k === "door" ? doorParts.parts : windowParts.parts), notSame).map((p) => ({ ...p, reason: "unit" as const })),
  ].map((p) => ({ ...p, group: groupOfItem(byId.get(p.a)!) }));
  const groups = (Object.keys(GROUP_LABELS) as DuplicateGroup[]).filter((g) => all.some((p) => p.group === g));
  const picked = groups.find((g) => g === show) ?? null;
  const pairs = picked ? all.filter((p) => p.group === picked) : all;

  const side = (keep: (typeof items)[number], drop: (typeof items)[number], reason: DuplicateReason | "unit") => {
    const name = reason === "letters" ? markDifferences(keep.name, drop.name)[0] : [{ text: keep.name, off: false }];
    const uses = keep._count.measurements + keep._count.assemblyItems;
    return (
      <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-slate-200 p-3">
        <p className="font-medium text-slate-900">
          {name.map((n, i) =>
            n.off ? (
              <span key={i} className="rounded-sm bg-rose-100 text-rose-800 underline">
                {n.text}
              </span>
            ) : (
              <span key={i}>{n.text}</span>
            ),
          )}
        </p>
        <p className="text-xs text-slate-500">
          {keep.unitCost > 0 ? `${money(keep.unitCost)} / ${keep.unit}` : <span className="text-amber-700">No price</span>} · {keep.category}
          {uses ? ` · in takeoffs ${uses} time${uses === 1 ? "" : "s"}` : ""}
          {keep._count.estimateItems ? ` · on ${keep._count.estimateItems} estimate line${keep._count.estimateItems === 1 ? "" : "s"}` : ""}
        </p>
        {canEdit ? (
          <ConfirmForm
            action={mergeDuplicateItems}
            hidden={{ keepId: keep.id, dropId: drop.id }}
            variant="secondary"
            className="mt-auto"
            message={`Keep "${keep.name}" (its name and price)? "${drop.name}" comes off the Item List, and everything that used it — takeoffs, estimates and bids — uses "${keep.name}".`}
          >
            Keep this one
          </ConfirmForm>
        ) : null}
      </div>
    );
  };

  return (
    <div className="max-w-4xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-900">Possible duplicates</h1>
      <p className="text-sm text-slate-600">
        Items that could be one thing under two names. Keep one — the other comes off the Item List and everything that used it uses the one you keep — or mark them{" "}
        <strong>Not the same</strong> and they won&apos;t show here again. Names with different numbers (2x4x16 and 2x4x14) are never paired.
      </p>
      {merged ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Merged into &ldquo;{merged}&rdquo;.
        </p>
      ) : null}
      {groups.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip href="/catalog/items/duplicates" active={!picked} label="All" count={all.length} />
          {groups.map((g) => (
            <FilterChip key={g} href={`/catalog/items/duplicates?show=${g}`} active={picked === g} label={GROUP_LABELS[g]} count={all.filter((p) => p.group === g).length} />
          ))}
        </div>
      ) : null}
      {pairs.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No possible duplicates" description="Everything on your Item List looks like its own thing." />
      ) : (
        pairs.map((p) => {
          const a = byId.get(p.a)!;
          const b = byId.get(p.b)!;
          const tag = TAGS[p.reason];
          return (
            <Card key={p.key}>
              <CardBody className="space-y-3">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${tag.className}`}>{tag.label}</span>
                <div className="flex flex-col gap-3 sm:flex-row">
                  {side(a, b, p.reason)}
                  {side(b, a, p.reason)}
                </div>
                {canEdit ? (
                  <form action={markNotSame} className="flex justify-end">
                    <input type="hidden" name="a" value={a.id} />
                    <input type="hidden" name="b" value={b.id} />
                    <SubmitButton variant="ghost" size="sm" pendingText="Saving…">
                      Not the same
                    </SubmitButton>
                  </form>
                ) : null}
              </CardBody>
            </Card>
          );
        })
      )}
    </div>
  );
}

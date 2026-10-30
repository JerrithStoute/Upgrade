import Link from "@/components/link";
import { CheckCircle2 } from "lucide-react";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { money } from "@/lib/utils";
import { duplicatePairs } from "@/lib/unit-parts";
import { loadUnitParts } from "@/lib/unit-parts-server";
import { Card, CardBody, ConfirmForm, EmptyState, SubmitButton } from "@/components/ui";
import { markNotSame, mergeDuplicateItems } from "../actions";

export const metadata = { title: "Possible duplicates" };

/**
 * Doors and windows that could be one item under two names — mostly ones from before doors and windows were
 * picked from parts ("2868 Hollow Core" beside "2868 Int Prehung Hollow 2x4 Jamb"). Nothing here is decided
 * for you: keep one (the other's uses move to it), or say they're not the same and the pair goes away.
 */
export default async function DuplicatesPage({ searchParams }: { searchParams: Promise<{ merged?: string }> }) {
  const user = await requireView("lists");
  const { merged } = await searchParams;
  const canEdit = user.role === "ADMIN" || allows(user.access, "lists", 2);
  const [items, doorParts, windowParts] = await Promise.all([
    db.materialItem.findMany({
      where: { kind: { in: ["doors", "windows"] } },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        kind: true,
        category: true,
        unitCost: true,
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
  const pairs = duplicatePairs(items, (k) => (k === "door" ? doorParts.parts : windowParts.parts), [...doorParts.notSame, ...windowParts.notSame]);

  const side = (keep: (typeof items)[number], drop: (typeof items)[number]) => (
    <div className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-slate-200 p-3">
      <p className="font-medium text-slate-900">{keep.name}</p>
      <p className="text-xs text-slate-500">
        {keep.unitCost > 0 ? money(keep.unitCost) : <span className="text-amber-700">No price</span>} · {keep.category} · placed{" "}
        {keep._count.measurements} time{keep._count.measurements === 1 ? "" : "s"}
        {keep._count.estimateItems ? ` · on ${keep._count.estimateItems} estimate line${keep._count.estimateItems === 1 ? "" : "s"}` : ""}
      </p>
      {canEdit ? (
        <ConfirmForm
          action={mergeDuplicateItems}
          hidden={{ keepId: keep.id, dropId: drop.id }}
          variant="secondary"
          className="mt-auto"
          message={`Keep "${keep.name}" (its name and price)? "${drop.name}" comes off the Item List, and everything that used it — on plans, estimates and bids — uses "${keep.name}".`}
        >
          Keep this one
        </ConfirmForm>
      ) : null}
    </div>
  );

  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-sm">
        <Link href="/catalog/items" className="text-blue-700 hover:underline">
          ← Item List
        </Link>
      </p>
      <p className="text-sm text-slate-600">
        Doors and windows that could be the same thing under two names: the same size, and nothing either one says that the other says differently. Keep one — the other comes
        off the Item List and everything that used it uses the one you keep — or mark them <strong>Not the same</strong> and they won&apos;t show here again.
      </p>
      {merged ? (
        <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4" /> Merged into &ldquo;{merged}&rdquo;.
        </p>
      ) : null}
      {pairs.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="No possible duplicates" description="Every door and window on your Item List looks like its own thing." />
      ) : (
        pairs.map((p) => {
          const a = byId.get(p.a)!;
          const b = byId.get(p.b)!;
          return (
            <Card key={p.key}>
              <CardBody className="space-y-3">
                <div className="flex flex-col gap-3 sm:flex-row">
                  {side(a, b)}
                  {side(b, a)}
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

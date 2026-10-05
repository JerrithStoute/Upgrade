import Link from "next/link";
import { ArrowLeft, Lock, LockOpen } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { conditionTotals, loadConditions } from "@/lib/takeoff-data";
import { syncAutoItems } from "@/lib/walls";
import { assemblyQuantity } from "@/lib/takeoff";
import { fmtDate, money } from "@/lib/utils";
import { Card, CardBody, CardHeader, ConfirmForm, SubmitButton, buttonClasses } from "@/components/ui";
import { lockPrices, unlockPrices, updateSelectedPrices } from "../actions";
import { PriceReviewForm, type ReviewGroup } from "./price-review-form";

/**
 * Price review: this job's prices vs. today's Item List. On a locked job, bring new
 * prices in item by item or group by group (the job stays locked), or unlock to take
 * them all. On an unlocked job, it lists the items kept at "this job only".
 */
export default async function PriceReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ updated?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { updated } = await searchParams;
  const project = await getProject(id);
  await syncAutoItems(project.id);
  const conditions = await loadConditions(project.id);
  const locked = !!project.pricesLockedAt;

  // One row per Item List item and job price on this job (its takeoff lines at that price together).
  type Row = Omit<ReviewGroup["items"][number], "uses"> & { category: string; uses: Set<string> };
  const byItem = new Map<string, Row>();
  for (const c of conditions) {
    if (c.referenceOnly) continue;
    const totals = conditionTotals(c);
    for (const i of c.items) {
      const m = i.materialItem;
      if (!m) continue;
      const qty = assemblyQuantity(i, totals.metrics, totals.cutList, totals.wall);
      const rowKey = `${m.id}|${i.unitCost}|${i.pricePinned ? 1 : 0}`;
      const r = byItem.get(rowKey);
      if (r) {
        r.qty += qty;
        r.pinned ||= i.pricePinned;
        r.uses.add(c.name);
      } else
        byItem.set(rowKey, {
          key: rowKey,
          id: m.id,
          name: m.name,
          category: m.category || "General",
          unit: i.unit,
          qty,
          jobPrice: i.unitCost,
          listPrice: m.unitCost,
          pinned: i.pricePinned,
          uses: new Set([c.name]),
        });
    }
  }
  // Items whose Item List price differs (a $0 Item List price isn't a price yet). Unlocked jobs: only pinned ones can differ.
  const rows = Array.from(byItem.values()).filter((r) => r.listPrice > 0 && Math.abs(r.listPrice - r.jobPrice) > 0.0001 && (locked || r.pinned));
  const groups: ReviewGroup[] = Array.from(new Set(rows.map((r) => r.category)))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      name,
      items: rows
        .filter((r) => r.category === name)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((r) => ({ ...r, uses: Array.from(r.uses) })),
    }));
  const total = rows.filter((r) => !r.pinned).reduce((n, r) => n + r.qty * (r.listPrice - r.jobPrice), 0);
  const back = `/projects/${project.id}/takeoff/rebid`;

  return (
    <div className="space-y-5">
      <Link href={`/projects/${project.id}/estimate`} className={buttonClasses("ghost", "sm")}>
        <ArrowLeft className="h-3.5 w-3.5" /> Estimate
      </Link>
      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              {locked ? <Lock className="h-4 w-4 text-amber-600" /> : <LockOpen className="h-4 w-4 text-emerald-600" />}
              Price review
            </span>
          }
          description={
            locked
              ? `This job's prices are locked (since ${fmtDate(project.pricesLockedAt)}) — Item List changes don't reach it. Bring new prices in item by item or group by group, or unlock to take them all.`
              : "This job follows the Item List — its prices change when the Item List does, except items kept at “this job only”."
          }
          actions={
            locked ? (
              <ConfirmForm
                action={unlockPrices}
                hidden={{ projectId: project.id, back }}
                variant="secondary"
                message={`Unlock this job's prices? It takes today's Item List price for every item${rows.length ? ` (${rows.filter((r) => !r.pinned).length} changed, ${total >= 0 ? "+" : "−"}${money(Math.abs(total))} in cost)` : ""} and follows the Item List from now on. Sent estimates stay as they were.`}
              >
                <LockOpen className="h-3.5 w-3.5" /> Unlock prices
              </ConfirmForm>
            ) : (
              <form action={lockPrices}>
                <input type="hidden" name="projectId" value={project.id} />
                <input type="hidden" name="back" value={back} />
                <SubmitButton size="sm" variant="secondary">
                  <Lock className="h-3.5 w-3.5" /> Lock prices
                </SubmitButton>
              </form>
            )
          }
        />
        <CardBody className="space-y-4">
          {updated ? (
            <p className="rounded-lg bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
              Updated {updated} item{updated === "1" ? "" : "s"} to today&apos;s Item List price.
            </p>
          ) : null}
          {groups.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {locked ? "Every item on this job already matches the Item List." : "No items are kept at “this job only” with a different price — everything matches the Item List."}
            </p>
          ) : (
            <PriceReviewForm projectId={project.id} groups={groups} action={updateSelectedPrices} locked={locked} />
          )}
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>Draft estimates that have the takeoff update themselves when you open them (unless you lock the estimate). Sent and approved estimates never change.</li>
            <li>Marking an estimate sent locks the job&apos;s prices. Takeoffs priced on their own (no Item List item) always keep their price.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}

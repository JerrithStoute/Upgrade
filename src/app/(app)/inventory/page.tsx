import Link from "next/link";
import { Boxes } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { MOVE_LABEL, inventoryItems } from "@/lib/inventory";
import { cn, fmtDate, money, num } from "@/lib/utils";
import { Button, Card, CardBody, CardHeader, ConfirmForm, EmptyState, PageHeader, Stat, SubmitButton } from "@/components/ui";
import { addInventory, recountInventory, removeInventoryItem } from "./actions";

export const metadata = { title: "Inventory" };

/** The company's stored materials: what's on hand, what it's worth, and where it went. */
export default async function InventoryPage() {
  await requireStaff();
  const [items, itemList, moves] = await Promise.all([
    inventoryItems(),
    db.materialItem.findMany({ select: { name: true, unit: true }, orderBy: { name: "asc" } }),
    db.inventoryMove.findMany({ orderBy: { createdAt: "desc" }, take: 400, include: { project: { select: { id: true, name: true } }, user: { select: { name: true } } } }),
  ]);
  const value = items.reduce((n, i) => n + Math.max(0, i.onHand) * i.avgCost, 0);
  const inStock = items.filter((i) => i.onHand > 1e-9);
  const historyOf = (id: string) => moves.filter((m) => m.itemId === id).slice(0, 15);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Your stored materials. Pull them to a job from its Material list; return a job's leftovers from the same place. Each item is worth the average of what was paid."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Worth" value={money(value, true)} hint="On hand × average cost" />
        <Stat label="Items in stock" value={inStock.length} />
        <Stat label="Moves" value={moves.length} hint="Added, pulled, returned, counted" />
      </div>

      <Card>
        <CardHeader title="Add to inventory" description="Stock you bought for the shelf, or what's already there. Pick an Item List item so jobs that use it find it." />
        <CardBody>
          <form action={addInventory} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
            <input name="item" required list="inventory-item-list" className="input lg:col-span-2" placeholder="Item (from your Item List, or type one)" aria-label="Item" />
            <datalist id="inventory-item-list">
              {itemList.map((i) => (
                <option key={i.name} value={i.name}>
                  {i.unit}
                </option>
              ))}
            </datalist>
            <input name="quantity" type="number" min={0} step="any" required className="input" placeholder="How many" aria-label="How many" />
            <input name="unit" className="input" placeholder="Unit (if new)" aria-label="Unit" />
            <input name="unitCost" type="number" min={0} step="0.01" className="input" placeholder="Cost each (optional)" aria-label="Cost each" />
            <SubmitButton pendingText="Adding…">Add</SubmitButton>
            <input name="note" className="input sm:col-span-2 lg:col-span-6" placeholder="Note (optional) — e.g. left from the Smith job, bought on sale" aria-label="Note" />
          </form>
          <p className="mt-2 text-xs text-slate-500">Leave cost each blank to use the Item List price.</p>
        </CardBody>
      </Card>

      {items.length === 0 ? (
        <EmptyState icon={Boxes} title="Nothing in inventory yet" description="Add what's on your shelves above, or return a job's leftovers from its Material list." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-3 py-2.5 text-right font-medium">On hand</th>
                <th className="px-3 py-2.5 text-right font-medium">Worth each</th>
                <th className="px-3 py-2.5 text-right font-medium">Worth</th>
                <th className="px-4 py-2.5 font-medium">Recount / remove</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {items.map((i) => (
                <tr key={i.id} id={`inv-${i.id}`} className={cn("scroll-mt-24 align-top", i.onHand <= 1e-9 && "text-slate-400")}>
                  <td className="px-4 py-2.5">
                    <span className="font-medium text-slate-900">{i.label}</span>
                    {!i.materialItemId ? <span className="ml-1.5 text-xs text-slate-500">(not on the Item List)</span> : null}
                    <details className="mt-1 text-xs">
                      <summary className="cursor-pointer text-blue-700">History</summary>
                      <ul className="mt-1 space-y-0.5 text-slate-600">
                        {historyOf(i.id).map((m) => (
                          <li key={m.id} className={cn(m.undone && "line-through opacity-60")}>
                            {fmtDate(m.createdAt, "MMM d, yyyy")} · {MOVE_LABEL[m.type]} {m.quantity > 0 ? "+" : ""}
                            {num(m.quantity)}
                            {m.project ? (
                              <>
                                {" · "}
                                <Link href={`/projects/${m.project.id}/materials/inventory`} className="hover:underline">
                                  {m.project.name}
                                </Link>
                              </>
                            ) : null}
                            {m.user ? ` · ${m.user.name}` : ""}
                            {m.note ? ` · ${m.note}` : ""}
                          </li>
                        ))}
                      </ul>
                    </details>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {num(i.onHand)} {i.unit}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(i.avgCost)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(Math.max(0, i.onHand) * i.avgCost)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1">
                      <form action={recountInventory} className="flex items-center gap-1">
                        <input type="hidden" name="id" value={i.id} />
                        <input
                          name="count"
                          type="number"
                          min={0}
                          step="any"
                          required
                          className="input !h-8 w-20 text-right"
                          placeholder={num(i.onHand)}
                          aria-label={`Count of ${i.label}`}
                        />
                        <Button type="submit" size="sm" variant="secondary">
                          Set
                        </Button>
                      </form>
                      <ConfirmForm
                        action={removeInventoryItem}
                        hidden={{ id: i.id }}
                        message={`Remove ${i.label} from inventory${i.onHand > 1e-9 ? ` (${num(i.onHand)} ${i.unit} on hand)` : ""}? Its history goes too. Jobs it was pulled to keep their cost.`}
                        variant="ghost"
                      >
                        <span className="text-xs text-rose-600">Remove</span>
                      </ConfirmForm>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

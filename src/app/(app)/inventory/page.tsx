import Link from "@/components/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { MOVE_LABEL, inventoryItems } from "@/lib/inventory";
import { cn, fmtDate, money, num } from "@/lib/utils";
import { Button, ConfirmForm, SubmitButton } from "@/components/ui";
import { Tile } from "@/components/ui/tile";
import { ListFind } from "@/components/list-find";
import { addInventory, recountInventory, removeInventoryItem } from "./actions";

export const metadata = { title: "Inventory" };

const small = "!h-7 !px-2.5 !text-xs";
const box = "input !h-7 !py-0 text-xs";
const editLink = "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700 hover:underline";
const plainBtn = "inline-flex h-7 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50";

/** The company's stored materials: what's on hand, what it's worth, and where it went. Add, history and count open in place (?add=1, ?item=, ?count=). */
export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ add?: string; item?: string; count?: string }> }) {
  await requireView("purchasing");
  const { add, item: openItem, count: countItem } = await searchParams;
  const [items, itemList, moves] = await Promise.all([
    inventoryItems(),
    db.materialItem.findMany({ select: { name: true, unit: true }, orderBy: { name: "asc" } }),
    db.inventoryMove.findMany({ orderBy: { createdAt: "desc" }, take: 400, include: { project: { select: { id: true, number: true, name: true } }, user: { select: { name: true } } } }),
  ]);
  const value = items.reduce((n, i) => n + Math.max(0, i.onHand) * i.avgCost, 0);
  const inStock = items.filter((i) => i.onHand > 1e-9);
  const historyOf = (id: string) => moves.filter((m) => m.itemId === id).slice(0, 15);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-slate-900">Inventory</h1>
        <p className="text-xs text-slate-500">Your stored materials. Pull them to a job, or return leftovers, from the job&apos;s Material list.</p>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Tile label="Worth" value={money(value, true)} hint="On hand × average cost" />
        <Tile label="Items in stock" value={inStock.length} />
        <Tile label="Moves" value={moves.length} hint="Added, pulled, returned, counted" />
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
          <ListFind listId="inventory-list" placeholder="Find an item…" />
          {add ? null : (
            <Link href="/inventory?add=1" scroll={false} className={plainBtn}>
              + Add to inventory
            </Link>
          )}
        </header>

        {add ? (
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">Add to inventory</span>
              <Link href="/inventory" scroll={false} className={editLink}>
                Cancel
              </Link>
            </div>
            <form action={addInventory} className="flex flex-wrap items-center gap-1.5">
              <input name="item" required autoFocus list="inventory-item-list" className={cn(box, "min-w-[12rem] flex-[2]")} placeholder="Item (Item List, or type one)" aria-label="Item" />
              <datalist id="inventory-item-list">
                {itemList.map((i) => (
                  <option key={i.name} value={i.name}>
                    {i.unit}
                  </option>
                ))}
              </datalist>
              <input name="quantity" type="number" min={0} step="any" required className={cn(box, "w-20")} placeholder="How many" aria-label="How many" />
              <input name="unit" className={cn(box, "w-24")} placeholder="Unit (if new)" aria-label="Unit" />
              <input name="unitCost" type="number" min={0} step="0.01" className={cn(box, "w-36")} placeholder="Cost each (blank = list)" aria-label="Cost each" />
              <input name="note" className={cn(box, "min-w-[8rem] flex-1")} placeholder="Note (optional)" aria-label="Note" />
              <SubmitButton pendingText="Adding…" className={small}>
                Add
              </SubmitButton>
            </form>
          </div>
        ) : null}

        {items.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-slate-500">Nothing in inventory yet. Add what&apos;s on your shelves, or return a job&apos;s leftovers from its Material list.</p>
        ) : (
          <div id="inventory-list" className="@container">
            <div className="overflow-x-auto" data-find-group>
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-normal">Item</th>
                    <th className="px-3 py-2 text-right font-normal">On hand</th>
                    <th className="px-3 py-2 text-right font-normal">Worth each</th>
                    <th className="px-3 py-2 text-right font-normal">Worth</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                {items.map((i) => {
                  const showing = openItem === i.id;
                  const counting = countItem === i.id;
                  const empty = i.onHand <= 1e-9;
                  const history = showing ? historyOf(i.id) : [];
                  return (
                    // One tbody per item, so the find box hides an item and its open lines together.
                    <tbody key={i.id} id={`inv-${i.id}`} data-find={i.label.toLowerCase()} className="scroll-mt-24 border-b border-slate-100 last:border-b-0">
                      <tr className={cn("align-top", empty && "text-slate-400", (showing || counting) && "bg-slate-50")}>
                        <td className="px-4 py-2">
                          <Link
                            href={showing ? "/inventory" : `/inventory?item=${i.id}`}
                            scroll={false}
                            className={cn("inline-flex items-start gap-1 hover:underline", empty ? "text-slate-500" : "font-medium text-slate-900")}
                          >
                            {showing ? <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" /> : <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />}
                            {i.label}
                          </Link>
                          {!i.materialItemId ? <span className="ml-1.5 text-xs text-slate-400">not on the Item List</span> : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                          {num(i.onHand)} {i.unit}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(i.avgCost)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(Math.max(0, i.onHand) * i.avgCost)}</td>
                        <td className="px-4 py-2 text-right">
                          {counting ? null : (
                            <Link href={`/inventory?count=${i.id}`} scroll={false} className={editLink}>
                              Count
                            </Link>
                          )}
                        </td>
                      </tr>
                      {showing ? (
                        <tr className="bg-slate-50">
                          <td colSpan={5} className="p-0">
                            <div className="sticky left-0 w-[100cqw] max-w-full px-4 pb-2">
                              {history.length ? (
                                <table className="text-xs">
                                  <tbody>
                                    {history.map((m) => (
                                      <tr key={m.id} className={cn("align-top", m.undone && "line-through opacity-60")}>
                                        <td className="whitespace-nowrap py-0.5 pl-5 pr-3 text-slate-400">{fmtDate(m.createdAt, "MMM d, yyyy")}</td>
                                        <td className="whitespace-nowrap py-0.5 pr-3 tabular-nums text-slate-700">
                                          {MOVE_LABEL[m.type] ?? m.type} {m.quantity > 0 ? "+" : m.quantity < 0 ? "−" : ""}
                                          {num(Math.abs(m.quantity))}
                                        </td>
                                        <td className="py-0.5 pr-3">
                                          {m.project ? (
                                            <Link href={`/projects/${m.project.id}/materials/inventory`} className="text-blue-700 hover:underline">
                                              #{m.project.number} {m.project.name}
                                            </Link>
                                          ) : null}
                                        </td>
                                        <td className="whitespace-nowrap py-0.5 pr-3 text-slate-500">{m.user?.name ?? ""}</td>
                                        <td className="py-0.5 text-slate-500">{m.note ?? ""}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="pl-5 text-xs text-slate-500">No moves yet.</p>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                      {counting ? (
                        <tr className="bg-slate-50">
                          <td colSpan={5} className="p-0">
                            <div className="sticky left-0 flex w-[100cqw] max-w-full flex-wrap items-center gap-1.5 px-4 pb-2.5">
                              <form action={recountInventory} className="flex flex-wrap items-center gap-1.5">
                                <input type="hidden" name="id" value={i.id} />
                                <span className="text-xs text-slate-500">On the shelf now:</span>
                                <input
                                  name="count"
                                  type="number"
                                  min={0}
                                  step="any"
                                  required
                                  autoFocus
                                  className={cn(box, "w-20 text-right")}
                                  placeholder={num(i.onHand)}
                                  aria-label={`Count of ${i.label}`}
                                />
                                <span className="text-xs text-slate-500">{i.unit}</span>
                                <Button type="submit" size="sm" className={small}>
                                  Set count
                                </Button>
                                <Link href="/inventory" scroll={false} className={plainBtn}>
                                  Cancel
                                </Link>
                              </form>
                              <ConfirmForm
                                action={removeInventoryItem}
                                hidden={{ id: i.id }}
                                message={`Remove ${i.label} from inventory${i.onHand > 1e-9 ? ` (${num(i.onHand)} ${i.unit} on hand)` : ""}? Its history goes too. Jobs it was pulled to keep their cost.`}
                                variant="ghost"
                                className="ml-auto"
                              >
                                <span className="text-xs text-rose-600">Remove from inventory…</span>
                              </ConfirmForm>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  );
                })}
                <tfoot>
                  <tr className="border-t border-slate-200 text-sm font-medium text-slate-900">
                    <td className="px-4 py-2" colSpan={3}>
                      {items.length} item{items.length === 1 ? "" : "s"}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(value)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
              <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
                None match.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

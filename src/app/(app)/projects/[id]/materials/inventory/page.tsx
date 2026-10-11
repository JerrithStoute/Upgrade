import Link from "@/components/link";
import { AlertTriangle, PackageOpen, Undo2 } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { buildMaterialList } from "@/lib/takeoff-materials";
import { inventoryItems, jobPulls } from "@/lib/inventory";
import { suggestedPull, toOrder } from "@/lib/inventory-math";
import { cn, fmtDate, money, num } from "@/lib/utils";
import { Card, CardBody, CardHeader, SubmitButton } from "@/components/ui";
import { pullFromInventory, returnLeftovers, undoInventoryMove } from "./actions";

/**
 * Pull from the company's inventory: what's on the shelf, the items this job needs first (filled in
 * with what it still needs, as much as there is), everything else below. What's pulled is
 * charged to the job at what it's worth, and the Material list orders that much less.
 * Leftovers go back the same way.
 */
export default async function PullFromInventoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pulled?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { pulled: justPulled } = await searchParams;
  const project = await getProject(id);
  const [{ lines }, pulled, items, moves, bids] = await Promise.all([
    buildMaterialList(project.id),
    jobPulls(project.id),
    inventoryItems(),
    db.inventoryMove.findMany({
      where: { projectId: project.id, type: { in: ["PULL", "RETURN"] } },
      include: { item: { include: { materialItem: { select: { name: true } } } }, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.bid.findMany({ where: { projectId: project.id }, select: { number: true, vendorName: true, lines: { select: { key: true } } } }),
  ]);
  const lineByKey = new Map(lines.map((l) => [l.key, l]));
  const needed = items.filter((i) => lineByKey.has(i.lineKey));
  const others = items.filter((i) => !lineByKey.has(i.lineKey) && i.onHand > 1e-9);
  const bidsFor = (key: string) => bids.filter((b) => b.lines.some((l) => l.key === key));
  const pulls = moves.filter((m) => m.type === "PULL");
  const returns = moves.filter((m) => m.type === "RETURN");
  const base = `/projects/${project.id}`;
  const label = (m: (typeof moves)[number]) => m.item.materialItem?.name ?? m.item.name;
  const nameOptions = [...new Set([...lines.map((l) => l.name), ...items.map((i) => i.label)])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return (
    <div className="space-y-5">
      <div>
        <Link href={`${base}/materials`} className="text-xs text-slate-500 hover:text-slate-800">
          ← Material list
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Pull from your inventory</h2>
        <p className="max-w-3xl text-sm text-slate-500">
          Type how many of each to pull. What you pull is charged to this job at what it&apos;s worth in inventory (already paid for), and the Material list orders that much less —
          bids to vendors ask only for the rest.{" "}
          <Link href="/inventory" className="font-medium text-blue-700 hover:underline">
            See all inventory
          </Link>
        </p>
      </div>
      {justPulled ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Pulled {justPulled} item{justPulled === "1" ? "" : "s"}. The Material list now shows them, and orders the rest.{" "}
          <Link href={`${base}/materials`} className="font-medium underline">
            Back to the Material list
          </Link>
        </p>
      ) : null}

      {items.every((i) => i.onHand <= 1e-9) && !pulls.length ? (
        <Card>
          <CardBody className="flex flex-col items-center gap-2 py-8 text-center">
            <PackageOpen className="h-8 w-8 text-slate-400" />
            <p className="font-medium text-slate-800">Nothing in inventory yet</p>
            <p className="max-w-md text-sm text-slate-500">
              Add what&apos;s on your shelves on the{" "}
              <Link href="/inventory" className="font-medium text-blue-700 hover:underline">
                Inventory
              </Link>{" "}
              page — or return a job&apos;s leftovers below, and they&apos;ll be here for the next one.
            </p>
          </CardBody>
        </Card>
      ) : (
        <form action={pullFromInventory} className="space-y-4">
          <input type="hidden" name="projectId" value={project.id} />
          <Card>
            <CardHeader
              title="What this job needs that you have"
              description="Filled in with what the job still needs, as much as you have — change any of them, or clear it to leave it."
            />
            {needed.length === 0 ? (
              <CardBody>
                <p className="text-sm text-slate-500">Nothing on this job&apos;s Material list is in inventory.</p>
              </CardBody>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">Job needs</th>
                      <th className="px-3 py-2 text-right font-medium">Pulled so far</th>
                      <th className="px-3 py-2 text-right font-medium">On hand</th>
                      <th className="px-3 py-2 text-right font-medium">Worth each</th>
                      <th className="w-28 px-4 py-2 text-right font-medium">Pull</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {needed.map((i) => {
                      const line = lineByKey.get(i.lineKey)!;
                      const already = pulled.get(i.lineKey) ?? 0;
                      const suggest = suggestedPull(line.quantity, already, i.onHand);
                      const sent = bidsFor(i.lineKey);
                      return (
                        <tr key={i.id}>
                          <td className="px-4 py-2">
                            <span className="font-medium text-slate-900">{i.label}</span>
                            {sent.length && suggest > 0 ? (
                              <span className="mt-0.5 flex items-center gap-1 text-xs text-amber-700">
                                <AlertTriangle className="h-3 w-3 shrink-0" /> Already sent to {sent.map((b) => `${b.vendorName} (Bid #${b.number})`).join(", ")} — order that much
                                less from them.
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {num(line.quantity)} {line.unit}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">{already ? num(already) : "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{num(i.onHand)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{money(i.avgCost)}</td>
                          <td className="px-4 py-2">
                            <input type="hidden" name={`line:${i.id}`} value={i.lineKey} />
                            <input
                              name={`pull:${i.id}`}
                              type="number"
                              min={0}
                              max={i.onHand}
                              step="any"
                              defaultValue={suggest > 0 ? suggest : ""}
                              disabled={i.onHand <= 1e-9}
                              placeholder={i.onHand <= 1e-9 ? "none left" : "0"}
                              aria-label={`Pull ${i.label}`}
                              className="input !h-8 text-right"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {others.length ? (
            <Card>
              <CardHeader title="Everything else in inventory" description="Not on this job's Material list — pull any of it and it's charged to the job." />
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">On hand</th>
                      <th className="px-3 py-2 text-right font-medium">Worth each</th>
                      <th className="w-28 px-4 py-2 text-right font-medium">Pull</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {others.map((i) => (
                      <tr key={i.id}>
                        <td className="px-4 py-2 font-medium text-slate-900">{i.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {num(i.onHand)} {i.unit}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(i.avgCost)}</td>
                        <td className="px-4 py-2">
                          <input
                            name={`pull:${i.id}`}
                            type="number"
                            min={0}
                            max={i.onHand}
                            step="any"
                            placeholder="0"
                            aria-label={`Pull ${i.label}`}
                            className="input !h-8 text-right"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          ) : null}
          <div className="flex justify-end">
            <SubmitButton pendingText="Pulling…">Pull these to the job</SubmitButton>
          </div>
        </form>
      )}

      {pulls.length ? (
        <Card>
          <CardHeader title="Pulled to this job" description="Put one back and it goes back on the shelf; its cost comes off the job and the Material list orders it again." />
          <ul className="divide-y divide-slate-100">
            {pulls.map((m) => {
              const line = m.lineKey ? lineByKey.get(m.lineKey) : null;
              return (
                <li key={m.id} className={cn("flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm", m.undone && "text-slate-400")}>
                  <span className="min-w-0 flex-1">
                    <span className={cn("font-medium", m.undone ? "line-through" : "text-slate-900")}>
                      {num(-m.quantity)} {m.item.unit} {label(m)}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {fmtDate(m.createdAt)}
                      {m.user ? ` · ${m.user.name}` : ""} · {money(-m.quantity * m.unitCost)}
                      {line && !m.undone ? ` · order ${num(toOrder(line.quantity, pulled.get(line.key) ?? 0))} more` : ""}
                      {m.undone ? " · put back" : ""}
                    </span>
                  </span>
                  {m.undone ? null : (
                    <form action={undoInventoryMove}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="id" value={m.id} />
                      <SubmitButton variant="ghost" size="sm" pendingText="Putting back…">
                        <Undo2 className="h-3.5 w-3.5" /> Put back
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

      <Card>
        <div id="leftovers" className="scroll-mt-24" />
        <CardHeader
          title="Return leftovers to inventory"
          description="Material left over from this job goes back on the shelf. The job is credited what it cost — so the next job that pulls it pays for it."
        />
        <CardBody className="space-y-3">
          <form action={returnLeftovers} className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <input type="hidden" name="projectId" value={project.id} />
            <input name="item" required list="leftover-items" className="input lg:col-span-2" placeholder="Item (from the list, or type one)" aria-label="Item" />
            <datalist id="leftover-items">
              {nameOptions.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <input name="quantity" type="number" min={0} step="any" required className="input" placeholder="How many" aria-label="How many" />
            <input name="unitCost" type="number" min={0} step="0.01" className="input" placeholder="Cost each (optional)" aria-label="Cost each" />
            <SubmitButton pendingText="Returning…">Return</SubmitButton>
          </form>
          <p className="text-xs text-slate-500">Leave cost each blank to use what it cost this job (or the Item List price).</p>
          {returns.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {returns.map((m) => (
                <li key={m.id} className={cn("flex flex-wrap items-center gap-3 px-3 py-2 text-sm", m.undone && "text-slate-400")}>
                  <span className="min-w-0 flex-1">
                    <span className={cn("font-medium", m.undone ? "line-through" : "text-slate-900")}>
                      {num(m.quantity)} {m.item.unit} {label(m)}
                    </span>
                    <span className="block text-xs text-slate-500">
                      {fmtDate(m.createdAt)} · {money(m.quantity * m.unitCost)} credit{m.undone ? " · taken back" : ""}
                    </span>
                  </span>
                  {m.undone ? null : (
                    <form action={undoInventoryMove}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="anchor" value="leftovers" />
                      <SubmitButton variant="ghost" size="sm" pendingText="Undoing…">
                        <Undo2 className="h-3.5 w-3.5" /> Undo
                      </SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { conditionTotals, loadConditions } from "@/lib/takeoff-data";
import { syncAutoItems } from "@/lib/walls";
import { assemblyQuantity } from "@/lib/takeoff";
import { cn, fmtDate, money, num } from "@/lib/utils";
import { Badge, Card, CardBody, CardHeader, SubmitButton, TBody, TFoot, THead, Table, Td, Th, Tr, buttonClasses } from "@/components/ui";
import { rebidAtCurrentPrices } from "../actions";

/** Preview of a rebid: this job's prices vs. today's Item List, before anything changes. */
export default async function RebidPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  await syncAutoItems(project.id);
  const [conditions, latest] = await Promise.all([
    loadConditions(project.id),
    db.estimate.findFirst({ where: { projectId: project.id }, orderBy: { version: "desc" }, select: { name: true, version: true, status: true, createdAt: true } }),
  ]);

  const rows = conditions.flatMap((c) => {
    const totals = conditionTotals(c);
    return c.items.map((i) => {
      const qty = assemblyQuantity(i, totals.metrics, totals.cutList, totals.wall);
      const listPrice = i.materialItem?.unitCost ?? null;
      const markup = 1 + i.markupPct / 100;
      return {
        id: i.id,
        condition: c.name,
        name: i.description,
        unit: i.unit,
        qty,
        jobPrice: i.unitCost,
        listPrice,
        change: listPrice === null ? 0 : qty * (listPrice - i.unitCost) * markup,
      };
    });
  });
  const changed = rows.filter((r) => r.listPrice !== null && Math.abs(r.listPrice - r.jobPrice) > 0.0001);
  const unlinked = rows.filter((r) => r.listPrice === null).length;
  const totalChange = changed.reduce((s, r) => s + r.change, 0);
  const base = `/projects/${project.id}/takeoff`;

  return (
    <div className="space-y-5">
      <Link href={base} className={buttonClasses("ghost", "sm")}>
        <ArrowLeft className="h-3.5 w-3.5" /> Takeoff
      </Link>
      <Card>
        <CardHeader
          title="Rebid at current prices"
          description="Updates this takeoff to today's Item List prices and creates a new estimate version. The current estimate and its proposal are kept as they are."
        />
        <CardBody className="space-y-4">
          <p className="text-sm text-slate-700">
            {latest ? (
              <>
                New version: <strong>v{latest.version + 1}</strong>, copied from {latest.name} v{latest.version} <Badge status={latest.status} /> (created {fmtDate(latest.createdAt)}), with the takeoff lines re-priced and quantities refreshed.
              </>
            ) : (
              <>This project has no estimate yet — a new one will be created from the takeoff.</>
            )}
          </p>

          {changed.length === 0 ? (
            <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">All takeoff items already match the Item List. A rebid still creates a new version with refreshed quantities.</p>
          ) : (
            <Table>
              <THead>
                <tr>
                  <Th>Item</Th>
                  <Th>Used in</Th>
                  <Th right>Qty</Th>
                  <Th right>Job price</Th>
                  <Th right>Item List price</Th>
                  <Th right>Change (incl. markup)</Th>
                </tr>
              </THead>
              <TBody>
                {changed.map((r) => (
                  <Tr key={r.id}>
                    <Td className="font-medium text-slate-900">{r.name}</Td>
                    <Td className="text-xs text-slate-500">{r.condition}</Td>
                    <Td right>
                      {num(r.qty)} {r.unit}
                    </Td>
                    <Td right>{money(r.jobPrice)}</Td>
                    <Td right>{money(r.listPrice)}</Td>
                    <Td right className={cn(r.change > 0 ? "text-rose-700" : "text-emerald-700")}>
                      {r.change > 0 ? "+" : ""}
                      {money(r.change)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
              <TFoot>
                <tr>
                  <td colSpan={5} className="px-4 py-2.5">
                    Estimate change
                  </td>
                  <td className={cn("px-4 py-2.5 text-right tabular-nums", totalChange > 0 ? "text-rose-700" : "text-emerald-700")}>
                    {totalChange > 0 ? "+" : ""}
                    {money(totalChange)}
                  </td>
                </tr>
              </TFoot>
            </Table>
          )}

          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>Only assembly items picked from the Item List are re-priced{unlinked ? ` (${unlinked} item${unlinked === 1 ? " isn't" : "s aren't"} linked and keep their price)` : ""}.</li>
            <li>Conditions without assembly items and lines typed straight into the estimate keep their prices.</li>
            <li>Markups stay as they are on this job.</li>
          </ul>

          <form action={rebidAtCurrentPrices} className="flex items-center gap-2">
            <input type="hidden" name="projectId" value={project.id} />
            <SubmitButton pendingText="Rebidding…">
              <RefreshCw className="h-4 w-4" /> Rebid and create v{(latest?.version ?? 0) + 1}
            </SubmitButton>
            <Link href={base} className={buttonClasses("ghost")}>
              Cancel
            </Link>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

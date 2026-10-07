import Link from "next/link";
import { Pencil } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { changeOrderTotals } from "@/lib/change-orders";
import { parseMarkupTable, tableExtras } from "@/lib/markup";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { cn, costCodeLabel, dateInput, fmtDate, lineCost, linePrice, money, pct } from "@/lib/utils";
import { groupBy } from "@/lib/finance";
import { Badge, Card, CardHeader, Collapsible, ConfirmForm, Field, Progress, Stat, SubmitButton, Tr, Th, Td, TFoot, buttonClasses } from "@/components/ui";
import { createExpense, updateExpense, toggleExpensePaid, deleteExpense } from "./actions";

type BudgetRow = {
  key: string;
  code: string;
  name: string;
  division: string;
  sortOrder: number;
  budgetCost: number;
  budgetPrice: number;
  actual: number;
};

const UNASSIGNED = "Unassigned";

export default async function BudgetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { edit } = await searchParams;
  const project = await getProject(id);

  const [estimate, cos, expenses, costCodes] = await Promise.all([
    db.estimate.findFirst({
      where: { projectId: project.id, status: "APPROVED" },
      orderBy: { version: "desc" },
      include: { items: { include: { costCode: true } } },
    }),
    db.changeOrder.findMany({ where: { projectId: project.id, status: "APPROVED" }, include: { items: { include: { costCode: true } } } }),
    db.expense.findMany({ where: { projectId: project.id }, include: { costCode: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    activeCostCodes(),
  ]);

  // --- Budget rows by cost code -------------------------------------------
  const rows = new Map<string, BudgetRow>();
  function rowFor(cc: { id: string; code: string | null; name: string; division: string; sortOrder: number } | null) {
    const key = cc?.id ?? UNASSIGNED;
    let row = rows.get(key);
    if (!row) {
      row = cc
        ? { key, code: cc.code ?? "", name: cc.name, division: cc.division, sortOrder: cc.sortOrder, budgetCost: 0, budgetPrice: 0, actual: 0 }
        : { key, code: "—", name: UNASSIGNED, division: UNASSIGNED, sortOrder: Number.MAX_SAFE_INTEGER, budgetCost: 0, budgetPrice: 0, actual: 0 };
      rows.set(key, row);
    }
    return row;
  }
  const estimateItems = (estimate?.items ?? []).filter((i) => !i.isOptional);
  for (const item of estimateItems) {
    const r = rowFor(item.costCode);
    r.budgetCost += lineCost(item);
    r.budgetPrice += linePrice(item);
  }
  // The Markup, Margin & Tax table's overhead and tax: budget price, in each row's cost code.
  const tableAmounts = estimate ? tableExtras(parseMarkupTable(estimate.markupTable, estimate.defaultMarkup), estimate.items) : null;
  for (const x of tableAmounts?.rows ?? []) {
    const cc = x.row.costCodeId ? costCodes.find((c) => c.id === x.row.costCodeId) : null;
    rowFor(cc ?? null).budgetPrice += x.amount;
  }
  for (const co of cos) {
    for (const item of co.items) {
      const r = rowFor(item.costCode);
      r.budgetCost += lineCost(item);
      r.budgetPrice += linePrice(item);
    }
  }
  for (const e of expenses) {
    rowFor(e.costCode).actual += e.amount;
  }
  const sorted = Array.from(rows.values()).sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
  const divisions = groupBy(sorted, (r) => r.division);

  // The quoted base price when there is one; otherwise what the lines add up to.
  // Sales tax is in the lines' prices (and costs).
  const approvedEstimatePrice = estimate?.basePrice ?? estimateItems.reduce((s, i) => s + linePrice(i), 0) + (tableAmounts?.overheadTotal ?? 0);
  const approvedCoPrice = cos.reduce((s, co) => s + changeOrderTotals(co, co.items).total, 0);
  const budget = (estimate ? approvedEstimatePrice : project.contractAmount) + approvedCoPrice;
  const budgetCost = sorted.reduce((s, r) => s + r.budgetCost, 0);
  const actual = expenses.reduce((s, e) => s + e.amount, 0);
  const unpaid = expenses.filter((e) => e.status === "UNPAID").reduce((s, e) => s + e.amount, 0);
  const margin = budget - actual;
  const marginPct = budget > 0 ? (margin / budget) * 100 : 0;
  const budgetHref = `/projects/${project.id}/budget`;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Budget"
          value={money(budget)}
          hint={
            estimate ? `Approved estimate ${money(approvedEstimatePrice, true)} + COs ${money(approvedCoPrice, true)}` : `Contract amount + COs ${money(approvedCoPrice, true)}`
          }
        />
        <Stat
          label="Actual costs"
          value={money(actual)}
          hint={budget > 0 ? `${pct((actual / budget) * 100)} of budget · ${expenses.length} expenses` : `${expenses.length} expenses`}
        />
        <Stat label="Projected margin" value={money(margin)} tone={margin >= 0 ? "good" : "bad"} hint={budget > 0 ? `${pct(marginPct, 1)} of budget` : undefined} />
        <Stat label="Unpaid bills" value={money(unpaid)} tone={unpaid > 0 ? "warn" : "default"} hint={`${expenses.filter((e) => e.status === "UNPAID").length} open`} />
      </div>

      <Card>
        <CardHeader
          title="Budget vs actual by cost code"
          description={
            estimate
              ? `Budget from approved estimate v${estimate.version}${cos.length ? ` and ${cos.length} approved change order${cos.length === 1 ? "" : "s"}` : ""}. Variance compares budget cost (before markup) to actual expenses.`
              : "No approved estimate yet — budget cost is from approved change orders only."
          }
        />
        {sorted.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing to compare yet. Approve an estimate or record expenses.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <Th>Code</Th>
                  <Th>Cost code</Th>
                  <Th right>Budget cost</Th>
                  <Th right>Budget price</Th>
                  <Th right>Actual</Th>
                  <Th right>Variance</Th>
                  <Th className="w-40">% used</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {divisions.map(([division, divRows]) => {
                  const dCost = divRows.reduce((s, r) => s + r.budgetCost, 0);
                  const dPrice = divRows.reduce((s, r) => s + r.budgetPrice, 0);
                  const dActual = divRows.reduce((s, r) => s + r.actual, 0);
                  return (
                    <DivisionRows key={division} division={division} cost={dCost} price={dPrice} actual={dActual}>
                      {divRows.map((r) => (
                        <BudgetLine key={r.key} row={r} />
                      ))}
                    </DivisionRows>
                  );
                })}
              </tbody>
              <TFoot>
                <tr>
                  <td className="px-4 py-2.5" colSpan={2}>
                    Total
                  </td>
                  <Td right className="font-semibold text-slate-900">
                    {money(budgetCost)}
                  </Td>
                  <Td right className="font-semibold text-slate-900">
                    {money(sorted.reduce((s, r) => s + r.budgetPrice, 0))}
                  </Td>
                  <Td right className="font-semibold text-slate-900">
                    {money(actual)}
                  </Td>
                  <Td right className={cn("font-semibold", budgetCost - actual >= 0 ? "text-emerald-700" : "text-rose-700")}>
                    {money(budgetCost - actual)}
                  </Td>
                  <Td>
                    <UsedBar budget={budgetCost} actual={actual} />
                  </Td>
                </tr>
              </TFoot>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Expenses" description="Actual costs: bills, receipts and subcontractor invoices." />
        {expenses.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No expenses recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <Th>Date</Th>
                  <Th>Vendor</Th>
                  <Th>Cost code</Th>
                  <Th>Category</Th>
                  <Th>Description</Th>
                  <Th right>Amount</Th>
                  <Th>Status</Th>
                  <Th>Ref</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expenses.map((e) =>
                  edit === e.id ? (
                    <tr key={e.id} className="bg-blue-50/40">
                      <td colSpan={9} className="px-4 py-3">
                        <form action={updateExpense} className="space-y-3">
                          <input type="hidden" name="projectId" value={project.id} />
                          <input type="hidden" name="id" value={e.id} />
                          <ExpenseFields expense={e} costCodes={costCodes} idPrefix={`edit-${e.id}`} />
                          <div className="flex items-center gap-2">
                            <SubmitButton size="sm">Save</SubmitButton>
                            <Link href={budgetHref} className={buttonClasses("secondary", "sm")}>
                              Cancel
                            </Link>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <Tr key={e.id}>
                      <Td className="whitespace-nowrap">{fmtDate(e.date)}</Td>
                      <Td className="font-medium text-slate-900">{e.vendor}</Td>
                      <Td className="text-xs text-slate-600">{e.costCode ? costCodeLabel(e.costCode) : "—"}</Td>
                      <Td>
                        <Badge>{e.category.charAt(0) + e.category.slice(1).toLowerCase()}</Badge>
                      </Td>
                      <Td className="max-w-xs">{e.description ?? "—"}</Td>
                      <Td right className="font-medium text-slate-900">
                        {money(e.amount)}
                      </Td>
                      <Td>
                        <Badge status={e.status} />
                      </Td>
                      <Td className="text-xs text-slate-600">{e.reference ?? "—"}</Td>
                      <Td>
                        <span className="flex items-center justify-end gap-1">
                          <form action={toggleExpensePaid}>
                            <input type="hidden" name="projectId" value={project.id} />
                            <input type="hidden" name="id" value={e.id} />
                            <SubmitButton variant="ghost" size="sm">
                              {e.status === "PAID" ? "Mark unpaid" : "Mark paid"}
                            </SubmitButton>
                          </form>
                          <Link href={`${budgetHref}?edit=${e.id}`} className={buttonClasses("ghost", "sm")}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Link>
                          <ConfirmForm action={deleteExpense} hidden={{ projectId: project.id, id: e.id }} message="Delete this expense?" variant="ghost">
                            <span className="text-rose-700">Delete</span>
                          </ConfirmForm>
                        </span>
                      </Td>
                    </Tr>
                  ),
                )}
              </tbody>
              <TFoot>
                <tr>
                  <td className="px-4 py-2.5" colSpan={5}>
                    Total
                  </td>
                  <Td right className="font-semibold text-slate-900">
                    {money(actual)}
                  </Td>
                  <td colSpan={3} className="px-4 py-2.5 text-xs font-normal text-slate-500">
                    Unpaid {money(unpaid)}
                  </td>
                </tr>
              </TFoot>
            </table>
          </div>
        )}
      </Card>

      <Collapsible summary="Add expense" defaultOpen={expenses.length === 0}>
        <form action={createExpense} className="space-y-3">
          <input type="hidden" name="projectId" value={project.id} />
          <ExpenseFields costCodes={costCodes} idPrefix="new-expense" />
          <SubmitButton size="sm">Add expense</SubmitButton>
        </form>
      </Collapsible>
    </div>
  );
}

function ExpenseFields({
  expense,
  costCodes,
  idPrefix,
}: {
  expense?: { date: Date; vendor: string; costCodeId: string | null; category: string; amount: number; description: string | null; reference: string | null; status: string };
  costCodes: { id: string; code: string | null; name: string }[];
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
      <Field label="Date" htmlFor={`${idPrefix}-date`} className="md:col-span-2">
        <input id={`${idPrefix}-date`} name="date" type="date" className="input" defaultValue={dateInput(expense?.date ?? new Date())} required />
      </Field>
      <Field label="Vendor" htmlFor={`${idPrefix}-vendor`} className="md:col-span-3">
        <input id={`${idPrefix}-vendor`} name="vendor" className="input" defaultValue={expense?.vendor ?? ""} required />
      </Field>
      <Field label="Cost code" htmlFor={`${idPrefix}-costCode`} className="md:col-span-4">
        <select id={`${idPrefix}-costCode`} name="costCodeId" className="input" defaultValue={expense?.costCodeId ?? ""}>
          <option value="">— Unassigned —</option>
          {costCodes.map((c) => (
            <option key={c.id} value={c.id}>
              {costCodeLabel(c)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Category" htmlFor={`${idPrefix}-category`} className="md:col-span-3">
        <select id={`${idPrefix}-category`} name="category" className="input" defaultValue={expense?.category ?? "MATERIAL"}>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c.charAt(0) + c.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Amount" htmlFor={`${idPrefix}-amount`} className="md:col-span-2">
        <input id={`${idPrefix}-amount`} name="amount" type="number" step="0.01" min="0" className="input" defaultValue={expense?.amount ?? ""} required />
      </Field>
      <Field label="Description" htmlFor={`${idPrefix}-description`} className="col-span-2 md:col-span-5">
        <input id={`${idPrefix}-description`} name="description" className="input" defaultValue={expense?.description ?? ""} />
      </Field>
      <Field label="Reference" htmlFor={`${idPrefix}-reference`} className="md:col-span-3">
        <input id={`${idPrefix}-reference`} name="reference" className="input" defaultValue={expense?.reference ?? ""} placeholder="Vendor invoice #" />
      </Field>
      <Field label="Status" htmlFor={`${idPrefix}-status`} className="md:col-span-2">
        <select id={`${idPrefix}-status`} name="status" className="input" defaultValue={expense?.status ?? "UNPAID"}>
          <option value="UNPAID">Unpaid</option>
          <option value="PAID">Paid</option>
        </select>
      </Field>
    </div>
  );
}

function UsedBar({ budget, actual }: { budget: number; actual: number }) {
  const used = budget > 0 ? (actual / budget) * 100 : actual > 0 ? 100 : 0;
  const color = used > 100 ? "#e11d48" : used > 90 ? "#d97706" : "#2563eb";
  return (
    <span className="flex items-center gap-2">
      <Progress value={used} color={color} className="w-24" />
      <span className="w-12 text-right text-xs tabular-nums text-slate-600">{budget > 0 ? pct(used) : actual > 0 ? "n/a" : "0%"}</span>
    </span>
  );
}

function BudgetLine({ row }: { row: BudgetRow }) {
  const variance = row.budgetCost - row.actual;
  return (
    <Tr>
      <Td className="font-mono text-xs text-slate-600">{row.code || "—"}</Td>
      <Td className="text-slate-900">{row.name}</Td>
      <Td right>{money(row.budgetCost)}</Td>
      <Td right className="text-slate-500">
        {money(row.budgetPrice)}
      </Td>
      <Td right>{money(row.actual)}</Td>
      <Td right className={cn("font-medium", variance >= 0 ? "text-emerald-700" : "text-rose-700")}>
        {money(variance)}
      </Td>
      <Td>
        <UsedBar budget={row.budgetCost} actual={row.actual} />
      </Td>
    </Tr>
  );
}

function DivisionRows({ division, cost, price, actual, children }: { division: string; cost: number; price: number; actual: number; children: React.ReactNode }) {
  const variance = cost - actual;
  return (
    <>
      <tr className="bg-slate-50/80">
        <td colSpan={7} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {division}
        </td>
      </tr>
      {children}
      <tr className="bg-slate-50/40 text-xs text-slate-600">
        <td className="px-4 py-1.5 italic" colSpan={2}>
          {division} subtotal
        </td>
        <Td right className="py-1.5 text-xs">
          {money(cost)}
        </Td>
        <Td right className="py-1.5 text-xs">
          {money(price)}
        </Td>
        <Td right className="py-1.5 text-xs">
          {money(actual)}
        </Td>
        <Td right className={cn("py-1.5 text-xs font-medium", variance >= 0 ? "text-emerald-700" : "text-rose-700")}>
          {money(variance)}
        </Td>
        <td />
      </tr>
    </>
  );
}

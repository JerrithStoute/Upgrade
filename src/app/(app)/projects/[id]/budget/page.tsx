import Link from "@/components/link";
import { Pencil } from "lucide-react";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { jobBudget } from "@/lib/job-budget";
import { costCodeLabel, fmtDate, money } from "@/lib/utils";
import { Badge, ConfirmForm, SubmitButton, Tr, Th, Td, TFoot, buttonClasses } from "@/components/ui";
import { newPoChoices } from "../purchasing/_data";
import { createExpense, updateExpense, toggleExpensePaid, deleteExpense, setBudgetDone } from "./actions";
import { ExpenseFields } from "./expense-fields";
import { BudgetGrid } from "./budget-grid";

export default async function BudgetPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  const user = await requireView("budget");
  const { id } = await params;
  const { edit } = await searchParams;
  const project = await getProject(id);
  const canBuy = allows(user.access, "purchasing", 2);

  const [budget, expenses, costCodes, poChoices] = await Promise.all([
    jobBudget(project),
    db.expense.findMany({ where: { projectId: project.id }, include: { costCode: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    activeCostCodes(),
    canBuy ? newPoChoices(project.id) : null,
  ]);
  const spent = expenses.reduce((s, e) => s + e.amount, 0);
  const unpaid = expenses.filter((e) => e.status === "UNPAID").reduce((s, e) => s + e.amount, 0);
  const budgetHref = `/projects/${project.id}/budget`;

  return (
    <div className="space-y-5">
      <BudgetGrid
        // A new expense changes what's spent: start fresh, so its panel closes.
        key={`${expenses.length}-${spent}`}
        projectId={project.id}
        lines={budget.lines}
        contract={budget.contract}
        coCount={budget.coCount}
        estimateName={budget.estimate?.name ?? null}
        unpaid={budget.unpaid}
        canEdit={allows(user.access, "budget", 2)}
        canBuy={canBuy}
        poChoices={poChoices}
        costCodes={costCodes.map((c) => ({ id: c.id, code: c.code, name: c.name }))}
        addExpense={createExpense}
        setDone={setBudgetDone}
      />

      <details id="expenses" open={!!edit} className="group rounded-lg border border-slate-200 bg-white">
        <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-2.5 text-sm">
          <span>
            <span className="font-semibold text-slate-900">All expenses</span>
            <span className="ml-2 text-xs text-slate-500">Bills, receipts, crew time and everything else spent on this job</span>
          </span>
          <span className="text-xs text-slate-500">
            {expenses.length} · {money(spent)} <span className="ml-1 inline-block transition group-open:rotate-90">▸</span>
          </span>
        </summary>
        {expenses.length === 0 ? (
          <p className="border-t border-slate-200 px-5 py-6 text-center text-sm text-slate-500">Nothing spent yet.</p>
        ) : (
          <div className="overflow-x-auto border-t border-slate-200">
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
                          <div className="flex items-center gap-2">
                            <SubmitButton size="sm">Save</SubmitButton>
                            <Link href={budgetHref} className={buttonClasses("secondary", "sm")}>
                              Cancel
                            </Link>
                          </div>
                          <ExpenseFields expense={e} costCodes={costCodes} idPrefix={`edit-${e.id}`} />
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <Tr key={e.id}>
                      <Td className="whitespace-nowrap">{fmtDate(e.date)}</Td>
                      <Td className="font-medium text-slate-900">{e.vendor}</Td>
                      <Td className="text-xs text-slate-600">{e.costCode ? costCodeLabel(e.costCode) : <span className="text-amber-700">Not sorted</span>}</Td>
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
                        {e.laborWeek ? (
                          // Crew time from the time clock: fixed on Timesheets, worked out here again by itself.
                          <span className="flex justify-end">
                            <Link href={`/time/sheets?week=${e.laborWeek}`} className={buttonClasses("ghost", "sm")}>
                              Timesheets
                            </Link>
                          </span>
                        ) : e.carryingCostId ? (
                          // A spec house's carrying cost: set on the Spec sale tab, charged here each month.
                          <span className="flex justify-end">
                            <Link href={`/projects/${project.id}/spec#carrying`} className={buttonClasses("ghost", "sm")}>
                              Spec sale
                            </Link>
                          </span>
                        ) : e.fromInventory ? (
                          // Pulled from / returned to the company's inventory: undone there, so stock and the job agree.
                          <span className="flex justify-end">
                            <Link href={`/projects/${project.id}/materials/inventory`} className={buttonClasses("ghost", "sm")}>
                              Inventory
                            </Link>
                          </span>
                        ) : e.billId ? (
                          // From an approved vendor bill: changed (or paid) on the bill, so the two never disagree.
                          <span className="flex justify-end">
                            <Link href={`/projects/${project.id}/purchasing/bills/${e.billId}`} className={buttonClasses("ghost", "sm")}>
                              Open bill
                            </Link>
                          </span>
                        ) : (
                          <span className="flex items-center justify-end gap-1">
                            <form action={toggleExpensePaid}>
                              <input type="hidden" name="projectId" value={project.id} />
                              <input type="hidden" name="id" value={e.id} />
                              <SubmitButton variant="ghost" size="sm">
                                {e.status === "PAID" ? "Mark unpaid" : "Mark paid"}
                              </SubmitButton>
                            </form>
                            <Link href={`${budgetHref}?edit=${e.id}#expenses`} className={buttonClasses("ghost", "sm")}>
                              <Pencil className="h-3.5 w-3.5" /> Edit
                            </Link>
                            <ConfirmForm action={deleteExpense} hidden={{ projectId: project.id, id: e.id }} message="Delete this expense?" variant="ghost">
                              <span className="text-rose-700">Delete</span>
                            </ConfirmForm>
                          </span>
                        )}
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
                    {money(spent)}
                  </Td>
                  <td colSpan={3} className="px-4 py-2.5 text-xs font-normal text-slate-500">
                    Unpaid {money(unpaid)}
                  </td>
                </tr>
              </TFoot>
            </table>
          </div>
        )}
      </details>
    </div>
  );
}

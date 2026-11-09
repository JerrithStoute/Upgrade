import { EXPENSE_CATEGORIES } from "@/lib/constants";
import { costCodeLabel, dateInput } from "@/lib/utils";
import { Field } from "@/components/ui";

/** An expense's boxes: adding one (on the Budget's side panel) and editing one by hand. */
export function ExpenseFields({
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

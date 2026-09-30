import { costCodeLabel, dateInput } from "@/lib/utils";
import { Field, FormGrid } from "@/components/ui";

export function SelectionFields({
  values,
  categories,
  costCodes,
}: {
  values: {
    title?: string;
    category?: string;
    location?: string | null;
    costCodeId?: string | null;
    allowance?: number;
    dueDate?: Date | null;
    description?: string | null;
    notes?: string | null;
  };
  categories: string[];
  costCodes: { id: string; code: string | null; name: string }[];
}) {
  return (
    <FormGrid>
      <Field label="Title" htmlFor="sel-title">
        <input id="sel-title" name="title" className="input" required defaultValue={values.title ?? ""} placeholder="e.g. Kitchen faucet" />
      </Field>
      <Field label="Category" htmlFor="sel-category" hint="Pick an existing category or type a new one">
        <input id="sel-category" name="category" className="input" list="sel-categories" defaultValue={values.category ?? ""} placeholder="Plumbing Fixtures" />
        <datalist id="sel-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </Field>
      <Field label="Location" htmlFor="sel-location">
        <input id="sel-location" name="location" className="input" defaultValue={values.location ?? ""} placeholder="Kitchen, Master Bath…" />
      </Field>
      <Field label="Cost code" htmlFor="sel-costCode">
        <select id="sel-costCode" name="costCodeId" className="input" defaultValue={values.costCodeId ?? ""}>
          <option value="">None</option>
          {costCodes.map((c) => (
            <option key={c.id} value={c.id}>
              {costCodeLabel(c, " · ")}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Allowance" htmlFor="sel-allowance">
        <input id="sel-allowance" name="allowance" type="number" step="0.01" min={0} className="input" defaultValue={values.allowance ?? 0} />
      </Field>
      <Field label="Due date" htmlFor="sel-due">
        <input id="sel-due" name="dueDate" type="date" className="input" defaultValue={dateInput(values.dueDate)} />
      </Field>
      <Field label="Description" htmlFor="sel-desc" className="md:col-span-2" hint="Shown to the client">
        <textarea id="sel-desc" name="description" className="input" rows={3} defaultValue={values.description ?? ""} />
      </Field>
      <Field label="Internal notes" htmlFor="sel-notes" className="md:col-span-2">
        <textarea id="sel-notes" name="notes" className="input" rows={2} defaultValue={values.notes ?? ""} />
      </Field>
    </FormGrid>
  );
}

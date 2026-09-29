import { WEATHER } from "@/lib/constants";
import { dateInput } from "@/lib/utils";
import { Field, FormGrid } from "@/components/ui";

export function LogFields({
  values,
}: {
  values: {
    date?: Date | null;
    weather?: string | null;
    tempHigh?: number | null;
    tempLow?: number | null;
    crewCount?: number;
    hoursWorked?: number;
    workCompleted?: string | null;
    issues?: string | null;
    notes?: string | null;
    clientVisible?: boolean;
  };
}) {
  return (
    <FormGrid className="md:grid-cols-6">
      <Field label="Date" htmlFor="log-date" className="md:col-span-2">
        <input id="log-date" type="date" name="date" className="input" required defaultValue={dateInput(values.date ?? new Date())} />
      </Field>
      <Field label="Weather" htmlFor="log-weather" className="md:col-span-2">
        <select id="log-weather" name="weather" className="input" defaultValue={values.weather ?? ""}>
          <option value="">—</option>
          {WEATHER.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </Field>
      <Field label="High °F" htmlFor="log-hi">
        <input id="log-hi" type="number" name="tempHigh" className="input" defaultValue={values.tempHigh ?? ""} />
      </Field>
      <Field label="Low °F" htmlFor="log-lo">
        <input id="log-lo" type="number" name="tempLow" className="input" defaultValue={values.tempLow ?? ""} />
      </Field>
      <Field label="Crew on site" htmlFor="log-crew" className="md:col-span-3">
        <input id="log-crew" type="number" min={0} name="crewCount" className="input" defaultValue={values.crewCount ?? 0} />
      </Field>
      <Field label="Hours worked" htmlFor="log-hours" className="md:col-span-3">
        <input id="log-hours" type="number" min={0} step="0.5" name="hoursWorked" className="input" defaultValue={values.hoursWorked ?? 0} />
      </Field>
      <Field label="Work completed" htmlFor="log-work" className="md:col-span-6">
        <textarea id="log-work" name="workCompleted" className="input" rows={4} defaultValue={values.workCompleted ?? ""} placeholder="What got done today?" />
      </Field>
      <Field label="Issues / delays" htmlFor="log-issues" className="md:col-span-6">
        <textarea id="log-issues" name="issues" className="input" rows={2} defaultValue={values.issues ?? ""} placeholder="Anything blocking progress, safety items, inspection results…" />
      </Field>
      <Field label="Internal notes" htmlFor="log-notes" className="md:col-span-6">
        <textarea id="log-notes" name="notes" className="input" rows={2} defaultValue={values.notes ?? ""} />
      </Field>
      <Field label="Add photos" htmlFor="log-photos" className="md:col-span-4" hint="Saved to the project's Photos folder">
        <input id="log-photos" type="file" name="photos" multiple accept="image/*" className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-700 hover:file:bg-slate-50" />
      </Field>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700 md:col-span-2">
        <input type="checkbox" name="clientVisible" defaultChecked={values.clientVisible ?? true} className="h-4 w-4 rounded border-slate-300" />
        Visible to client
      </label>
    </FormGrid>
  );
}

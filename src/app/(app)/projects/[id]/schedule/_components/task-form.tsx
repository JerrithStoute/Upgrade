import { SCHEDULE_PHASES } from "@/lib/constants";
import { dateInput } from "@/lib/utils";
import { Field, FormGrid } from "@/components/ui";

type TaskValues = {
  id?: string;
  name?: string;
  phase?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  percentComplete?: number;
  assigneeId?: string | null;
  predecessorId?: string | null;
  isMilestone?: boolean;
  color?: string;
  notes?: string | null;
};

const COLORS = ["#2563eb", "#0891b2", "#059669", "#d97706", "#dc2626", "#7c3aed", "#db2777", "#475569"];

/** Shared field set for the add/edit task forms. Renders inside a <form>. */
export function TaskFields({
  values,
  staff,
  otherTasks,
  idPrefix,
}: {
  values: TaskValues;
  staff: { id: string; name: string }[];
  otherTasks: { id: string; name: string; phase: string }[];
  idPrefix: string;
}) {
  const phase = values.phase ?? "";
  const known = (SCHEDULE_PHASES as readonly string[]).includes(phase);
  return (
    <FormGrid className="md:grid-cols-4">
      <Field label="Task name" htmlFor={`${idPrefix}-name`} className="md:col-span-2">
        <input id={`${idPrefix}-name`} name="name" className="input" required defaultValue={values.name ?? ""} placeholder="e.g. Drywall hang & finish" />
      </Field>
      <Field label="Phase" htmlFor={`${idPrefix}-phase`}>
        <select id={`${idPrefix}-phase`} name="phase" className="input" defaultValue={known ? phase : ""}>
          <option value="">— custom (type below) —</option>
          {SCHEDULE_PHASES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Custom phase" htmlFor={`${idPrefix}-phaseCustom`} hint="Overrides the dropdown when filled">
        <input id={`${idPrefix}-phaseCustom`} name="phaseCustom" className="input" defaultValue={known ? "" : phase} placeholder="e.g. Punch List" />
      </Field>
      <Field label="Start" htmlFor={`${idPrefix}-start`}>
        <input id={`${idPrefix}-start`} type="date" name="startDate" className="input" required defaultValue={dateInput(values.startDate)} />
      </Field>
      <Field label="End" htmlFor={`${idPrefix}-end`}>
        <input id={`${idPrefix}-end`} type="date" name="endDate" className="input" defaultValue={dateInput(values.endDate)} />
      </Field>
      <Field label="% complete" htmlFor={`${idPrefix}-pct`}>
        <input id={`${idPrefix}-pct`} type="number" min={0} max={100} step={5} name="percentComplete" className="input" defaultValue={values.percentComplete ?? 0} />
      </Field>
      <Field label="Assignee" htmlFor={`${idPrefix}-assignee`}>
        <select id={`${idPrefix}-assignee`} name="assigneeId" className="input" defaultValue={values.assigneeId ?? ""}>
          <option value="">Unassigned</option>
          {staff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Predecessor" htmlFor={`${idPrefix}-pred`} className="md:col-span-2" hint="Successors are pushed when this task's end moves past their start">
        <select id={`${idPrefix}-pred`} name="predecessorId" className="input" defaultValue={values.predecessorId ?? ""}>
          <option value="">None</option>
          {otherTasks
            .filter((t) => t.id !== values.id)
            .map((t) => (
              <option key={t.id} value={t.id}>
                {t.phase} · {t.name}
              </option>
            ))}
        </select>
      </Field>
      <Field label="Color" htmlFor={`${idPrefix}-color`}>
        <div className="flex items-center gap-2">
          <input id={`${idPrefix}-color`} type="color" name="color" defaultValue={values.color ?? "#2563eb"} list={`${idPrefix}-colors`} className="h-9 w-14 cursor-pointer rounded-md border border-slate-300 bg-white p-0.5" />
          <datalist id={`${idPrefix}-colors`}>
            {COLORS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="isMilestone" defaultChecked={values.isMilestone ?? false} className="h-4 w-4 rounded border-slate-300" />
            Milestone
          </label>
        </div>
      </Field>
      <Field label="Notes" htmlFor={`${idPrefix}-notes`} className="md:col-span-4">
        <textarea id={`${idPrefix}-notes`} name="notes" className="input" rows={2} defaultValue={values.notes ?? ""} />
      </Field>
    </FormGrid>
  );
}

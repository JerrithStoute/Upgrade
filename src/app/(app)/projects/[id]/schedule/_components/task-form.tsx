import { SCHEDULE_PHASES } from "@/lib/constants";
import { dateInput } from "@/lib/utils";
import { Field, FormGrid } from "@/components/ui";
import { ColorSwatches } from "@/components/ui/color-swatches";
import { PredecessorsField, type LinkValue } from "./predecessors-field";

type TaskValues = {
  id?: string;
  name?: string;
  phase?: string;
  startDate?: Date | null;
  endDate?: Date | null;
  percentComplete?: number;
  assigneeId?: string | null;
  isMilestone?: boolean;
  color?: string;
  notes?: string | null;
};

/** Shared field set for the add/edit task forms. Renders inside a <form>. */
export function TaskFields({
  values,
  staff,
  otherTasks,
  links = [],
  idPrefix,
}: {
  values: TaskValues;
  staff: { id: string; name: string }[];
  otherTasks: { id: string; name: string; phase: string }[];
  /** What this task waits on now. */
  links?: LinkValue[];
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
      <Field
        label="Waits on"
        htmlFor={`${idPrefix}-pred`}
        className="md:col-span-2"
        hint="It starts after the last of these finishes (plus any lag, in workdays) — and moves when they do"
      >
        <PredecessorsField name="links" idPrefix={idPrefix} options={otherTasks.filter((t) => t.id !== values.id)} initial={links} />
      </Field>
      <Field label="Color">
        <div className="flex items-center gap-2">
          <ColorSwatches name="color" defaultValue={values.color ?? "#2563eb"} label="Bar color" />
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

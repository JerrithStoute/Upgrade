import type { Role } from "@/lib/notify-rules";

/**
 * Who something goes to: ticks for people worked out each time (the job's manager…), whole positions, and
 * people by name. Sent as `name` values "role:…", "pos:…", "user:…".
 */
export function WhoPicker({
  name = "to",
  roles = [],
  positions,
  people,
  value,
  idPrefix,
}: {
  name?: string;
  roles?: Role[];
  positions: { id: string; name: string }[];
  people: { id: string; name: string }[];
  value: string[];
  idPrefix: string;
}) {
  const box = (v: string, label: string) => (
    <label key={v} className="flex items-center gap-1.5 text-sm text-slate-700">
      <input type="checkbox" name={name} value={v} defaultChecked={value.includes(v)} id={`${idPrefix}-${v}`} className="h-4 w-4 rounded border-slate-300" />
      {label}
    </label>
  );
  return (
    <div className="space-y-2">
      {roles.length ? <div className="flex flex-wrap gap-x-4 gap-y-1.5">{roles.map((r) => box(`role:${r.key}`, r.label))}</div> : null}
      {positions.length ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Positions</span>
          {positions.map((p) => box(`pos:${p.id}`, p.name))}
        </div>
      ) : null}
      {people.length ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">People</span>
          {people.map((p) => box(`user:${p.id}`, p.name))}
        </div>
      ) : null}
    </div>
  );
}

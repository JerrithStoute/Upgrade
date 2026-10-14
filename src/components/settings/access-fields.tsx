import { AREAS, JOBS_LABEL, LEVELS, SWITCHES, type Access } from "@/lib/access";

/**
 * The access grid — one row per area (Hidden / Can view / Can edit), which jobs, and the two
 * switches. The same grid for a position and for one person; for a person, `base` is their
 * position and anything set differently is marked "changed".
 */
export function AccessFields({ value, base, form }: { value: Access; base?: Access; form?: string }) {
  const changed = (k: keyof Access) => !!base && base[k] !== value[k];
  const mark = (k: keyof Access) => (changed(k) ? <span className="ml-1.5 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">changed</span> : null);
  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            {AREAS.map((a) => (
              <tr key={a.key}>
                <td className="px-3 py-2">
                  <span className="font-medium text-slate-800">{a.label}</span>
                  {mark(a.key)}
                  <span className="block text-xs text-slate-500">{a.hint}</span>
                </td>
                <td className="w-40 px-3 py-2">
                  <select name={`area_${a.key}`} defaultValue={String(value[a.key])} className="input !h-8 !py-0 text-sm" form={form} aria-label={a.label}>
                    {LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <label className="block max-w-md">
        <span className="label">
          Which jobs{mark("jobs")}
        </span>
        <select name="jobs" defaultValue={value.jobs} className="input" form={form}>
          {(Object.keys(JOBS_LABEL) as Access["jobs"][]).map((j) => (
            <option key={j} value={j}>
              {JOBS_LABEL[j]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
        {SWITCHES.map((s) => (
          <label key={s.key} className="flex items-center gap-1.5">
            <input type="checkbox" name={s.key} defaultChecked={value[s.key]} className="h-4 w-4 rounded border-slate-300" form={form} />
            {s.label}
            {mark(s.key)}
          </label>
        ))}
      </div>
    </div>
  );
}

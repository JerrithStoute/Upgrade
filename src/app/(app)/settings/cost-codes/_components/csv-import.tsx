"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileUp } from "lucide-react";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { parseCostCodeCsv, planCostCodeImport, type ExistingCostCode } from "@/lib/cost-code-csv";

/**
 * Upload a CSV (column A = group, column B = cost code), preview the result against
 * the current library, then replace everything in one step. Nothing is saved until
 * "Replace all cost codes" is clicked.
 */
export function CostCodeCsvImport({ existing, action }: { existing: ExistingCostCode[]; action: (formData: FormData) => void | Promise<void> }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState("");

  const parsed = useMemo(() => (text ? parseCostCodeCsv(text) : null), [text]);
  const plan = useMemo(() => (parsed && !parsed.errors.length ? planCostCodeImport(parsed.codes, existing) : null), [parsed, existing]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setText(await file.text());
  }

  const kept = plan?.rows.filter((r) => r.match).length ?? 0;
  const added = plan ? plan.rows.length - kept : 0;
  const affectedRecords = plan?.removed.reduce((s, r) => s + r.refs, 0) ?? 0;
  const numbered = parsed?.codes.filter((c) => c.code).length ?? 0;

  return (
    <div className="space-y-4">
      <div className="text-sm text-slate-600">
        <p>
          Upload a comma-delimited <strong>.csv</strong> file. <strong>Column A</strong> is the group (used exactly as written; one group per unique value).{" "}
          <strong>Column B</strong> is the cost code; it goes into the group on the same row. If Column B starts with a number, that number becomes the code and the rest becomes
          the name — e.g. <code className="rounded bg-slate-100 px-1">09-410 Tile Material</code>.
        </p>
        <p className="mt-1">
          This <strong>replaces the entire cost code list</strong>. Existing codes with the same name are kept so estimates and expenses stay linked; all others are deleted.
          You&apos;ll see a preview before anything changes.
        </p>
      </div>

      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
        <FileUp className="h-4 w-4 text-slate-500" />
        {fileName ? `Change file (${fileName})` : "Choose CSV file…"}
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={onFile} />
      </label>

      {parsed && parsed.errors.length > 0 ? (
        <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
          <p className="font-medium">Fix these problems in the file and upload it again — nothing has been changed:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {parsed.errors.slice(0, 20).map((e) => (
              <li key={e}>{e}</li>
            ))}
            {parsed.errors.length > 20 ? <li>…and {parsed.errors.length - 20} more</li> : null}
          </ul>
        </div>
      ) : null}

      {parsed && plan ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
            <Summary label="Groups" value={parsed.groups.length} />
            <Summary label="Cost codes" value={parsed.codes.length} hint={`${numbered} with a number`} />
            <Summary label="Kept (same name)" value={kept} />
            <Summary label="New" value={added} />
            <Summary label="Deleted" value={plan.removed.length} tone={plan.removed.length ? "bad" : undefined} />
          </div>
          {parsed.skippedHeader ? <p className="text-xs text-slate-500">The first row looked like column titles and was skipped.</p> : null}

          <div className="max-h-96 overflow-auto rounded-md border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parsed.groups.map((g) => (
                  <GroupPreview key={g} group={g} rows={plan.rows.filter((r) => r.group === g)} />
                ))}
              </tbody>
            </table>
          </div>

          {plan.removed.length > 0 ? (
            <details className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
              <summary className="cursor-pointer font-medium text-amber-900">
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                {plan.removed.length} current cost code{plan.removed.length === 1 ? "" : "s"} will be deleted
                {affectedRecords > 0 ? ` — ${affectedRecords} estimate/expense/selection line${affectedRecords === 1 ? "" : "s"} will lose their cost code` : ""}
              </summary>
              <ul className="mt-2 columns-1 gap-6 text-slate-700 sm:columns-2">
                {plan.removed.map((r) => (
                  <li key={r.id}>
                    {r.code ? <span className="font-mono">{r.code} </span> : null}
                    {r.name}{" "}
                    <span className="text-xs text-slate-500">
                      ({r.division}
                      {r.refs ? ` · used ${r.refs}×` : ""})
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          <form
            action={action}
            onSubmit={(e) => {
              const msg = `Replace ALL cost codes with the ${parsed.codes.length} in ${fileName}?\n\n${kept} kept · ${added} new · ${plan.removed.length} deleted${affectedRecords ? `\n${affectedRecords} existing lines will lose their cost code.` : ""}\n\nThis cannot be undone.`;
              if (!window.confirm(msg)) e.preventDefault();
            }}
          >
            <input type="hidden" name="csv" value={text} />
            <SubmitButton variant="danger">Replace all cost codes</SubmitButton>
          </form>
        </div>
      ) : null}
    </div>
  );
}

function Summary({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "bad" }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={cn("text-lg font-semibold tabular-nums", tone === "bad" ? "text-rose-700" : "text-slate-900")}>{value}</p>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function GroupPreview({ group, rows }: { group: string; rows: ReturnType<typeof planCostCodeImport>["rows"] }) {
  return (
    <>
      <tr className="bg-slate-50/80">
        <td colSpan={3} className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {group} <span className="font-normal normal-case text-slate-400">· {rows.length}</span>
        </td>
      </tr>
      {rows.map((r) => (
        <tr key={r.line}>
          <td className="px-3 py-1.5 font-mono text-slate-700">{r.code ?? <span className="text-slate-300">—</span>}</td>
          <td className="px-3 py-1.5 text-slate-900">{r.name}</td>
          <td className="px-3 py-1.5 text-xs">
            {r.match ? <span className="text-emerald-700">Kept (was in {r.match.division})</span> : <span className="text-blue-700">New</span>}
          </td>
        </tr>
      ))}
    </>
  );
}

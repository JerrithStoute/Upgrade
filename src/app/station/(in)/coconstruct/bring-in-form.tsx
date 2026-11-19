"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { Button, Card, CardHeader, Field } from "@/components/ui";
import { FormNote } from "@/components/auth-card";
import { planTotals, type CcCategoryPlan, type CcEstimate, type CcPlan, type CcRole, type CcChoiceStatus } from "@/lib/coconstruct/estimate";
import { bringInCoConstruct, previewCoConstruct } from "./actions";

const money = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });

/**
 * 1. Pick the builder, drop the estimate export (and the PDFs), read it.
 * 2. Say what each category is — part of the estimate (a selection or not), a change order, or
 *    left out — check the totals against CoConstruct's, and bring it in.
 */
export function BringInForm({ builders }: { builders: { id: string; name: string }[] }) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [est, setEst] = useState<CcEstimate | null>(null);
  const [plan, setPlan] = useState<CcPlan | null>(null);
  const [job, setJob] = useState({ jobName: "", clientFirst: "", clientLast: "", markupPct: "15" });
  const [finalApproved, setFinalApproved] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  const read = () =>
    start(async () => {
      setError(undefined);
      setDone(undefined);
      const r = await previewCoConstruct(new FormData(form.current!));
      if (r.error || !r.est || !r.plan) {
        setError(r.error);
        return;
      }
      setEst(r.est);
      setPlan(r.plan);
      setJob({ jobName: r.jobName ?? "", clientFirst: r.clientFirst ?? "", clientLast: r.clientLast ?? "", markupPct: String(r.markupPct ?? 15) });
    });

  const bringIn = () =>
    start(async () => {
      setError(undefined);
      const fd = new FormData(form.current!);
      fd.set("plan", JSON.stringify(plan));
      const r = await bringInCoConstruct(fd);
      if (r.error) setError(r.error);
      else {
        setDone(r.done);
        setEst(null);
        setPlan(null);
      }
    });

  const set = (row: number, change: Partial<CcCategoryPlan>) =>
    setPlan((p) => (p ? { ...p, categories: p.categories.map((c) => (c.row === row ? { ...c, ...change } : c)) } : p));
  const totals = useMemo(() => (est && plan ? planTotals(est, plan) : null), [est, plan]);
  const contract = totals ? (finalApproved ? totals.contract : totals.contract - totals.finalChoices) : 0;

  const divisions = useMemo(() => {
    const out: { name: string; cats: CcEstimate["categories"] }[] = [];
    for (const c of est?.categories ?? []) {
      const last = out.at(-1);
      if (last && last.name === c.division) last.cats.push(c);
      else out.push({ name: c.division, cats: [c] });
    }
    return out;
  }, [est]);

  return (
    <form ref={form} onSubmit={(e) => e.preventDefault()} className="space-y-6">
      <Card>
        <CardHeader title="1. The files" description="From CoConstruct: the estimate (Estimate → Export → Excel) and any PDFs to keep with the job (change orders, specs and selections…). The PDFs go in the job's Files, for the team only." />
        <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-3">
          <Field label="Builder" htmlFor="builder">
            <select id="builder" name="builder" className="input" defaultValue="" required>
              <option value="" disabled>
                Pick a builder…
              </option>
              {builders.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Estimate export (.xlsx)" htmlFor="estimate">
            <input id="estimate" name="estimate" type="file" accept=".xlsx" className="input" onChange={() => (setEst(null), setPlan(null))} />
          </Field>
          <Field label="PDFs (optional)" htmlFor="pdfs">
            <input id="pdfs" name="pdfs" type="file" accept=".pdf,image/*" multiple className="input" />
          </Field>
          <div className="md:col-span-3 flex items-center gap-3">
            <Button type="button" variant="secondary" onClick={read} disabled={pending}>
              {pending && !est ? "Reading…" : "Read the estimate"}
            </Button>
            {done ? <span className="text-sm text-emerald-700">{done}</span> : null}
          </div>
        </div>
      </Card>

      {est && plan && totals ? (
        <>
          <Card>
            <CardHeader title="2. The job" description="The job's name must be exactly the job's name in QuickBooks, so they link up (bills and payments come in by it)." />
            <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-4">
              <Field label="Job name" htmlFor="jobName">
                <input id="jobName" name="jobName" className="input" value={job.jobName} onChange={(e) => setJob({ ...job, jobName: e.target.value })} />
              </Field>
              <Field label="Client first name(s)" htmlFor="clientFirst">
                <input id="clientFirst" name="clientFirst" className="input" value={job.clientFirst} onChange={(e) => setJob({ ...job, clientFirst: e.target.value })} />
              </Field>
              <Field label="Client last name" htmlFor="clientLast">
                <input id="clientLast" name="clientLast" className="input" value={job.clientLast} onChange={(e) => setJob({ ...job, clientLast: e.target.value })} />
              </Field>
              <Field label="Usual profit %" htmlFor="markupPct" hint="The estimate's default">
                <input id="markupPct" name="markupPct" type="number" step="0.01" className="input" value={job.markupPct} onChange={(e) => setJob({ ...job, markupPct: e.target.value })} />
              </Field>
              <Field label="Address" htmlFor="address" className="md:col-span-2">
                <input id="address" name="address" className="input" />
              </Field>
              <Field label="City" htmlFor="city">
                <input id="city" name="city" className="input" />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="State" htmlFor="state">
                  <input id="state" name="state" className="input" />
                </Field>
                <Field label="Zip" htmlFor="zip">
                  <input id="zip" name="zip" className="input" />
                </Field>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="3. Each category"
              description="CoConstruct's file has its change orders and the client's choices folded into the estimate. Say what each one is: part of the estimate, its own change order (approved), or left out (declined, or counted twice). Click a category to leave out single lines."
            />
            <div className="divide-y divide-slate-100">
              {divisions.map((d) => (
                <div key={d.name}>
                  <div className="bg-slate-50 px-5 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{d.name}</div>
                  {d.cats.map((c) => {
                    const p = plan.categories.find((x) => x.row === c.row)!;
                    return (
                      <div key={c.row} className={p.role === "SKIP" ? "bg-slate-50/60 opacity-70" : ""}>
                        <div className="grid grid-cols-1 items-center gap-2 px-5 py-2 text-sm md:grid-cols-[1fr_7rem_9rem_auto]">
                          <button type="button" className="min-w-0 text-left" onClick={() => setOpen(open === c.row ? null : c.row)}>
                            <span className="font-medium text-slate-900">{c.name}</span>
                            {c.isAllowance ? <span className="ml-1.5 rounded bg-amber-50 px-1 text-[11px] text-amber-800">Allowance</span> : null}
                            {c.choice ? <span className="block truncate text-xs text-slate-500">Choice: {c.choice}</span> : null}
                          </button>
                          <span className="text-right tabular-nums text-slate-700">{money(c.price)}</span>
                          <select className="input" value={p.role} onChange={(e) => set(c.row, { role: e.target.value as CcRole })} aria-label={`${c.name}: what it is`}>
                            <option value="ESTIMATE">Estimate</option>
                            <option value="CO">Change order</option>
                            <option value="SKIP">Leave out</option>
                          </select>
                          <div className="flex flex-wrap items-center gap-2">
                            {p.role === "ESTIMATE" ? (
                              <>
                                <label className="flex items-center gap-1 text-xs text-slate-600">
                                  <input type="checkbox" checked={p.selection} disabled={c.isAllowance} onChange={(e) => set(c.row, { selection: e.target.checked })} /> Selection
                                </label>
                                {p.selection && c.isAllowance && c.choice ? (
                                  <label className="flex items-center gap-1 text-xs text-slate-600">
                                    Allowance $
                                    <input
                                      type="number"
                                      step="0.01"
                                      className="input h-8 w-28"
                                      value={p.allowance ?? ""}
                                      onChange={(e) => set(c.row, { allowance: e.target.value === "" ? null : Number(e.target.value) })}
                                    />
                                  </label>
                                ) : null}
                                {p.selection && c.choice ? (
                                  <select className="input h-8 w-auto text-xs" value={p.status} onChange={(e) => set(c.row, { status: e.target.value as CcChoiceStatus })} aria-label={`${c.name}: choice`}>
                                    <option value="OPEN">Not chosen</option>
                                    <option value="CHOSEN">Chosen</option>
                                    <option value="FINAL">Final</option>
                                  </select>
                                ) : null}
                              </>
                            ) : p.role === "CO" ? (
                              <>
                                <input className="input h-8 w-48 text-xs" value={p.coTitle} onChange={(e) => set(c.row, { coTitle: e.target.value })} aria-label="Change order title" />
                                <input type="date" className="input h-8 w-36 text-xs" value={p.coDate} onChange={(e) => set(c.row, { coDate: e.target.value })} aria-label="Approved on" title="Approved on (blank = today)" />
                              </>
                            ) : null}
                          </div>
                        </div>
                        {open === c.row ? (
                          <ul className="space-y-1 px-5 pb-3 text-xs text-slate-600">
                            {c.items.map((i) => (
                              <li key={i.row} className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={!p.skip.includes(i.row)}
                                  onChange={(e) => set(c.row, { skip: e.target.checked ? p.skip.filter((r) => r !== i.row) : [...p.skip, i.row] })}
                                  aria-label={`Keep ${i.description}`}
                                />
                                <span className="min-w-0 flex-1 truncate">
                                  {i.description} <span className="text-slate-400">· {i.code ? `${i.code} ${i.codeName ?? ""}` : "no code"}</span>
                                </span>
                                <span className="tabular-nums">cost {money(i.cost)}</span>
                                <span className="w-24 text-right tabular-nums">{money(i.price)}</span>
                              </li>
                            ))}
                            {c.items.length === 0 ? <li className="text-slate-400">No lines</li> : null}
                          </ul>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <CardHeader title="4. Check it against CoConstruct" description="CoConstruct's file adds up to its estimate as it stands today. Here's what the job will be." />
            <div className="space-y-3 p-5 text-sm">
              <table className="w-full max-w-xl">
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-1.5 text-slate-600">CoConstruct&apos;s file, all of it</td>
                    <td className="text-right tabular-nums">{money(est.price)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-600">The estimate&apos;s lines brought in</td>
                    <td className="text-right tabular-nums">{money(totals.lines)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5">
                      <label className="flex items-center gap-2">
                        Price quoted (the base price)
                        <input
                          type="number"
                          step="0.01"
                          className="input h-8 w-36"
                          value={plan.basePrice ?? ""}
                          placeholder={String(totals.lines)}
                          onChange={(e) => setPlan({ ...plan, basePrice: e.target.value === "" ? null : Number(e.target.value) })}
                        />
                      </label>
                    </td>
                    <td className="text-right tabular-nums">{money(totals.basePrice)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-600">
                      {totals.changeOrders.length} change order{totals.changeOrders.length === 1 ? "" : "s"}
                      <span className="block text-xs text-slate-400">{totals.changeOrders.map((c) => `${c.title} ${money(c.amount)}`).join(" · ")}</span>
                    </td>
                    <td className="text-right tabular-nums">{money(totals.coTotal)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-600">
                      Final choices, over/under
                      <label className="mt-0.5 flex items-center gap-1.5 text-xs">
                        <input type="checkbox" name="finalApproved" checked={finalApproved} onChange={(e) => setFinalApproved(e.target.checked)} />
                        Approved now (off: a draft &quot;Selections&quot; change order for you to approve)
                      </label>
                    </td>
                    <td className={`text-right tabular-nums ${finalApproved ? "" : "text-slate-400"}`}>{money(totals.finalChoices)}</td>
                  </tr>
                  <tr className="font-semibold">
                    <td className="py-1.5">Contract</td>
                    <td className="text-right tabular-nums">{money(contract)}</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 text-slate-500">Chosen, not final — on a draft &quot;Selections&quot; change order, not in the contract</td>
                    <td className="text-right tabular-nums text-slate-500">{money(totals.chosenChoices)}</td>
                  </tr>
                </tbody>
              </table>
              <div className="flex items-center gap-3">
                <Button type="button" onClick={bringIn} disabled={pending}>
                  {pending ? "Bringing it in…" : "Bring it in"}
                </Button>
                <span className="text-xs text-slate-500">Nothing is emailed. Invoices and payments come later, from QuickBooks.</span>
              </div>
            </div>
          </Card>
        </>
      ) : null}
      <FormNote error={error} />
    </form>
  );
}

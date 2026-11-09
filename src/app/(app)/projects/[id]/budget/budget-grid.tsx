"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, Plus, Printer, X } from "lucide-react";
import Link from "@/components/link";
import { SubmitButton, buttonClasses } from "@/components/ui";
import { budgetTotals, projectedCost, projectedWhy } from "@/lib/budget-math";
import type { BudgetLine, BudgetSource } from "@/lib/job-budget";
import { cn, fmtDate, money } from "@/lib/utils";
import { NewPoForm } from "../purchasing/_components/new-po-form";
import { ExpenseFields } from "./expense-fields";

const NONE = "none";
type Key = "budget" | "committed" | "spent" | "projected" | "over" | "price" | "invoiced";
type Scope = { kind: "job" } | { kind: "div"; division: string } | { kind: "line"; key: string };
type Panel =
  | { kind: "num"; key: Key; scope: Scope }
  | { kind: "profit" }
  | { kind: "unpaid" }
  | { kind: "expense"; codeId: string | null }
  | { kind: "po"; codes: string[] }
  | { kind: "sort" };

const LABEL: Record<Key, string> = { budget: "Budget", committed: "Committed", spent: "Spent", projected: "Projected", over: "Over / under", price: "Price", invoiced: "Invoiced" };
const whole = (n: number) => Math.round(n).toLocaleString("en-US");
const signed = (n: number) => (Math.round(n) > 0 ? "+" : Math.round(n) < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("en-US");
const name = (l: BudgetLine) => (l.code ? `${l.code} ${l.name}` : l.name);

type Row = BudgetLine & { projected: number; over: number };

export function BudgetGrid({
  projectId,
  lines: initial,
  contract,
  coCount,
  estimateName,
  unpaid,
  canEdit,
  canBuy,
  poChoices,
  costCodes,
  addExpense,
  setDone,
}: {
  projectId: string;
  lines: BudgetLine[];
  contract: number;
  coCount: number;
  estimateName: string | null;
  unpaid: BudgetSource[];
  canEdit: boolean;
  canBuy: boolean;
  poChoices: { budget: { codeKey: string; label: string; cost: number; lines: number }[]; awards: { value: string; label: string; total: number }[]; vendors: string[] } | null;
  costCodes: { id: string; code: string | null; name: string }[];
  addExpense: (fd: FormData) => Promise<void>;
  setDone: (projectId: string, costCodeId: string, done: boolean) => Promise<void>;
}) {
  const base = `/projects/${projectId}`;
  const [done, setDoneState] = useState(() => new Map(initial.map((l) => [l.key, l.done])));
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<Panel | null>(null);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  const rows: Row[] = useMemo(
    () =>
      initial.map((l) => {
        const d = { ...l, done: done.get(l.key) ?? false };
        const projected = projectedCost(d);
        return { ...d, projected, over: projected - d.budget };
      }),
    [initial, done],
  );
  const unsorted = rows.find((r) => r.key === NONE);
  const sorted = rows.filter((r) => r.key !== NONE);
  const divisions = useMemo(() => {
    const out: { division: string; rows: Row[] }[] = [];
    for (const r of sorted) {
      const d = r.division || "Other";
      const g = out.find((x) => x.division === d);
      if (g) g.rows.push(r);
      else out.push({ division: d, rows: [r] });
    }
    return out;
  }, [sorted]);
  const T = budgetTotals(rows.map((r) => ({ ...r, unsorted: r.key === NONE })));
  const profit = contract - T.projected;
  const estProfit = contract - T.budget;
  const unpaidTotal = unpaid.reduce((n, s) => n + s.amount, 0);

  useEffect(() => {
    if (!panel && !menu) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPanel(null);
        setMenu(false);
      }
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [panel, menu]);

  function toggleDone(key: string, value: boolean) {
    setDoneState((m) => new Map(m).set(key, value));
    setError(null);
    start(async () => {
      try {
        await setDone(projectId, key, value);
      } catch (e) {
        setDoneState((m) => new Map(m).set(key, !value));
        setError(e instanceof Error ? e.message : "That didn't save. Try again.");
      }
    });
  }
  const togglePick = (key: string) =>
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  const linesIn = (scope: Scope) => (scope.kind === "job" ? rows : scope.kind === "div" ? sorted.filter((r) => (r.division || "Other") === scope.division) : rows.filter((r) => r.key === scope.key));
  const open = (key: Key, scope: Scope) => {
    setMenu(false);
    setPanel({ kind: "num", key, scope });
  };
  const isOpen = (key: Key, scope: Scope) =>
    panel?.kind === "num" &&
    panel.key === key &&
    panel.scope.kind === scope.kind &&
    (scope.kind !== "line" || (panel.scope.kind === "line" && panel.scope.key === scope.key)) &&
    (scope.kind !== "div" || (panel.scope.kind === "div" && panel.scope.division === scope.division));
  const lineOpen = panel?.kind === "num" && panel.scope.kind === "line" ? panel.scope.key : null;

  /** A number in the grid that opens what makes it up. */
  function num(value: number | null, k: Key, scope: Scope) {
    const blank = value == null || (Math.round(value) === 0 && k !== "projected");
    if (blank)
      return (
        <td key={k} className="px-3 py-1.5 text-right text-slate-300">
          —
        </td>
      );
    const over = k === "over";
    return (
      <td key={k} className={cn("px-3 py-1.5 text-right", isOpen(k, scope) && "bg-blue-100 outline outline-2 -outline-offset-2 outline-blue-600")}>
        <button
          type="button"
          onClick={() => open(k, scope)}
          className={cn(
            "tabular-nums underline decoration-slate-300 decoration-dotted underline-offset-[3px] hover:text-blue-700 hover:decoration-blue-600",
            over && (value! > 0 ? "text-rose-700" : "text-emerald-700"),
          )}
        >
          {over ? signed(value!) : whole(value!)}
        </button>
      </td>
    );
  }

  function cells(t: { budget: number; committed: number | null; spent: number; projected: number; over: number; price: number; invoiced: number }, scope: Scope) {
    return (
      <>
        {num(t.budget, "budget", scope)}
        {num(t.committed, "committed", scope)}
        {num(t.spent, "spent", scope)}
      </>
    );
  }
  function after(t: { projected: number; over: number; price: number; invoiced: number }, scope: Scope) {
    return (
      <>
        {num(t.projected, "projected", scope)}
        {num(t.over, "over", scope)}
        {num(t.price, "price", scope)}
        {num(t.invoiced, "invoiced", scope)}
      </>
    );
  }
  const totalsOf = (rs: Row[]) => {
    const t = budgetTotals(rs.map((r) => ({ ...r, unsorted: r.key === NONE })));
    return { ...t, committed: rs.some((r) => r.committed != null) ? t.committed : null, over: t.projected - t.budget };
  };

  const strip = [
    { label: "Budget", value: money(T.budget, true), click: () => open("budget", { kind: "job" }) },
    { label: "Spent", value: money(T.spent, true), click: () => open("spent", { kind: "job" }) },
    {
      label: "Projected cost",
      value: money(T.projected, true),
      extra: Math.round(T.projected - T.budget) ? <span className={cn("text-xs font-semibold", T.projected > T.budget ? "text-rose-700" : "text-emerald-700")}>{signed(T.projected - T.budget)}</span> : null,
      click: () => open("projected", { kind: "job" }),
    },
    { label: "Invoiced", value: money(T.invoiced, true), extra: <span className="text-xs font-normal text-slate-500">of {whole(contract)}</span>, click: () => open("invoiced", { kind: "job" }) },
    {
      label: "Projected profit",
      value: money(profit, true),
      extra: contract > 0 ? <span className="text-xs font-normal text-slate-500">{((profit / contract) * 100).toFixed(1)}%</span> : null,
      tone: profit < 0 ? "text-rose-700" : "",
      click: () => setPanel({ kind: "profit" }),
    },
    {
      label: "Unpaid bills",
      value: money(unpaidTotal, true),
      extra: <span className="text-xs font-normal text-slate-500">{unpaid.length} open</span>,
      tone: unpaidTotal > 0 ? "text-amber-700" : "",
      click: () => setPanel({ kind: "unpaid" }),
    },
  ];

  const newItems: { label: string; href?: string; onClick?: () => void; show: boolean }[] = [
    { label: "Bill", href: `${base}/purchasing/bills/new${lineOpen && lineOpen !== NONE ? `?codes=${lineOpen}` : ""}`, show: canBuy },
    { label: "Expense / receipt", onClick: () => setPanel({ kind: "expense", codeId: lineOpen && lineOpen !== NONE ? lineOpen : null }), show: canEdit },
    { label: "Purchase order", onClick: () => setPanel({ kind: "po", codes: lineOpen && lineOpen !== NONE ? [lineOpen] : [] }), show: canBuy && !!poChoices },
    { label: "Change order", href: `${base}/change-orders/new`, show: true },
    { label: "Invoice", href: `${base}/invoices/new`, show: true },
    { label: "Bid request", href: `${base}/bids`, show: true },
  ];

  return (
    <div className="print:text-xs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          {contract > 0 ? <>Contract {money(contract, true)}</> : "No contract price yet"}
          {coCount ? ` · includes ${coCount} change order${coCount === 1 ? "" : "s"}` : ""}
          {estimateName ? ` · budget from ${estimateName}` : " · no approved estimate yet, so the budget is change orders only"}
        </p>
        <div className="relative flex items-center gap-1.5 print:hidden">
          <button type="button" onClick={() => window.print()} className={buttonClasses("secondary", "xs")}>
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button type="button" onClick={() => setMenu((m) => !m)} className={buttonClasses("primary", "xs")} aria-expanded={menu}>
            <Plus className="h-3.5 w-3.5" /> New <ChevronDown className="h-3.5 w-3.5" />
          </button>
          {menu ? (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} aria-hidden />
              <div className="absolute right-0 top-8 z-40 w-56 rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg">
                <p className="px-3 pb-1 pt-1.5 text-[11px] uppercase tracking-wide text-slate-400">For this job{lineOpen && lineOpen !== NONE ? ` · ${name(rows.find((r) => r.key === lineOpen)!)}` : ""}</p>
                {newItems
                  .filter((i) => i.show)
                  .map((i) =>
                    i.href ? (
                      <Link key={i.label} href={i.href} className="block px-3 py-1.5 text-slate-800 hover:bg-slate-100">
                        {i.label}
                      </Link>
                    ) : (
                      <button
                        key={i.label}
                        type="button"
                        onClick={() => {
                          setMenu(false);
                          i.onClick!();
                        }}
                        className="block w-full px-3 py-1.5 text-left text-slate-800 hover:bg-slate-100"
                      >
                        {i.label}
                      </button>
                    ),
                  )}
              </div>
            </>
          ) : null}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-3 lg:grid-cols-6">
        {strip.map((s) => (
          <button key={s.label} type="button" onClick={s.click} className="border-b border-r border-slate-200 px-4 py-2.5 text-left hover:bg-slate-50 lg:border-b-0">
            <span className="block text-[11px] uppercase tracking-wide text-slate-500">{s.label}</span>
            <span className={cn("flex flex-wrap items-baseline gap-1.5 text-lg font-semibold tabular-nums text-slate-900", s.tone)}>
              <span className="underline decoration-slate-300 decoration-dotted underline-offset-4">{s.value}</span>
              {s.extra}
            </span>
          </button>
        ))}
      </div>

      {error ? <p className="mb-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {picked.size ? (
          <div className="flex flex-wrap items-center gap-2 bg-slate-900 px-3 py-2 text-xs text-white print:hidden">
            <span>
              {picked.size} line{picked.size === 1 ? "" : "s"} picked
            </span>
            <span className="flex-1" />
            {canBuy ? (
              <Link href={`${base}/purchasing/bills/new?codes=${[...picked].join(",")}`} className={buttonClasses("secondary", "xs")}>
                Create bill
              </Link>
            ) : null}
            {canBuy && poChoices ? (
              <button type="button" onClick={() => setPanel({ kind: "po", codes: [...picked] })} className={buttonClasses("secondary", "xs")}>
                Create purchase order
              </button>
            ) : null}
            <Link href={`${base}/bids`} className={buttonClasses("secondary", "xs")}>
              Send for bids
            </Link>
            <button type="button" onClick={() => setPicked(new Set())} className="px-2 text-slate-300 hover:text-white">
              Clear
            </button>
          </div>
        ) : null}
        {rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Nothing here yet. Approve an estimate, or add a bill or expense, and it fills in.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm tabular-nums">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="w-9 px-2 py-2 print:hidden">
                    <input
                      type="checkbox"
                      aria-label="Pick every line"
                      checked={picked.size > 0 && picked.size === sorted.length}
                      onChange={(e) => setPicked(e.target.checked ? new Set(sorted.map((r) => r.key)) : new Set())}
                      className="h-3.5 w-3.5 rounded border-slate-300"
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-semibold">Cost code</th>
                  {(["Budget", "Committed", "Spent"] as const).map((h) => (
                    <th key={h} className="px-3 py-2 text-right font-semibold">
                      {h}
                    </th>
                  ))}
                  <th className="w-14 px-2 py-2 text-center font-semibold" title="Checked: no more spending expected, so projected is what's spent. Never locks: later bills still land here.">
                    Done
                  </th>
                  {(["Projected", "Over / under", "Price", "Invoiced"] as const).map((h) => (
                    <th key={h} className="px-3 py-2 text-right font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {divisions.map((g) => {
                  const t = totalsOf(g.rows);
                  const scope: Scope = { kind: "div", division: g.division };
                  const isFolded = folded.has(g.division);
                  const fold = () =>
                    setFolded((s) => {
                      const n = new Set(s);
                      if (n.has(g.division)) n.delete(g.division);
                      else n.add(g.division);
                      return n;
                    });
                  return (
                    <DivisionRows key={g.division}>
                      <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-800">
                        <td className="px-2 py-1.5 text-center text-slate-400 print:hidden">
                          <button type="button" onClick={fold} aria-label={isFolded ? "Open" : "Fold"}>
                            {isFolded ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="cursor-pointer px-3 py-1.5" onClick={fold}>
                          {g.division}
                        </td>
                        {cells(t, scope)}
                        <td className="px-2 py-1.5 text-center text-xs font-normal text-slate-500">
                          {t.done}/{t.lines}
                        </td>
                        {after(t, scope)}
                      </tr>
                      {isFolded
                        ? null
                        : g.rows.map((r) => lineRow(r))}
                    </DivisionRows>
                  );
                })}
                {unsorted ? lineRow(unsorted) : null}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-bold text-slate-900">
                  <td className="print:hidden" />
                  <td className="px-3 py-2">Total</td>
                  {cells({ ...T, committed: rows.some((r) => r.committed != null) ? T.committed : null, over: T.projected - T.budget }, { kind: "job" })}
                  <td className="px-2 py-2 text-center text-xs font-normal text-slate-500">
                    {T.done}/{T.lines}
                  </td>
                  {after({ ...T, over: T.projected - T.budget }, { kind: "job" })}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {panel ? (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/20 print:hidden" onClick={() => setPanel(null)} aria-hidden />
          <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl print:hidden" aria-label="Details">
            {panelBody()}
          </aside>
        </>
      ) : null}
    </div>
  );

  function lineRow(r: Row) {
    const scope: Scope = { kind: "line", key: r.key };
    const none = r.key === NONE;
    return (
      <tr key={r.key} className={cn("border-b border-slate-100 hover:bg-slate-50/60", picked.has(r.key) && "bg-blue-50", lineOpen === r.key && "bg-blue-50/60")}>
        <td className="px-2 py-1.5 text-center print:hidden">
          {none ? null : <input type="checkbox" aria-label={`Pick ${name(r)}`} checked={picked.has(r.key)} onChange={() => togglePick(r.key)} className="h-3.5 w-3.5 rounded border-slate-300" />}
        </td>
        <td className="max-w-[22rem] truncate px-3 py-1.5 text-left">
          {none ? (
            <>
              <span className="text-amber-700">Not sorted</span>
              <span className="ml-2 text-xs text-slate-500">
                no cost code ·{" "}
                <button type="button" onClick={() => setPanel({ kind: "sort" })} className="text-blue-700 hover:underline">
                  Sort…
                </button>
              </span>
            </>
          ) : (
            <>
              <span className="text-slate-900">{name(r)}</span>
              {r.commitNote ? <span className="ml-2 text-xs text-slate-500">{r.commitNote}</span> : null}
            </>
          )}
        </td>
        {cells(r, scope)}
        <td className="px-2 py-1.5 text-center">
          {none ? null : (
            <input
              type="checkbox"
              aria-label={`Done: ${name(r)}`}
              title="Done: no more spending expected, so projected is what's spent. Never locks: later bills still land here."
              checked={r.done}
              disabled={!canEdit}
              onChange={(e) => toggleDone(r.key, e.target.checked)}
              className="h-3.5 w-3.5 rounded border-slate-300"
            />
          )}
        </td>
        {after(r, scope)}
      </tr>
    );
  }

  function panelBody() {
    const p = panel!;
    const close = (
      <button type="button" onClick={() => setPanel(null)} className={buttonClasses("ghost", "xs")} aria-label="Close">
        <X className="h-4 w-4" />
      </button>
    );
    const head = (over: string, title: string, note?: string) => (
      <div className="border-b border-slate-200 px-5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-slate-500">{over}</p>
            <p className="text-base font-semibold text-slate-900">{title}</p>
          </div>
          {close}
        </div>
        {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
      </div>
    );

    if (p.kind === "expense")
      return (
        <>
          {head("For this job", "Add expense", "A receipt or cost with no bill. It shows on the Budget right away.")}
          <form action={addExpense} className="flex min-h-0 flex-1 flex-col">
            <input type="hidden" name="projectId" value={projectId} />
            <div className="flex-1 overflow-y-auto px-5 py-4 [&_.grid]:!grid-cols-2 [&_.grid>*]:!col-span-2 [&_.grid>*:nth-child(-n+2)]:!col-span-1">
              <ExpenseFields costCodes={costCodes} idPrefix="panel-expense" expense={p.codeId ? { date: new Date(), vendor: "", costCodeId: p.codeId, category: "MATERIAL", amount: 0, description: null, reference: null, status: "UNPAID" } : undefined} />
            </div>
            <div className="flex justify-between gap-2 border-t border-slate-200 px-5 py-3">
              <button type="button" onClick={() => setPanel(null)} className={buttonClasses("secondary", "sm")}>
                Cancel
              </button>
              <SubmitButton size="sm">Add expense</SubmitButton>
            </div>
          </form>
        </>
      );
    if (p.kind === "po")
      return (
        <>
          {head("For this job", "New purchase order", p.codes.length ? "Started from the lines you picked. Change anything." : undefined)}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <NewPoForm projectId={projectId} vendors={poChoices!.vendors} budget={poChoices!.budget} awards={poChoices!.awards} picked={p.codes} />
          </div>
        </>
      );
    if (p.kind === "sort")
      return (
        <>
          {head("Not sorted", "No cost code", "Open each one and give it a cost code; it moves to that line.")}
          <div className="flex-1 overflow-y-auto">
            {unsorted?.src.spent.length ? (
              <>
                <p className="px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Spent</p>
                <Sources items={unsorted.src.spent} />
              </>
            ) : null}
            {unsorted?.src.budget.length ? (
              <>
                <p className="px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">On the estimate</p>
                <Sources items={unsorted.src.budget} limit={30} />
              </>
            ) : null}
            {unsorted?.src.invoiced.length ? (
              <>
                <p className="px-5 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Invoiced</p>
                <Sources items={unsorted.src.invoiced} />
              </>
            ) : null}
          </div>
        </>
      );
    if (p.kind === "unpaid")
      return (
        <>
          {head("Whole job", `Unpaid bills ${money(unpaidTotal, true)}`, "Open one to pay it or mark it paid.")}
          <div className="flex-1 overflow-y-auto">
            <Sources items={unpaid} />
          </div>
        </>
      );
    if (p.kind === "profit")
      return (
        <>
          {head("Whole job", `Projected profit ${money(profit, true)}`)}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm tabular-nums">
              <tbody>
                <PRow label="Contract price" value={whole(contract)} />
                <PRow label={go("projected", { kind: "job" }, "Projected cost")} value={`−${whole(T.projected)}`} />
                <PRow label="Projected profit" value={whole(profit)} strong />
                <PRow label={<span className="text-slate-500">Estimated profit was</span>} value={<span className="text-slate-500">{whole(estProfit)}</span>} />
                <PRow
                  label={<span className="text-slate-500">Difference</span>}
                  value={<span className={profit - estProfit < 0 ? "text-rose-700" : "text-emerald-700"}>{signed(profit - estProfit)}</span>}
                />
              </tbody>
            </table>
          </div>
        </>
      );

    const ls = linesIn(p.scope);
    const where = p.scope.kind === "job" ? "Whole job" : p.scope.kind === "div" ? p.scope.division : name(ls[0]);
    const t = totalsOf(ls);
    const value = p.key === "over" ? signed(t.over) : money(p.key === "committed" ? (t.committed ?? 0) : t[p.key], true);

    if (p.scope.kind !== "line") {
      const shown = ls.filter((l) => {
        const v = p.key === "projected" ? l.projected : p.key === "over" ? l.over : p.key === "committed" ? l.committed : l[p.key];
        return v != null && Math.round(v) !== 0;
      });
      return (
        <>
          {head(where, `${LABEL[p.key]} ${value}`, "By cost code. Click one to see what makes it up.")}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm tabular-nums">
              <tbody>
                {shown.map((l) => {
                  const v = p.key === "projected" ? l.projected : p.key === "over" ? l.over : p.key === "committed" ? l.committed! : l[p.key];
                  return (
                    <tr key={l.key} className="border-b border-slate-100">
                      <td className="px-5 py-2">
                        <button type="button" onClick={() => open(p.key, { kind: "line", key: l.key })} className={cn("text-left hover:underline", l.key === NONE ? "text-amber-700" : "text-blue-700")}>
                          {name(l)}
                        </button>
                      </td>
                      <td className={cn("px-5 py-2 text-right", p.key === "over" && (v > 0 ? "text-rose-700" : "text-emerald-700"))}>{p.key === "over" ? signed(v) : whole(v)}</td>
                    </tr>
                  );
                })}
                {shown.length === 0 ? (
                  <tr>
                    <td className="px-5 py-6 text-center text-slate-500">Nothing yet.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      );
    }

    const l = ls[0];
    const codeId = l.key === NONE ? null : l.key;
    if (p.key === "projected" || p.key === "over")
      return (
        <>
          {head(where, `${LABEL[p.key]} ${value}`)}
          <div className="flex-1 overflow-y-auto">
            <p className="mx-5 mt-4 rounded-md bg-slate-100 px-3 py-2.5 text-sm text-slate-700">{projectedWhy({ ...l, unsorted: l.key === NONE }, (n) => money(n, true))}</p>
            <table className="mt-3 w-full text-sm tabular-nums">
              <tbody>
                <PRow label="Budget" value={l.budget ? go("budget", { kind: "line", key: l.key }, whole(l.budget)) : "—"} />
                <PRow label="Committed" value={l.committed != null ? go("committed", { kind: "line", key: l.key }, whole(l.committed)) : "—"} />
                <PRow label="Spent" value={l.spent ? go("spent", { kind: "line", key: l.key }, whole(l.spent)) : "—"} />
                <PRow label="Projected" value={whole(l.projected)} strong />
                <PRow label="Over / under budget" value={<span className={l.over > 0 ? "text-rose-700" : l.over < 0 ? "text-emerald-700" : ""}>{signed(l.over)}</span>} />
              </tbody>
            </table>
          </div>
        </>
      );
    const notes: Record<string, string> = {
      budget: "Where this number came from: the estimate's lines and change orders, at cost.",
      committed: "What you've agreed to pay: a bid you took, or a PO you sent.",
      spent: "Every bill, receipt, crew week and inventory pull on this cost code. Click one to open it.",
      price: "What the client pays for this cost code.",
      invoiced: "Invoices that billed this cost code.",
    };
    const items = l.src[p.key as "budget" | "committed" | "spent" | "price" | "invoiced"];
    return (
      <>
        {head(where, `${LABEL[p.key]} ${value}`, notes[p.key])}
        <div className="flex-1 overflow-y-auto">
          <Sources items={items} total={p.key === "budget" || p.key === "spent" || items.length > 1 ? l[p.key as "budget"] ?? 0 : undefined} limit={p.key === "budget" ? 30 : undefined} />
        </div>
        {p.key === "spent" && (canEdit || canBuy) ? (
          <div className="flex justify-between gap-2 border-t border-slate-200 px-5 py-3">
            {canEdit ? (
              <button type="button" onClick={() => setPanel({ kind: "expense", codeId })} className={buttonClasses("secondary", "sm")}>
                <Plus className="h-3.5 w-3.5" /> Add expense here
              </button>
            ) : (
              <span />
            )}
            {canBuy && codeId ? (
              <Link href={`${base}/purchasing/bills/new?codes=${codeId}`} className={buttonClasses("secondary", "sm")}>
                <Plus className="h-3.5 w-3.5" /> Add bill here
              </Link>
            ) : null}
          </div>
        ) : null}
      </>
    );
  }

  function go(k: Key, scope: Scope, text: string) {
    return (
      <button type="button" onClick={() => open(k, scope)} className="text-blue-700 hover:underline">
        {text}
      </button>
    );
  }
}

function DivisionRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function PRow({ label, value, strong }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean }) {
  return (
    <tr className={cn("border-b border-slate-100", strong && "font-semibold")}>
      <td className="px-5 py-2">{label}</td>
      <td className="px-5 py-2 text-right">{value}</td>
    </tr>
  );
}

/** The list behind a number: each one opens the thing itself. */
function Sources({ items, total, limit }: { items: BudgetSource[]; total?: number; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  if (!items.length) return <p className="px-5 py-6 text-center text-sm text-slate-500">Nothing yet.</p>;
  return (
    <table className="w-full text-sm tabular-nums">
      <tbody>
        {shown.map((s, i) => (
          <tr key={i} className="border-b border-slate-100 align-top">
            {s.date ? <td className="whitespace-nowrap py-2 pl-5 text-xs text-slate-500">{fmtDate(s.date, "M/d/yy")}</td> : null}
            <td className={cn("py-2", s.date ? "px-3" : "pl-5 pr-3")} colSpan={s.date ? 1 : 2}>
              {s.href ? (
                <Link href={s.href} className="text-blue-700 hover:underline">
                  {s.label}
                </Link>
              ) : (
                s.label
              )}
              {s.note ? <span className={cn("block text-xs", /Unpaid/.test(s.note) ? "text-amber-700" : "text-slate-500")}>{s.note}</span> : null}
            </td>
            <td className={cn("py-2 pr-5 text-right", s.amount < 0 && "text-emerald-700")}>{s.amount < 0 ? `−${whole(-s.amount)}` : whole(s.amount)}</td>
          </tr>
        ))}
        {limit && items.length > limit ? (
          <tr className="border-b border-slate-100">
            <td colSpan={3} className="px-5 py-2 text-xs text-slate-500">
              and {items.length - limit} more lines on the estimate
            </td>
          </tr>
        ) : null}
        {total != null ? (
          <tr className="font-semibold">
            <td colSpan={2} className="px-5 py-2">
              Total
            </td>
            <td className="py-2 pr-5 text-right">{whole(total)}</td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

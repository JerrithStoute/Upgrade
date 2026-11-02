"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { CheckCircle2, ChevronRight, X } from "lucide-react";
import { cn, costCodeLabel, fmtDate, money, num } from "@/lib/utils";
import { LINE_PROFIT_MODES, changeOrderTotals, type CoDefaults } from "@/lib/change-orders";
import type { UnaddedChoice } from "@/lib/change-orders-server";
import { buttonClasses } from "@/components/ui";
import { FilesBox, type CardFile } from "@/components/selections/extras";
import {
  addChangeOrderFiles,
  addChoicesToChangeOrder,
  removeChangeOrderFile,
  removeChangeOrderLine,
  setChangeOrderLineCode,
  setChangeOrderLineProfit,
  setChangeOrderLineTax,
  saveChangeOrder,
  saveChangeOrderLine,
  saveCoDefault,
  teamApproveChangeOrder,
} from "../actions";

type Result = { ok: true } | { ok: false; error: string };
type Co = {
  id: string;
  number: number;
  status: string;
  title: string;
  description: string;
  introText: string;
  closingText: string;
  terms: string;
  profitMode: string;
  profitValue: number;
  profitLabel: string;
  profitShown: string;
  taxPct: number;
  taxLabel: string;
  taxShown: string;
  scheduleImpactDays: number;
  priorCompletion: string;
  newCompletion: string;
  approverIds: string[];
  approvals: Record<string, string>;
  clientApproval: boolean;
  clientApprovedAt: Date | null;
  ifDeclined: string;
  showItems: boolean;
  showPrices: boolean;
};
type Item = {
  id: string;
  kind: string;
  category: string | null;
  description: string;
  choiceName: string | null;
  clientPrice: number | null;
  allowance: number | null;
  quantity: number;
  unitCost: number;
  markupPct: number;
  costCodeId: string | null;
  profitMode: string;
  profitValue: number;
  taxed: boolean;
};
type Code = { id: string; code: string | null; name: string };

/**
 * One change order: the line items and what the client reads on the left; the contract,
 * pricing, schedule and approvals as small cards on the right. Lines open to change with a
 * click; empty texts are one "+ Add" line until you open them.
 */
export function ChangeOrderEditor({
  projectId,
  me,
  co,
  items,
  open,
  team,
  clientName,
  effect,
  files,
  defaults,
  costCodes,
}: {
  projectId: string;
  me: string;
  co: Co;
  items: Item[];
  open: UnaddedChoice[];
  team: { id: string; name: string }[];
  clientName: string | null;
  effect: { basePrice: number; previous: number; thisOne: number; total: number };
  files: CardFile[];
  defaults: CoDefaults;
  costCodes: Code[];
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState<"LINE" | "CHARGE" | null>(null);
  // The line opened to change.
  const [editing, setEditing] = useState<string | null>(null);
  const draft = co.status === "DRAFT";
  const run = (fn: () => Promise<Result>, after?: () => void) =>
    start(async () => {
      setErr(null);
      const r = await fn();
      if (!r.ok) setErr(r.error);
      else {
        after?.();
        router.refresh();
      }
    });
  const save = (patch: Partial<Co> & Record<string, unknown>) => run(() => saveChangeOrder(projectId, co.id, patch));

  const totals = changeOrderTotals(co, items);
  const taxOn = co.taxPct > 0;
  const selections = items.filter((i) => i.kind !== "CHARGE");
  // No client choices on it: the Choice and Allowance columns would only ever be empty — leave them out.
  const ch = items.some((i) => i.kind === "SELECTION");
  const charges = items.filter((i) => i.kind === "CHARGE");
  // The Profit column only when there's profit or tax to show.
  const showProfit = co.profitMode !== "NONE" || taxOn || items.some((i) => (i.profitMode || "CO") !== "CO");
  const cols = 4 + (ch ? 2 : 0) + (showProfit ? 1 : 0);
  const codeName = (id: string | null) => {
    const c = id ? costCodes.find((x) => x.id === id) : null;
    return c ? costCodeLabel(c) : null;
  };
  const profitText = (i: Item) => {
    const mode = i.profitMode || "CO";
    return `${mode === "CO" ? "Change order's" : mode === "NONE" ? "None" : mode === "PCT" ? `${num(i.profitValue, 2)}%` : `+${money(i.profitValue)}`}${taxOn && i.taxed ? " · tax" : ""}`;
  };

  const row = (i: Item) => {
    const open = editing === i.id;
    const charge = i.kind === "CHARGE";
    return [
      <tr
        key={i.id}
        className={cn("cursor-pointer hover:bg-slate-50", charge && "bg-slate-50/40", open && "bg-blue-50/50")}
        onClick={() => {
          setAdding(null);
          setEditing(open ? null : i.id);
        }}
        title={draft ? "Click to change it" : "Click to change its cost code"}
      >
        <td className="px-3 py-1.5 text-slate-900">
          {charge ? <span className="text-slate-500">Extra charge — </span> : null}
          {i.description}
        </td>
        {ch ? <td className="px-3 py-1.5 text-slate-700">{i.kind === "SELECTION" ? i.choiceName : "—"}</td> : null}
        <td className="px-3 py-1.5 text-slate-500">{codeName(i.costCodeId) ?? <span className="text-amber-700">No cost code</span>}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{money(charge ? i.unitCost : (i.clientPrice ?? i.quantity * i.unitCost * (1 + i.markupPct / 100)))}</td>
        {ch ? <td className="px-3 py-1.5 text-right tabular-nums text-slate-600">{i.allowance !== null ? money(i.allowance) : ""}</td> : null}
        <td className="px-3 py-1.5 text-right font-medium tabular-nums">{money(totals.shown(i))}</td>
        {showProfit ? <td className="px-3 py-1.5 text-slate-500">{profitText(i)}</td> : null}
        <td className="w-6 pr-2 text-slate-400">
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
        </td>
      </tr>,
      open ? (
        <tr key={`${i.id}-edit`} className="bg-blue-50/50">
          <td colSpan={cols + 1} className="px-3 pb-3">
            <LineEditor
              item={i}
              co={co}
              codes={costCodes}
              draft={draft}
              taxOn={taxOn}
              busy={busy}
              onCancel={() => setEditing(null)}
              onRemove={() => run(() => removeChangeOrderLine(projectId, co.id, i.id), () => setEditing(null))}
              onSave={(v) =>
                run(
                  async () => {
                    // Only what changed, one after another.
                    if (draft && (i.kind === "LINE" || charge) && (v.description !== i.description || v.amount !== (charge ? i.unitCost : (i.clientPrice ?? i.unitCost)) || v.costCodeId !== i.costCodeId)) {
                      const r = await saveChangeOrderLine(projectId, co.id, { kind: charge ? "CHARGE" : "LINE", description: v.description, amount: v.amount, costCodeId: v.costCodeId, id: i.id });
                      if (!r.ok) return r;
                    } else if (v.costCodeId !== i.costCodeId) {
                      const r = await setChangeOrderLineCode(projectId, co.id, i.id, v.costCodeId);
                      if (!r.ok) return r;
                    }
                    if (draft && (v.profitMode !== (i.profitMode || "CO") || v.profitValue !== i.profitValue)) {
                      const r = await setChangeOrderLineProfit(projectId, co.id, i.id, v.profitMode, v.profitValue);
                      if (!r.ok) return r;
                    }
                    if (draft && taxOn && v.taxed !== i.taxed) return setChangeOrderLineTax(projectId, co.id, i.id, v.taxed);
                    return { ok: true };
                  },
                  () => setEditing(null),
                )
              }
            />
          </td>
        </tr>
      ) : null,
    ];
  };

  return (
    <div className="space-y-3">
      {err ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p> : null}

      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          {draft ? (
            <Card title="Details">
              <Row label="Title">
                <TextBox value={co.title} onSave={(v) => save({ title: v })} />
              </Row>
              <Row label="Description" hint="For you — the client doesn't see it">
                <TextBox value={co.description} onSave={(v) => save({ description: v })} placeholder="What it's about, for your team" />
              </Row>
            </Card>
          ) : null}

          <Card
            title={`Line items${items.length ? ` · ${items.length}` : ""}`}
            right={
              draft ? (
                <span className="flex gap-3">
                  <button type="button" className="text-xs text-blue-700 hover:underline disabled:text-slate-400" disabled={adding !== null} onClick={() => (setEditing(null), setAdding("LINE"))}>
                    + New item
                  </button>
                  <button
                    type="button"
                    className="text-xs text-blue-700 hover:underline disabled:text-slate-400"
                    disabled={adding !== null}
                    title="e.g. a change order fee"
                    onClick={() => (setEditing(null), setAdding("CHARGE"))}
                  >
                    + Extra charge
                  </button>
                </span>
              ) : null
            }
          >
            {draft && open.length ? (
              <p className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-amber-50/60 px-3 py-1.5 text-xs text-amber-900">
                {open.length === 1 ? "A client choice isn't" : `${open.length} client choices aren't`} on a change order yet.
                <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setPicking(true)}>
                  Add them…
                </button>
              </p>
            ) : null}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-xs">
                <thead className="border-b border-slate-100 text-slate-500">
                  <tr>
                    <th className="px-3 py-1.5 font-normal">{ch ? "Selection / item" : "Item"}</th>
                    {ch ? <th className="px-3 py-1.5 font-normal">Choice</th> : null}
                    <th className="px-3 py-1.5 font-normal" title="Yours — the budget uses it; the client never sees it">
                      Cost code
                    </th>
                    <th className="px-3 py-1.5 text-right font-normal">{ch ? "Client price" : "Amount"}</th>
                    {ch ? <th className="px-3 py-1.5 text-right font-normal">Allowance</th> : null}
                    <th className="px-3 py-1.5 text-right font-normal">{ch ? "Difference" : "Price"}</th>
                    {showProfit ? (
                      <th className="px-3 py-1.5 font-normal" title="This line's own profit — or the change order's">
                        {taxOn ? "Profit · tax" : "Profit"}
                      </th>
                    ) : null}
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 && !adding ? (
                    <tr>
                      <td colSpan={cols + 1} className="px-3 py-3 text-center text-slate-500">
                        Nothing on it yet{draft ? " — add a new item or client choices." : "."}
                      </td>
                    </tr>
                  ) : null}
                  {selections.flatMap(row)}
                  {adding === "LINE" ? (
                    <NewLine kind="LINE" cols={cols + 1} codes={costCodes} busy={busy} onCancel={() => setAdding(null)} onSave={(v) => run(() => saveChangeOrderLine(projectId, co.id, { ...v, id: null }), () => setAdding(null))} />
                  ) : null}
                  {charges.flatMap(row)}
                  {adding === "CHARGE" ? (
                    <NewLine kind="CHARGE" cols={cols + 1} codes={costCodes} busy={busy} onCancel={() => setAdding(null)} onSave={(v) => run(() => saveChangeOrderLine(projectId, co.id, { ...v, id: null }), () => setAdding(null))} />
                  ) : null}
                </tbody>
                <tfoot className="border-t border-slate-200">
                  {totals.profitLine || totals.tax ? <SumRow span={cols - (showProfit ? 2 : 1)} label="Subtotal" value={totals.shownSubtotal} /> : null}
                  {totals.profitLine ? <SumRow span={cols - (showProfit ? 2 : 1)} label={`${co.profitLabel}${totals.feePct !== null ? ` (${num(totals.feePct, 2)}%)` : ""}`} value={totals.profit} /> : null}
                  {totals.tax ? <SumRow span={cols - (showProfit ? 2 : 1)} label={`${co.taxLabel} (${num(co.taxPct, 3)}%)`} value={totals.tax} /> : null}
                  <SumRow span={cols - (showProfit ? 2 : 1)} label="Total" value={totals.total} strong />
                </tfoot>
              </table>
            </div>
          </Card>

          <Card title="For the client" note="Printed above and below the lines">
            <TextRow
              label="Intro"
              add="+ Add intro text"
              value={co.introText}
              long
              draft={draft}
              onSave={(v) => save({ introText: v })}
              isDefault={(defaults.introText ?? "") === co.introText && !!co.introText}
              onDefault={() => run(() => saveCoDefault("introText", co.introText))}
            />
            <TextRow
              label="Closing"
              add="+ Add closing text"
              value={co.closingText}
              long
              draft={draft}
              onSave={(v) => save({ closingText: v })}
              isDefault={(defaults.closingText ?? "") === co.closingText && !!co.closingText}
              onDefault={() => run(() => saveCoDefault("closingText", co.closingText))}
            />
            <TextRow
              label="Terms"
              add="+ Add terms"
              value={co.terms}
              draft={draft}
              placeholder="e.g. Payment due on approval"
              onSave={(v) => save({ terms: v })}
              isDefault={(defaults.terms ?? "") === co.terms && !!co.terms}
              onDefault={() => run(() => saveCoDefault("terms", co.terms))}
            />
            <Row label="Files" hint="The client sees them">
              <FilesBox files={files} onAdd={(fd) => addChangeOrderFiles(projectId, co.id, fd)} onRemove={(fid) => removeChangeOrderFile(projectId, fid)} canRemove={() => true} markUp />
            </Row>
          </Card>
        </div>

        <div className="space-y-3">
          <Card title="Contract">
            <Row label="Base price">
              <Money value={effect.basePrice} />
            </Row>
            <Row label="Earlier COs" hint="Approved change orders before this one">
              <Money value={effect.previous} />
            </Row>
            <Row label="This CO">
              <Money value={effect.thisOne} sign />
            </Row>
            <Row label="New total" strong>
              <Money value={effect.total} />
            </Row>
          </Card>

          <Card
            title="Pricing"
            right={
              <Link href={`/projects/${projectId}/change-orders/${co.id}/print`} className="text-xs text-blue-700 hover:underline" title="How the items, profit and tax show the client — on the Print / PDF page">
                What the client sees →
              </Link>
            }
          >
            <Row label="Profit" hint="The % is for lines set to “Change order's”; a $ amount is added once. Any line can have its own.">
              <div className="space-y-1.5">
                <Seg
                  value={co.profitMode}
                  disabled={!draft}
                  options={[
                    ["NONE", "None"],
                    ["PCT", "Markup %"],
                    ["AMOUNT", "Profit $"],
                  ]}
                  onChange={(v) => save({ profitMode: v })}
                />
                {co.profitMode !== "NONE" ? (
                  <>
                    <NumInput value={co.profitValue} disabled={!draft} label={co.profitMode === "PCT" ? "%" : "$"} onSave={(v) => save({ profitValue: v })} />
                    <DefaultBox
                      checked={defaults.profitMode === co.profitMode && defaults.profitValue === co.profitValue}
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await saveCoDefault("profitMode", co.profitMode);
                          return saveCoDefault("profitValue", co.profitValue);
                        })
                      }
                    />
                  </>
                ) : null}
              </div>
            </Row>
            <Row
              label="Sales tax"
              hint={taxOn ? "Sales tax you pay, on the lines ticked Tax (your items start ticked; extra charges don't) — part of their price, so profit is figured on it too." : "Sales tax you pay"}
            >
              <NumInput value={co.taxPct} disabled={!draft} label="%" onSave={(v) => save({ taxPct: v })} />
            </Row>
          </Card>

          <ScheduleCard co={co} draft={draft} save={save} />

          <ApprovalsCard
            co={co}
            draft={draft}
            busy={busy}
            me={me}
            team={team}
            clientName={clientName}
            save={save}
            isDefault={(defaults.ifDeclined ?? "KEEP") === co.ifDeclined}
            onDefault={() => run(() => saveCoDefault("ifDeclined", co.ifDeclined))}
            onApprove={() => run(() => teamApproveChangeOrder(projectId, co.id))}
          />
        </div>
      </div>

      {picking ? (
        <PickChoices
          open={open}
          busy={busy}
          onCancel={() => setPicking(false)}
          onAdd={(ids) =>
            run(
              () => addChoicesToChangeOrder(projectId, co.id, ids),
              () => setPicking(false),
            )
          }
        />
      ) : null}
    </div>
  );
}

/** A card: a small title (and gray note), something on the right, then its rows. */
function Card({ title, note, right, children }: { title: string; note?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-100 px-3 py-2">
        <h2 className="text-xs font-semibold text-slate-900">{title}</h2>
        {note ? <span className="text-xs text-slate-500">{note}</span> : null}
        {right ? <span className="ml-auto">{right}</span> : null}
      </header>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

/** A label / value row; `hint` shows when you hold the mouse over the label. */
function Row({ label, hint, strong, children }: { label: string; hint?: string; strong?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("grid grid-cols-[6.5rem_minmax(0,1fr)] items-start gap-2 px-3 py-1.5 text-xs", strong && "font-semibold")}>
      <span className={cn("pt-1", strong ? "text-slate-900" : "text-slate-500")} title={hint}>
        {label}
      </span>
      <div className="min-w-0 pt-0.5">{children}</div>
    </div>
  );
}

function Money({ value, sign }: { value: number; sign?: boolean }) {
  return (
    <span className="block pt-0.5 text-right tabular-nums">
      {sign && value > 0.004 ? "+" : ""}
      {money(value)}
    </span>
  );
}

function SumRow({ label, value, strong, span }: { label: string; value: number; strong?: boolean; span: number }) {
  return (
    <tr className={cn(strong && "font-semibold text-slate-900")}>
      <td colSpan={span} className="px-3 py-1.5 text-right">
        {label}
      </td>
      <td className="px-3 py-1.5 text-right tabular-nums">{money(value)}</td>
      <td colSpan={2} />
    </tr>
  );
}

/** A one-line box that saves when you leave it. */
function TextBox({ value, onSave, disabled, placeholder, label }: { value: string; onSave: (v: string) => void; disabled?: boolean; placeholder?: string; label?: string }) {
  return (
    <input
      key={value}
      aria-label={label}
      title={label}
      className="input !h-7 !px-2 !py-0 !text-xs"
      defaultValue={value}
      placeholder={placeholder ?? label}
      disabled={disabled}
      onBlur={(e) => e.target.value.trim() !== value && onSave(e.target.value)}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

/**
 * Intro, closing text and terms: the text (or "+ Add …" while empty); click to change it,
 * with "Use as default" while it's open. Saves when you leave the box.
 */
function TextRow({
  label,
  add,
  value,
  long,
  draft,
  placeholder,
  onSave,
  isDefault,
  onDefault,
}: {
  label: string;
  add: string;
  value: string;
  long?: boolean;
  draft: boolean;
  placeholder?: string;
  onSave: (v: string) => void;
  isDefault: boolean;
  onDefault: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (!open || !draft)
    return (
      <Row label={label}>
        {value ? (
          <button
            type="button"
            disabled={!draft}
            onClick={() => setOpen(true)}
            className="block w-full whitespace-pre-line text-left text-slate-700 enabled:hover:text-slate-900 [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3] overflow-hidden"
            title={draft ? "Click to change it" : undefined}
          >
            {value}
          </button>
        ) : draft ? (
          <button type="button" className="pt-0.5 text-blue-700 hover:underline" onClick={() => setOpen(true)}>
            {add}
          </button>
        ) : (
          <span className="text-slate-400">None</span>
        )}
      </Row>
    );
  return (
    <Row label={label}>
      <div className="space-y-1">
        {long ? (
          <textarea
            key={value}
            autoFocus
            className="input !px-2 !py-1 !text-xs"
            rows={3}
            defaultValue={value}
            placeholder={placeholder}
            onBlur={(e) => e.target.value.trim() !== value && onSave(e.target.value)}
          />
        ) : (
          <input
            key={value}
            autoFocus
            className="input !h-7 !px-2 !py-0 !text-xs"
            defaultValue={value}
            placeholder={placeholder}
            onBlur={(e) => e.target.value.trim() !== value && onSave(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
          />
        )}
        <div className="flex items-center gap-3">
          <DefaultBox checked={isDefault} disabled={!value} onClick={onDefault} />
          <button type="button" className="ml-auto text-blue-700 hover:underline" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      </div>
    </Row>
  );
}

function DefaultBox({ checked, disabled, onClick }: { checked: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <label className={cn("inline-flex items-center gap-1.5 text-xs text-slate-600", disabled && "opacity-50")} title="Start every new change order with this">
      <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={checked} disabled={disabled || checked} onChange={onClick} />
      Use as default
    </label>
  );
}

function NumInput({ value, disabled, label, onSave }: { value: number; disabled?: boolean; label: string; onSave: (v: number) => void }) {
  return (
    <span className="inline-flex items-center gap-1">
      <input
        key={value}
        className="input !h-7 !w-20 !px-2 !py-0 text-right !text-xs"
        inputMode="decimal"
        defaultValue={value || ""}
        placeholder="0"
        disabled={disabled}
        onBlur={(e) => {
          const n = Number(e.target.value.replace(/[$,%\s]/g, "") || 0);
          if (Number.isFinite(n) && n !== value) onSave(n);
        }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      <span className="text-xs text-slate-500">{label}</span>
    </span>
  );
}

function DateInput({ label, value, disabled, onSave }: { label: string; value: string; disabled?: boolean; onSave: (v: string) => void }) {
  return (
    <input
      key={value}
      type="date"
      aria-label={label}
      title={label}
      className="input !h-7 !w-36 !px-2 !py-0 !text-xs"
      defaultValue={value}
      disabled={disabled}
      onChange={(e) => e.target.value !== value && onSave(e.target.value)}
    />
  );
}

function Seg({ value, options, disabled, onChange }: { value: string; options: ([string, string] | [string, string, string])[]; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <span className="inline-flex rounded-md border border-slate-300 p-0.5">
      {options.map(([v, l, hint]) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          title={hint}
          onClick={() => v !== value && onChange(v)}
          className={cn("rounded px-2 py-0.5 text-xs font-medium", value === v ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100 disabled:hover:bg-transparent")}
        >
          {l}
        </button>
      ))}
    </span>
  );
}

/** How many days it adds and the completion dates; Edit opens them (draft only). */
function ScheduleCard({ co, draft, save }: { co: Co; draft: boolean; save: (patch: Partial<Co>) => void }) {
  const [open, setOpen] = useState(false);
  const date = (d: string) => (d ? fmtDate(new Date(`${d}T12:00:00`)) : "—");
  return (
    <Card
      title="Schedule"
      right={
        draft ? (
          <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => setOpen((o) => !o)}>
            {open ? "Done" : "Edit"}
          </button>
        ) : null
      }
    >
      <Row label="Adds" hint="Effect on the completion date">
        {open ? <NumInput value={co.scheduleImpactDays} label="days" onSave={(v) => save({ scheduleImpactDays: Math.round(v) })} /> : <span className="block pt-0.5">{co.scheduleImpactDays ? `${co.scheduleImpactDays} day${co.scheduleImpactDays === 1 ? "" : "s"}` : "No days"}</span>}
      </Row>
      <Row label="Completion" hint="Projected completion before → after this change order">
        {open ? (
          <span className="flex flex-wrap items-center gap-1">
            <DateInput label="Prior projected completion" value={co.priorCompletion} onSave={(v) => save({ priorCompletion: v })} />
            →
            <DateInput label="New projected completion" value={co.newCompletion} onSave={(v) => save({ newCompletion: v })} />
          </span>
        ) : (
          <span className="block pt-0.5 text-slate-700">
            {date(co.priorCompletion)} → {date(co.newCompletion)}
          </span>
        )}
      </Row>
    </Card>
  );
}

/** Who approves it — the client in the portal, and any of the team — and what happens if it's declined. */
function ApprovalsCard({
  co,
  draft,
  busy,
  me,
  team,
  clientName,
  save,
  isDefault,
  onDefault,
  onApprove,
}: {
  co: Co;
  draft: boolean;
  busy: boolean;
  me: string;
  team: { id: string; name: string }[];
  clientName: string | null;
  save: (patch: Partial<Co>) => void;
  isDefault: boolean;
  onDefault: () => void;
  onApprove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const approvers = team.filter((t) => co.approverIds.includes(t.id));
  return (
    <Card
      title="Approvals"
      right={
        draft ? (
          <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => setOpen((o) => !o)}>
            {open ? "Done" : "Edit"}
          </button>
        ) : null
      }
    >
      <Row label="Client" hint="Signs in the client portal">
        {open ? (
          <label className="flex items-center gap-1.5 pt-0.5">
            <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={co.clientApproval} disabled={busy} onChange={(e) => save({ clientApproval: e.target.checked })} />
            {clientName ?? "The client"} signs in the portal
          </label>
        ) : (
          <span className="block pt-0.5">
            {co.clientApproval ? (clientName ?? "The client") : <span className="text-slate-400">Not asked</span>}
            {co.clientApproval && co.clientApprovedAt ? <span className="text-emerald-700"> · approved {fmtDate(co.clientApprovedAt)}</span> : null}
          </span>
        )}
      </Row>
      <Row label="Team">
        {open ? (
          <span className="flex flex-col gap-1 pt-0.5">
            {team.map((t) => (
              <label key={t.id} className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={co.approverIds.includes(t.id)}
                  disabled={busy}
                  onChange={(e) => save({ approverIds: e.target.checked ? [...co.approverIds, t.id] : co.approverIds.filter((x) => x !== t.id) })}
                />
                {t.name}
              </label>
            ))}
          </span>
        ) : approvers.length ? (
          <span className="flex flex-col gap-1 pt-0.5">
            {approvers.map((t) => {
              const at = co.approvals[t.id];
              return (
                <span key={t.id} className="flex items-center gap-1.5">
                  {t.name}
                  {at ? (
                    <span className="inline-flex items-center gap-0.5 text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" /> {fmtDate(at)}
                    </span>
                  ) : co.status === "PENDING_APPROVAL" && t.id === me ? (
                    <button type="button" className={buttonClasses("primary", "xs")} disabled={busy} onClick={onApprove}>
                      Approve
                    </button>
                  ) : (
                    <span className="text-slate-400">waiting</span>
                  )}
                </span>
              );
            })}
          </span>
        ) : (
          <span className="block pt-0.5 text-slate-400">No one</span>
        )}
      </Row>
      <Row label="If declined" hint="What happens to the client choices on it">
        {open ? (
          <div className="space-y-1 pt-0.5">
            <select className="input !h-7 !px-2 !py-0 !text-xs" value={co.ifDeclined} disabled={busy} onChange={(e) => save({ ifDeclined: e.target.value })}>
              <option value="KEEP">Take the selections off, keep the choices made</option>
              <option value="CLEAR">Take the selections off, clear the choices made</option>
            </select>
            <DefaultBox checked={isDefault} disabled={busy} onClick={onDefault} />
          </div>
        ) : (
          <span className="block pt-0.5 text-slate-700">{co.ifDeclined === "CLEAR" ? "Clear the choices made" : "Keep the choices made"}</span>
        )}
      </Row>
    </Card>
  );
}

/** A cost code box (yours — the budget uses it). */
function CodeSelect({ codes, value, disabled, onChange }: { codes: Code[]; value: string | null; disabled?: boolean; onChange: (id: string | null) => void }) {
  return (
    <select
      className={cn("input !h-7 !w-auto min-w-40 !px-2 !py-0 !text-xs", !value && "text-slate-400")}
      value={value ?? ""}
      disabled={disabled}
      aria-label="Cost code"
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">No cost code</option>
      {codes.map((c) => (
        <option key={c.id} value={c.id}>
          {costCodeLabel(c)}
        </option>
      ))}
    </select>
  );
}

type LineValues = { description: string; amount: number; costCodeId: string | null; profitMode: string; profitValue: number; taxed: boolean };

/**
 * A line opened to change: your own items and extra charges — what and how much; any line —
 * its cost code, its own profit and tax (those only while it's a draft). Remove… asks first.
 */
function LineEditor({
  item,
  co,
  codes,
  draft,
  taxOn,
  busy,
  onSave,
  onCancel,
  onRemove,
}: {
  item: Item;
  co: Co;
  codes: Code[];
  draft: boolean;
  taxOn: boolean;
  busy: boolean;
  onSave: (v: LineValues) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const charge = item.kind === "CHARGE";
  const own = draft && (item.kind === "LINE" || charge);
  const [d, setD] = useState(item.description);
  const [a, setA] = useState(String(charge ? item.unitCost : (item.clientPrice ?? item.unitCost)));
  const [code, setCode] = useState<string | null>(item.costCodeId);
  const [mode, setMode] = useState(item.profitMode || "CO");
  const [pv, setPv] = useState(String(item.profitValue));
  const [taxed, setTaxed] = useState(item.taxed);
  const n = Number(a.replace(/[$,\s]/g, "") || 0);
  const p = Number(pv.replace(/[$,%\s]/g, "") || 0);
  return (
    <div className="space-y-1.5 rounded-md border border-slate-200 bg-white p-2 text-xs" onClick={(e) => e.stopPropagation()}>
      {own ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <input className="input !h-7 min-w-48 flex-1 !px-2 !py-0 !text-xs" autoFocus aria-label="What" value={d} onChange={(e) => setD(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} />
          <span className="text-slate-500">$</span>
          <input className="input !h-7 !w-24 !px-2 !py-0 text-right !text-xs" inputMode="decimal" aria-label="Amount" value={a} onChange={(e) => setA(e.target.value)} />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
        <CodeSelect codes={codes} value={code} onChange={setCode} />
        {draft ? (
          <>
            <span>· profit</span>
            <select className="input !h-7 !w-auto !px-2 !py-0 !text-xs" aria-label="Profit" value={mode} onChange={(e) => {
              const m = e.target.value;
              setMode(m);
              // Switching to % starts at the change order's %, so there's a number to adjust.
              if (m === "PCT" && mode !== "PCT") setPv(String(co.profitMode === "PCT" ? co.profitValue : 0));
              if (m === "AMOUNT" && mode !== "AMOUNT") setPv("0");
            }}>
              {LINE_PROFIT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.value === "CO" ? `Change order's${co.profitMode === "PCT" ? ` (${num(co.profitValue, 2)}%)` : ""}` : m.label}
                </option>
              ))}
            </select>
            {mode === "PCT" || mode === "AMOUNT" ? (
              <input className="input !h-7 !w-16 !px-2 !py-0 text-right !text-xs" inputMode="decimal" aria-label={mode === "PCT" ? "Markup %" : "Profit $"} value={pv} onChange={(e) => setPv(e.target.value)} />
            ) : null}
            {taxOn ? (
              <label className="flex items-center gap-1 text-slate-700" title="You pay sales tax on it — part of its price, profit figured on it too">
                <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={taxed} onChange={(e) => setTaxed(e.target.checked)} />
                Tax
              </label>
            ) : null}
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-2 pt-0.5">
        {draft ? (
          <button type="button" className="text-rose-600 hover:underline" disabled={busy} onClick={() => window.confirm(`Remove "${item.description}"?`) && onRemove()}>
            Remove…
          </button>
        ) : null}
        <span className="flex-1" />
        <button type="button" className={buttonClasses("secondary", "xs")} onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className={buttonClasses("primary", "xs")}
          disabled={busy || (own && (!d.trim() || !Number.isFinite(n))) || !Number.isFinite(p)}
          onClick={() => onSave({ description: d.trim(), amount: n, costCodeId: code, profitMode: mode, profitValue: mode === "PCT" || mode === "AMOUNT" ? p : 0, taxed })}
        >
          Save
        </button>
      </div>
    </div>
  );
}

/** A new item or extra charge: what, how much, its cost code. */
function NewLine({
  kind,
  cols,
  codes,
  busy,
  onSave,
  onCancel,
}: {
  kind: "LINE" | "CHARGE";
  cols: number;
  codes: Code[];
  busy: boolean;
  onSave: (v: { kind: "LINE" | "CHARGE"; description: string; amount: number; costCodeId: string | null }) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState("");
  const [a, setA] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const n = Number(a.replace(/[$,\s]/g, "") || 0);
  const ok = !busy && !!d.trim() && Number.isFinite(n);
  return (
    <tr className="bg-blue-50/50">
      <td colSpan={cols} className="px-3 py-2">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <input
            className="input !h-7 min-w-48 flex-1 !px-2 !py-0 !text-xs"
            autoFocus
            aria-label={kind === "CHARGE" ? "Extra charge" : "New item"}
            placeholder={kind === "CHARGE" ? "Extra charge, e.g. Change order fee" : "What's being added or changed"}
            value={d}
            onChange={(e) => setD(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
              if (e.key === "Enter" && ok) onSave({ kind, description: d.trim(), amount: n, costCodeId: code });
            }}
          />
          <span className="text-slate-500">$</span>
          <input className="input !h-7 !w-24 !px-2 !py-0 text-right !text-xs" inputMode="decimal" aria-label="Amount" placeholder="0.00" value={a} onChange={(e) => setA(e.target.value)} />
          <CodeSelect codes={codes} value={code} onChange={setCode} />
          <button type="button" className={buttonClasses("secondary", "xs")} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={buttonClasses("primary", "xs")} disabled={!ok} onClick={() => onSave({ kind, description: d.trim(), amount: n, costCodeId: code })}>
            Add
          </button>
        </div>
      </td>
    </tr>
  );
}


/** "Select items": the client choices not on a change order yet. */
function PickChoices({ open, busy, onAdd, onCancel }: { open: UnaddedChoice[]; busy: boolean; onAdd: (ids: string[]) => void; onCancel: () => void }) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const all = open.map((c) => c.selectionId);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" role="dialog" aria-modal="true" aria-label="Select items">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Select items</h2>
            <p className="text-xs text-slate-500">Client choices that can be added to this change order.</p>
          </div>
          <button type="button" onClick={onCancel} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-10 px-3 py-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    aria-label="Pick all"
                    checked={picked.size === all.length && all.length > 0}
                    onChange={(e) => setPicked(e.target.checked ? new Set(all) : new Set())}
                  />
                </th>
                <th className="px-3 py-2 font-medium">Selection</th>
                <th className="px-3 py-2 font-medium">Choice</th>
                <th className="px-3 py-2 text-right font-medium">Client price</th>
                <th className="px-3 py-2 text-right font-medium">Allowance</th>
                <th className="px-3 py-2 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {open.map((c) => (
                <tr key={c.selectionId} className="hover:bg-slate-50">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      aria-label={`Pick ${c.title}`}
                      checked={picked.has(c.selectionId)}
                      onChange={(e) =>
                        setPicked((p) => {
                          const n = new Set(p);
                          if (e.target.checked) n.add(c.selectionId);
                          else n.delete(c.selectionId);
                          return n;
                        })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    <span className="block font-medium text-slate-900">{c.title}</span>
                    <span className="text-xs text-slate-500">{c.category}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-700">{c.choiceName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(c.clientPrice)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600">{money(c.allowance)}</td>
                  <td className={cn("px-3 py-2 text-right font-medium tabular-nums", c.difference > 0 ? "text-rose-700" : c.difference < 0 ? "text-emerald-700" : "")}>
                    {money(c.difference)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button type="button" className={buttonClasses("ghost", "xs")} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={buttonClasses("primary", "xs")} disabled={busy || !picked.size} onClick={() => onAdd(Array.from(picked))}>
            Add selected
          </button>
        </footer>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Pencil, Plus, Trash2, X } from "lucide-react";
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
  // The item or extra charge being changed (draft only).
  const [editing, setEditing] = useState<string | null>(null);
  const editForm = (i: Item, kind: "LINE" | "CHARGE") => (
    <LineForm
      key={i.id}
      kind={kind}
      choices={ch}
      codes={costCodes}
      busy={busy}
      initial={{ description: i.description, amount: kind === "LINE" ? (i.clientPrice ?? i.unitCost) : i.unitCost, costCodeId: i.costCodeId }}
      onCancel={() => setEditing(null)}
      onSave={(v) =>
        run(
          () => saveChangeOrderLine(projectId, co.id, { ...v, id: i.id }),
          () => setEditing(null),
        )
      }
    />
  );
  const editButton = (i: Item) => (
    <button
      type="button"
      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      aria-label={`Edit ${i.description}`}
      title="Edit"
      disabled={editing !== null || adding !== null}
      onClick={() => setEditing(i.id)}
    >
      <Pencil className="h-3.5 w-3.5" />
    </button>
  );
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
  // Taxed or not, beside the line's profit (only when the change order has tax).
  const taxTick = (i: Item) =>
    taxOn ? (
      <label
        className="flex cursor-pointer items-center gap-1 whitespace-nowrap text-[11px] text-slate-600"
        title="You pay sales tax on it — part of its price, profit figured on it too"
      >
        <input
          type="checkbox"
          className="h-3.5 w-3.5 rounded border-slate-300"
          checked={i.taxed}
          disabled={!draft || busy}
          onChange={(e) => run(() => setChangeOrderLineTax(projectId, co.id, i.id, e.target.checked))}
        />
        Tax
      </label>
    ) : null;
  const selections = items.filter((i) => i.kind !== "CHARGE");
  // No client choices on it: the Choice and Allowance columns would only ever be empty — leave them out.
  const ch = items.some((i) => i.kind === "SELECTION");
  const charges = items.filter((i) => i.kind === "CHARGE");

  return (
    <div className="space-y-5">
      {err ? <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{err}</p> : null}

      <Section title="Details">
        <div className="grid gap-3 md:grid-cols-2">
          <Text label="Title" value={co.title} disabled={!draft} onSave={(v) => save({ title: v })} />
          <Text label="Description (for you)" value={co.description} disabled={!draft} onSave={(v) => save({ description: v })} />
        </div>
        <LongText
          label="Intro text"
          value={co.introText}
          disabled={!draft}
          onSave={(v) => save({ introText: v })}
          isDefault={(defaults.introText ?? "") === co.introText && !!co.introText}
          onDefault={() => run(() => saveCoDefault("introText", co.introText))}
        />
      </Section>

      <Section title="Line items">
        {draft && open.length ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-blue-700 px-4 py-3 text-sm text-white">
            <span>
              There {open.length === 1 ? "is a client choice" : `are ${open.length} client choices`} that {open.length === 1 ? "hasn't" : "haven't"} been added to a change order
              yet.
            </span>
            <button type="button" className="rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50" onClick={() => setPicking(true)}>
              Add items
            </button>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium" title="Yours — the budget uses it; the client never sees it">
                  Cost code
                </th>
                <th className="px-3 py-2 font-medium">{ch ? "Selection / item" : "Item"}</th>
                {ch ? <th className="px-3 py-2 font-medium">Choice</th> : null}
                <th className="px-3 py-2 text-right font-medium">{ch ? "Client price" : "Amount"}</th>
                {ch ? <th className="px-3 py-2 text-right font-medium">Allowance</th> : null}
                <th className="px-3 py-2 text-right font-medium">{ch ? "Difference" : "Price"}</th>
                <th className="px-3 py-2 font-medium" title="This line's own profit — or the change order's">
                  {taxOn ? "Profit · tax" : "Profit"}
                </th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {selections.length === 0 ? (
                <tr>
                  <td colSpan={ch ? 8 : 6} className="px-3 py-4 text-center text-slate-500">
                    Nothing on this change order yet{draft ? " — add client choices or a new item." : "."}
                  </td>
                </tr>
              ) : null}
              {selections.map((i) =>
                editing === i.id && i.kind === "LINE" ? (
                  editForm(i, "LINE")
                ) : (
                  <tr key={i.id}>
                    <td className="px-2 py-1.5">
                      <CodeSelect codes={costCodes} value={i.costCodeId} disabled={busy} onChange={(v) => run(() => setChangeOrderLineCode(projectId, co.id, i.id, v))} />
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-900">{i.description}</td>
                    {ch ? <td className="px-3 py-2 text-slate-700">{i.kind === "SELECTION" ? i.choiceName : "—"}</td> : null}
                    <td className="px-3 py-2 text-right tabular-nums">{money(i.clientPrice ?? i.quantity * i.unitCost * (1 + i.markupPct / 100))}</td>
                    {ch ? <td className="px-3 py-2 text-right tabular-nums text-slate-600">{i.allowance !== null ? money(i.allowance) : ""}</td> : null}
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{money(totals.shown(i))}</td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-2">
                        <ProfitCell item={i} co={co} disabled={!draft || busy} onSave={(m, v) => run(() => setChangeOrderLineProfit(projectId, co.id, i.id, m, v))} />
                        {taxTick(i)}
                      </span>
                    </td>
                    <td className="px-1">
                      {draft ? (
                        <span className="inline-flex">
                          {i.kind === "LINE" ? editButton(i) : null}
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                            aria-label={`Remove ${i.description}`}
                            onClick={() => run(() => removeChangeOrderLine(projectId, co.id, i.id))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ),
              )}
              {adding === "LINE" ? (
                <LineForm
                  kind="LINE"
                  choices={ch}
                  codes={costCodes}
                  busy={busy}
                  onCancel={() => setAdding(null)}
                  onSave={(v) =>
                    run(
                      () => saveChangeOrderLine(projectId, co.id, { ...v, id: null }),
                      () => setAdding(null),
                    )
                  }
                />
              ) : null}
              {charges.map((i) =>
                editing === i.id ? (
                  editForm(i, "CHARGE")
                ) : (
                  <tr key={i.id} className="bg-slate-50/40">
                    <td className="px-2 py-1.5">
                      <CodeSelect codes={costCodes} value={i.costCodeId} disabled={busy} onChange={(v) => run(() => setChangeOrderLineCode(projectId, co.id, i.id, v))} />
                    </td>
                    {ch ? (
                      <>
                        <td className="px-3 py-2 text-slate-600">Extra charge</td>
                        <td className="px-3 py-2 text-slate-700">{i.description}</td>
                      </>
                    ) : (
                      <td className="px-3 py-2 text-slate-700">
                        <span className="text-slate-500">Extra charge — </span>
                        {i.description}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right tabular-nums">{money(i.unitCost)}</td>
                    {ch ? <td /> : null}
                    <td className="px-3 py-2 text-right font-medium tabular-nums">{money(totals.shown(i))}</td>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-2">
                        <ProfitCell item={i} co={co} disabled={!draft || busy} onSave={(m, v) => run(() => setChangeOrderLineProfit(projectId, co.id, i.id, m, v))} />
                        {taxTick(i)}
                      </span>
                    </td>
                    <td className="px-1">
                      {draft ? (
                        <span className="inline-flex">
                          {editButton(i)}
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                            aria-label={`Remove ${i.description}`}
                            onClick={() => run(() => removeChangeOrderLine(projectId, co.id, i.id))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ),
              )}
              {adding === "CHARGE" ? (
                <LineForm
                  kind="CHARGE"
                  choices={ch}
                  codes={costCodes}
                  busy={busy}
                  onCancel={() => setAdding(null)}
                  onSave={(v) =>
                    run(
                      () => saveChangeOrderLine(projectId, co.id, { ...v, id: null }),
                      () => setAdding(null),
                    )
                  }
                />
              ) : null}
            </tbody>
            <tfoot className="border-t border-slate-200 text-sm">
              <SumRow choices={ch} label="Subtotal" value={totals.shownSubtotal} strong />
              {totals.profitLine ? <SumRow choices={ch} label={`${co.profitLabel}${totals.feePct !== null ? ` (${num(totals.feePct, 2)}%)` : ""}`} value={totals.profit} /> : null}
              {totals.tax ? <SumRow choices={ch} label={`${co.taxLabel} (${num(co.taxPct, 3)}%)`} value={totals.tax} /> : null}
              <SumRow choices={ch} label="Total" value={totals.total} strong big />
            </tfoot>
          </table>
        </div>
        {draft ? (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => setAdding("LINE")} disabled={adding !== null}>
              <Plus className="h-3.5 w-3.5" /> New item
            </button>
            <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => setAdding("CHARGE")} disabled={adding !== null}>
              <Plus className="h-3.5 w-3.5" /> Extra charge (e.g. change order fee)
            </button>
          </div>
        ) : null}
      </Section>

      <Section title="What the client sees">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Seg
            value={!co.showItems ? "TOTAL" : co.showPrices ? "ITEMS" : "NOPRICES"}
            disabled={!draft}
            options={[
              ["ITEMS", "Itemized with prices"],
              ["NOPRICES", "Items, no prices"],
              ["TOTAL", "Total only"],
            ]}
            onChange={(v) => save({ showItems: v !== "TOTAL", showPrices: v === "ITEMS" })}
          />
          <span className="text-xs text-slate-500">
            {!co.showItems
              ? "The client sees the title, your intro text and the total — not the items."
              : co.showPrices
                ? "The client sees every item and its price (never your cost codes)."
                : "The client sees every item listed, but only the total — no line prices."}
          </span>
        </div>
      </Section>

      <Section
        title="Profit & tax"
        note="Your call on each change order — the % is for lines set to “Change order's”; a $ amount is added once. Any line can have its own in its Profit column."
      >
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Seg
            value={co.profitMode}
            disabled={!draft}
            options={[
              ["NONE", "No profit"],
              ["PCT", "Profit %"],
              ["AMOUNT", "Profit $"],
            ]}
            onChange={(v) => save({ profitMode: v })}
          />
          {co.profitMode !== "NONE" ? (
            <>
              <NumInput value={co.profitValue} disabled={!draft} label={co.profitMode === "PCT" ? "%" : "$"} onSave={(v) => save({ profitValue: v })} />
              <Seg
                value={co.profitShown}
                disabled={!draft}
                options={[
                  ["LINE", "Its own line"],
                  ["FOLDED", "Folded into the prices"],
                ]}
                onChange={(v) => save({ profitShown: v })}
              />
              {co.profitShown === "LINE" ? <Text inline label="Line name" value={co.profitLabel} disabled={!draft} onSave={(v) => save({ profitLabel: v })} /> : null}
              <DefaultBox
                checked={defaults.profitMode === co.profitMode && defaults.profitValue === co.profitValue && (defaults.profitShown ?? "LINE") === co.profitShown}
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await saveCoDefault("profitMode", co.profitMode);
                    await saveCoDefault("profitShown", co.profitShown);
                    return saveCoDefault("profitValue", co.profitValue);
                  })
                }
              />
            </>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-slate-600">Sales tax you pay</span>
          <NumInput value={co.taxPct} disabled={!draft} label="%" onSave={(v) => save({ taxPct: v })} />
          {co.taxPct ? (
            <>
              <Seg
                value={co.taxShown}
                disabled={!draft}
                options={[
                  ["LINE", "Its own line"],
                  ["FOLDED", "Built into the prices"],
                ]}
                onChange={(v) => save({ taxShown: v })}
              />
              {co.taxShown === "LINE" ? <Text inline label="Line name" value={co.taxLabel} disabled={!draft} onSave={(v) => save({ taxLabel: v })} /> : null}
            </>
          ) : null}
        </div>
        {co.taxPct ? (
          <p className="text-xs text-slate-500">
            On the lines ticked Tax (your items start ticked; extra charges don&apos;t), it&apos;s part of their price — profit is figured on it too, like the estimate.
          </p>
        ) : null}
      </Section>

      <Section title="Effect on contract">
        <dl className="grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm">
          <dt className="text-slate-600">Base price</dt>
          <dd className="text-right tabular-nums">{money(effect.basePrice)}</dd>
          <dt className="text-slate-600">Total from previously approved change orders</dt>
          <dd className="text-right tabular-nums">{money(effect.previous)}</dd>
          <dt className="text-slate-600">Total from this change order</dt>
          <dd className="text-right tabular-nums">{money(effect.thisOne)}</dd>
          <dt className="border-t border-slate-200 pt-1.5 font-semibold">Total price</dt>
          <dd className="border-t border-slate-200 pt-1.5 text-right font-semibold tabular-nums">{money(effect.total)}</dd>
        </dl>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Text label="Terms" value={co.terms} disabled={!draft} onSave={(v) => save({ terms: v })} placeholder="e.g. Payment due on approval" />
            <DefaultBox checked={(defaults.terms ?? "") === co.terms && !!co.terms} disabled={busy || !co.terms} onClick={() => run(() => saveCoDefault("terms", co.terms))} />
          </div>
          <label className="block text-sm">
            <span className="label">Effect on completion date (days)</span>
            <NumInput value={co.scheduleImpactDays} disabled={!draft} label="days" onSave={(v) => save({ scheduleImpactDays: Math.round(v) })} />
          </label>
          <DateInput label="Prior projected completion date" value={co.priorCompletion} disabled={!draft} onSave={(v) => save({ priorCompletion: v })} />
          <DateInput label="New projected completion date" value={co.newCompletion} disabled={!draft} onSave={(v) => save({ newCompletion: v })} />
        </div>
      </Section>

      <Section title="Files" note="Attached for approval — the client sees them.">
        <FilesBox files={files} onAdd={(fd) => addChangeOrderFiles(projectId, co.id, fd)} onRemove={(fid) => removeChangeOrderFile(projectId, fid)} canRemove={() => true} />
      </Section>

      <Section title="Closing text">
        <LongText
          label="Closing text"
          value={co.closingText}
          disabled={!draft}
          onSave={(v) => save({ closingText: v })}
          isDefault={(defaults.closingText ?? "") === co.closingText && !!co.closingText}
          onDefault={() => run(() => saveCoDefault("closingText", co.closingText))}
        />
      </Section>

      <Section title="Approvals" note="Who needs to approve this change order.">
        <div className="space-y-2 text-sm">
          <p className="font-medium text-slate-800">Team members</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {team.map((t) => {
              const on = co.approverIds.includes(t.id);
              const at = co.approvals[t.id];
              return (
                <label key={t.id} className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300"
                    checked={on}
                    disabled={!draft || busy}
                    onChange={(e) => save({ approverIds: e.target.checked ? [...co.approverIds, t.id] : co.approverIds.filter((x) => x !== t.id) })}
                  />
                  {t.name}
                  {on && at ? <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-label={`Approved ${fmtDate(at)}`} /> : null}
                  {on && !at && co.status === "PENDING_APPROVAL" && t.id === me ? (
                    <button type="button" className={buttonClasses("primary", "sm")} disabled={busy} onClick={() => run(() => teamApproveChangeOrder(projectId, co.id))}>
                      Approve
                    </button>
                  ) : null}
                </label>
              );
            })}
          </div>
          <p className="pt-2 font-medium text-slate-800">Client</p>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300"
              checked={co.clientApproval}
              disabled={!draft || busy}
              onChange={(e) => save({ clientApproval: e.target.checked })}
            />
            {clientName ?? "The client"} (signs in the portal)
            {co.clientApproval && co.clientApprovedAt ? <span className="text-xs text-emerald-700">approved {fmtDate(co.clientApprovedAt)}</span> : null}
          </label>
          <p className="pt-2 font-medium text-slate-800">If declined</p>
          <label className="flex items-center gap-1.5">
            <input type="radio" name="ifDeclined" className="h-4 w-4" checked={co.ifDeclined === "KEEP"} disabled={!draft || busy} onChange={() => save({ ifDeclined: "KEEP" })} />
            Take the selections off this change order, but keep the choices made
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              name="ifDeclined"
              className="h-4 w-4"
              checked={co.ifDeclined === "CLEAR"}
              disabled={!draft || busy}
              onChange={() => save({ ifDeclined: "CLEAR" })}
            />
            Take the selections off this change order and clear the choices made
          </label>
          <DefaultBox checked={(defaults.ifDeclined ?? "KEEP") === co.ifDeclined} disabled={busy} onClick={() => run(() => saveCoDefault("ifDeclined", co.ifDeclined))} />
        </div>
      </Section>

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

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        {note ? <p className="text-xs text-slate-500">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SumRow({ label, value, strong, big, choices }: { label: string; value: number; strong?: boolean; big?: boolean; choices: boolean }) {
  return (
    <tr className={cn(strong && "font-semibold", big && "border-t border-slate-300 text-base")}>
      <td colSpan={choices ? 5 : 3} className="px-3 py-2 text-right">
        {label}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{money(value)}</td>
      <td colSpan={2} />
    </tr>
  );
}

/** A text field that saves when you leave it. */
function Text({
  label,
  value,
  disabled,
  onSave,
  inline,
  placeholder,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onSave: (v: string) => void;
  inline?: boolean;
  placeholder?: string;
}) {
  return (
    <label className={cn("text-sm", inline ? "flex items-center gap-2" : "block")}>
      <span className={inline ? "text-slate-600" : "label"}>{label}</span>
      <input
        key={value}
        className={cn("input", inline && "!h-8 !w-48 !py-0 text-xs")}
        defaultValue={value}
        placeholder={placeholder}
        disabled={disabled}
        onBlur={(e) => e.target.value.trim() !== value && onSave(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
    </label>
  );
}

function LongText({
  label,
  value,
  disabled,
  onSave,
  isDefault,
  onDefault,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onSave: (v: string) => void;
  isDefault: boolean;
  onDefault: () => void;
}) {
  return (
    <div>
      <label className="block text-sm">
        <span className="label">{label}</span>
        <textarea key={value} className="input" rows={3} defaultValue={value} disabled={disabled} onBlur={(e) => e.target.value.trim() !== value && onSave(e.target.value)} />
      </label>
      <DefaultBox checked={isDefault} disabled={!value} onClick={onDefault} />
    </div>
  );
}

function DefaultBox({ checked, disabled, onClick }: { checked: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <label className={cn("mt-1 inline-flex items-center gap-1.5 text-xs text-slate-600", disabled && "opacity-50")}>
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
        className="input !h-8 !w-24 !py-0 text-right text-xs"
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
    <label className="block text-sm">
      <span className="label">{label}</span>
      <input key={value} type="date" className="input !w-48" defaultValue={value} disabled={disabled} onChange={(e) => e.target.value !== value && onSave(e.target.value)} />
    </label>
  );
}

function Seg({ value, options, disabled, onChange }: { value: string; options: [string, string][]; disabled?: boolean; onChange: (v: string) => void }) {
  return (
    <span className="inline-flex rounded-md border border-slate-300 p-0.5">
      {options.map(([v, l]) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => v !== value && onChange(v)}
          className={cn("rounded px-2.5 py-1 text-xs font-medium", value === v ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100 disabled:hover:bg-transparent")}
        >
          {l}
        </button>
      ))}
    </span>
  );
}

function LineForm({
  kind,
  choices,
  codes,
  busy,
  initial,
  onSave,
  onCancel,
}: {
  kind: "LINE" | "CHARGE";
  /** The change order has client choices (the Choice and Allowance columns are there). */
  choices: boolean;
  codes: Code[];
  busy: boolean;
  /** Editing one already on the change order. */
  initial?: { description: string; amount: number; costCodeId: string | null };
  onSave: (v: { kind: "LINE" | "CHARGE"; description: string; amount: number; costCodeId: string | null }) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState(initial?.description ?? "");
  const [a, setA] = useState(initial ? String(initial.amount) : "");
  const [code, setCode] = useState<string | null>(initial?.costCodeId ?? null);
  const n = Number(a.replace(/[$,\s]/g, "") || 0);
  return (
    <tr className="bg-blue-50/40">
      <td className="px-2 py-2">
        <CodeSelect codes={codes} value={code} onChange={setCode} />
      </td>
      <td colSpan={choices ? 2 : 1} className="px-3 py-2">
        <input
          className="input !h-8 !py-0 text-sm"
          autoFocus
          placeholder={kind === "CHARGE" ? "Extra charge, e.g. Change order fee" : "What's being added or changed"}
          value={d}
          onChange={(e) => setD(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onCancel()}
        />
      </td>
      <td className="px-3 py-2">
        <input className="input !h-8 !py-0 text-right text-sm" inputMode="decimal" placeholder="$0.00" value={a} onChange={(e) => setA(e.target.value)} />
      </td>
      <td colSpan={choices ? 2 : 1} />
      <td className="px-2 py-2 text-[11px] text-slate-400">{initial ? "" : "Profit: set it on the line once it's added"}</td>
      <td className="px-3 py-2 text-right">
        <span className="inline-flex gap-1">
          <button
            type="button"
            className={buttonClasses("primary", "sm")}
            disabled={busy || !d.trim() || !Number.isFinite(n)}
            onClick={() => onSave({ kind, description: d.trim(), amount: n, costCodeId: code })}
          >
            {initial ? "Save" : "Add"}
          </button>
          <button type="button" className={buttonClasses("ghost", "sm")} onClick={onCancel}>
            Cancel
          </button>
        </span>
      </td>
    </tr>
  );
}

/** A line's own profit: the change order's, none, a % or a $ — saved as you change it (draft only). */
function ProfitCell({ item, co, disabled, onSave }: { item: Item; co: Co; disabled: boolean; onSave: (mode: string, value: number) => void }) {
  const [text, setText] = useState<string | null>(null);
  const mode = item.profitMode || "CO";
  const own = mode === "PCT" || mode === "AMOUNT";
  if (disabled)
    return (
      <span className="text-xs text-slate-600">
        {mode === "CO" ? "Change order's" : mode === "NONE" ? "None" : mode === "PCT" ? `${num(item.profitValue, 2)}%` : `+${money(item.profitValue)}`}
      </span>
    );
  const commit = (raw: string) => {
    setText(null);
    const n = Number(raw.replace(/[$,%\s]/g, "") || 0);
    if (Number.isFinite(n) && n !== item.profitValue) onSave(mode, n);
  };
  return (
    <span className="flex items-center gap-1">
      <select
        className="input !h-8 !w-[13rem] !py-0 text-xs"
        value={mode}
        aria-label={`Profit on ${item.description}`}
        onChange={(e) => {
          const m = e.target.value;
          // Switching to % starts at the change order's %, so there's a number to adjust.
          onSave(
            m,
            m === "PCT" ? (mode === "PCT" ? item.profitValue : co.profitMode === "PCT" ? co.profitValue : 0) : m === "AMOUNT" ? (mode === "AMOUNT" ? item.profitValue : 0) : 0,
          );
        }}
      >
        {LINE_PROFIT_MODES.map((m) => (
          <option key={m.value} value={m.value}>
            {m.value === "CO" ? `Change order's${co.profitMode === "PCT" ? ` (${num(co.profitValue, 2)}%)` : ""}` : m.label}
          </option>
        ))}
      </select>
      {own ? (
        <input
          className="input !h-8 !w-16 !py-0 text-right text-xs"
          inputMode="decimal"
          aria-label={mode === "PCT" ? "Profit %" : "Profit $"}
          value={text ?? String(item.profitValue)}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => commit(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
      ) : null}
    </span>
  );
}

/** An item's cost code (yours — the budget uses it). */
function CodeSelect({ codes, value, disabled, onChange }: { codes: Code[]; value: string | null; disabled?: boolean; onChange: (id: string | null) => void }) {
  return (
    <select
      className={cn("input !h-8 !w-56 !py-0 text-xs", !value && "text-slate-400")}
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
          <button type="button" className={buttonClasses("ghost", "sm")} onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className={buttonClasses("primary", "sm")} disabled={busy || !picked.size} onClick={() => onAdd(Array.from(picked))}>
            Add selected
          </button>
        </footer>
      </div>
    </div>
  );
}

import Link from "next/link";
import { Layers, Pencil, Plus } from "lucide-react";
import { Badge, Collapsible, ConfirmForm, Field, SubmitButton, Table, THead, TBody, Tr, Th, Td, TFoot, buttonClasses } from "@/components/ui";
import { UNITS } from "@/lib/constants";
import { cn, costCodeLabel, lineCost, linePrice, money, num, pct } from "@/lib/utils";
import { groupBy, lineTotals } from "@/lib/finance";

export type EditorItem = {
  id: string;
  costCodeId: string | null;
  costCode: { code: string | null; name: string } | null;
  group?: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  markupPct: number;
  isAllowance?: boolean;
  isOptional?: boolean;
  allowanceId?: string | null;
  sortOrder: number;
};

/** A built-up allowance: its amount is the sum of the lines assigned to it. */
export type EditorAllowance = {
  id: string;
  name: string;
  group: string;
  description: string | null;
  sortOrder: number;
  selection: { id: string; title: string; allowance: number } | null;
};

type ServerAction = (formData: FormData) => void | Promise<void>;

type Props = {
  items: EditorItem[];
  costCodes: { id: string; code: string | null; name: string }[];
  /** Items can be added/edited/deleted. */
  editable: boolean;
  /** Shown instead of the add form when not editable. */
  readOnlyHint?: string;
  /** Item currently rendered as an inline edit form (from ?edit=). */
  editingId?: string | null;
  /** URL to return to (with existing query) — `edit=<id>` is appended for edit links. */
  baseHref: string;
  /** Hidden fields sent with every form (e.g. projectId + estimateId). */
  hidden: Record<string, string>;
  actions: { create: ServerAction; update: ServerAction; remove: ServerAction };
  /** Group rows by `group` with subtotals and expose the group field. */
  withGroups?: boolean;
  /** Show allowance / optional flags. */
  withFlags?: boolean;
  defaultMarkup: number;
  /** Built-up allowances (estimates only). Lines with a matching `allowanceId` render inside them. */
  allowances?: EditorAllowance[];
  allowanceActions?: { create: ServerAction; update: ServerAction; remove: ServerAction; convert: ServerAction };
  /** Allowance rendered as an inline edit form (from ?editAllowance=). */
  editingAllowanceId?: string | null;
  /** Allowance with its "add line" form open (from ?addTo=). */
  addToAllowanceId?: string | null;
  /** Link to a selection, for allowances that feed one. */
  selectionHref?: (id: string) => string;
};

function withParam(baseHref: string, key: string, id: string) {
  return `${baseHref}${baseHref.includes("?") ? "&" : "?"}${key}=${id}`;
}

function HiddenFields({ hidden }: { hidden: Record<string, string> }) {
  return (
    <>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
    </>
  );
}

function GroupField({ idPrefix, groups, defaultValue, className }: { idPrefix: string; groups: string[]; defaultValue: string; className?: string }) {
  return (
    <Field label="Group" htmlFor={`${idPrefix}-group`} className={className}>
      <input id={`${idPrefix}-group`} name="group" className="input" list={`${idPrefix}-groups`} defaultValue={defaultValue} required />
      <datalist id={`${idPrefix}-groups`}>
        {groups.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
    </Field>
  );
}

/** Field set shared by the add and edit forms. */
function ItemFields({
  item,
  costCodes,
  groups,
  withGroups,
  withFlags,
  defaultMarkup,
  idPrefix,
  allowances,
  fixedAllowanceId,
}: {
  item?: EditorItem;
  costCodes: Props["costCodes"];
  groups: string[];
  withGroups?: boolean;
  withFlags?: boolean;
  defaultMarkup: number;
  idPrefix: string;
  allowances?: EditorAllowance[];
  /** Line is being added straight into this allowance: group/allowance fields are implied. */
  fixedAllowanceId?: string;
}) {
  const showGroup = withGroups && !fixedAllowanceId;
  const showAllowancePicker = !fixedAllowanceId && allowances && allowances.length > 0;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
      {fixedAllowanceId ? <input type="hidden" name="allowanceId" value={fixedAllowanceId} /> : null}
      {showGroup ? <GroupField idPrefix={idPrefix} groups={groups} defaultValue={item?.group ?? groups[groups.length - 1] ?? "General"} className="md:col-span-2" /> : null}
      <Field label="Cost code" htmlFor={`${idPrefix}-costCode`} className="md:col-span-3">
        <select id={`${idPrefix}-costCode`} name="costCodeId" className="input" defaultValue={item?.costCodeId ?? ""}>
          <option value="">— None —</option>
          {costCodes.map((c) => (
            <option key={c.id} value={c.id}>
              {costCodeLabel(c)}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Description" htmlFor={`${idPrefix}-description`} className={showGroup ? "col-span-2 md:col-span-7" : "col-span-2 md:col-span-9"}>
        <input id={`${idPrefix}-description`} name="description" className="input" defaultValue={item?.description ?? ""} required />
      </Field>
      <Field label="Qty" htmlFor={`${idPrefix}-quantity`} className="md:col-span-2">
        <input id={`${idPrefix}-quantity`} name="quantity" type="number" step="any" min="0" className="input" defaultValue={item?.quantity ?? 1} required />
      </Field>
      <Field label="Unit" htmlFor={`${idPrefix}-unit`} className="md:col-span-2">
        <select id={`${idPrefix}-unit`} name="unit" className="input" defaultValue={item?.unit ?? "ea"}>
          {UNITS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Unit cost" htmlFor={`${idPrefix}-unitCost`} className="md:col-span-3">
        <input id={`${idPrefix}-unitCost`} name="unitCost" type="number" step="0.01" min="0" className="input" defaultValue={item?.unitCost ?? 0} required />
      </Field>
      <Field label="Markup %" htmlFor={`${idPrefix}-markupPct`} className="md:col-span-2">
        <input id={`${idPrefix}-markupPct`} name="markupPct" type="number" step="0.1" min="0" className="input" defaultValue={item?.markupPct ?? defaultMarkup} required />
      </Field>
      {showAllowancePicker ? (
        <Field label="Part of allowance" htmlFor={`${idPrefix}-allowance`} hint="Rolls this line into the allowance total." className="col-span-2 md:col-span-3">
          <select id={`${idPrefix}-allowance`} name="allowanceId" className="input" defaultValue={item?.allowanceId ?? ""}>
            <option value="">— Not in an allowance —</option>
            {allowances!.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.group})
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {withFlags ? (
        <div className="col-span-2 flex items-end gap-5 pb-2 md:col-span-3">
          {fixedAllowanceId ? null : (
            <label className="flex items-center gap-2 text-sm text-slate-700" title="Single-line allowance (not built up from other lines)">
              <input type="checkbox" name="isAllowance" defaultChecked={item?.isAllowance ?? false} className="h-4 w-4 rounded border-slate-300" />
              Allowance
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="isOptional" defaultChecked={item?.isOptional ?? false} className="h-4 w-4 rounded border-slate-300" />
            Optional
          </label>
        </div>
      ) : null}
    </div>
  );
}

function AllowanceFields({
  allowance,
  groups,
  idPrefix,
  costCodes,
}: {
  allowance?: EditorAllowance;
  groups: string[];
  idPrefix: string;
  /** Offer starter cost codes (create form only). */
  costCodes?: Props["costCodes"];
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
      <Field label="Allowance name" htmlFor={`${idPrefix}-name`} hint='Shown to the client, e.g. "Flooring".' className="col-span-2 md:col-span-4">
        <input id={`${idPrefix}-name`} name="name" className="input" defaultValue={allowance?.name ?? ""} placeholder="Flooring" required />
      </Field>
      <GroupField idPrefix={idPrefix} groups={groups} defaultValue={allowance?.group ?? groups[groups.length - 1] ?? "General"} className="md:col-span-3" />
      <Field label="Client note (optional)" htmlFor={`${idPrefix}-description`} className="col-span-2 md:col-span-5">
        <input
          id={`${idPrefix}-description`}
          name="description"
          className="input"
          defaultValue={allowance?.description ?? ""}
          placeholder="Tile & hardwood material for kitchen and baths"
        />
      </Field>
      {costCodes ? (
        <Field
          label="Start with cost codes (optional)"
          htmlFor={`${idPrefix}-costCodes`}
          hint="Ctrl/⌘-click to pick several. A $0 line is added for each so you can price it — e.g. Tile Material, Flooring Material, Install Labor."
          className="col-span-2 md:col-span-12"
        >
          <select id={`${idPrefix}-costCodes`} name="costCodeIds" multiple size={6} className="input !h-auto">
            {costCodes.map((c) => (
              <option key={c.id} value={c.id}>
                {costCodeLabel(c)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
    </div>
  );
}

type Entry = { kind: "item"; sortOrder: number; item: EditorItem } | { kind: "allowance"; sortOrder: number; allowance: EditorAllowance; items: EditorItem[] };

/**
 * Cost-based line items table (estimate / change order) with inline edit-by-row,
 * delete, and an "Add line item" form. On estimates, lines can be rolled up into
 * built-up allowances (CoConstruct-style): the allowance row shows the total of its
 * lines, each of which keeps its own cost code. Server component; all mutations are
 * the server actions passed in via `actions` / `allowanceActions`.
 */
export function LineItemsEditor({
  items,
  costCodes,
  editable,
  readOnlyHint,
  editingId,
  baseHref,
  hidden,
  actions,
  withGroups,
  withFlags,
  defaultMarkup,
  allowances = [],
  allowanceActions,
  editingAllowanceId,
  addToAllowanceId,
  selectionHref,
}: Props) {
  const allowanceIds = new Set(allowances.map((a) => a.id));
  const childrenOf = new Map(allowances.map((a) => [a.id, items.filter((i) => i.allowanceId === a.id)]));
  const entries: Entry[] = [
    ...items.filter((i) => !i.allowanceId || !allowanceIds.has(i.allowanceId)).map((item) => ({ kind: "item" as const, sortOrder: item.sortOrder, item })),
    ...allowances.map((a) => ({ kind: "allowance" as const, sortOrder: a.sortOrder, allowance: a, items: childrenOf.get(a.id) ?? [] })),
  ].sort((a, b) => a.sortOrder - b.sortOrder);
  const entryGroup = (e: Entry) => (e.kind === "item" ? (e.item.group ?? "General") : e.allowance.group);
  const entryItems = (e: Entry) => (e.kind === "item" ? [e.item] : e.items);
  const groups = withGroups ? groupBy(entries, entryGroup) : [["", entries] as [string, Entry[]]];
  const groupNames = groups.map(([g]) => g).filter(Boolean);
  const totals = lineTotals(items);
  const optionalTotals = withFlags ? lineTotals(items.filter((i) => i.isOptional), { includeOptional: true }) : null;
  const colCount = 8 + (withFlags ? 1 : 0) + (editable ? 1 : 0);
  const canBuildAllowances = editable && !!allowanceActions;

  function Row({ item, nested }: { item: EditorItem; nested?: boolean }) {
    if (editable && editingId === item.id) {
      return (
        <tr className="bg-blue-50/40">
          <td colSpan={colCount} className={cn("px-4 py-3", nested && "border-l-4 border-amber-300")}>
            <form action={actions.update} className="space-y-3">
              <HiddenFields hidden={hidden} />
              <input type="hidden" name="id" value={item.id} />
              <ItemFields
                item={item}
                costCodes={costCodes}
                groups={groupNames}
                withGroups={withGroups}
                withFlags={withFlags}
                defaultMarkup={defaultMarkup}
                idPrefix={`edit-${item.id}`}
                allowances={allowanceActions ? allowances : undefined}
              />
              <div className="flex items-center gap-2">
                <SubmitButton size="sm">Save</SubmitButton>
                <Link href={baseHref} className={buttonClasses("secondary", "sm")}>
                  Cancel
                </Link>
              </div>
            </form>
          </td>
        </tr>
      );
    }
    return (
      <Tr className={cn(item.isOptional && "text-slate-500", nested && "bg-amber-50/20")}>
        <Td className={cn("max-w-[190px] text-xs text-slate-500", nested && "border-l-4 border-amber-300 !pl-8")}>
          {item.costCode ? (
            <>
              {item.costCode.code ? <span className="block font-mono text-slate-700">{item.costCode.code}</span> : null}
              <span className="block leading-tight">{item.costCode.name}</span>
            </>
          ) : (
            "—"
          )}
        </Td>
        <Td className="min-w-[220px] text-slate-900">{item.description}</Td>
        <Td right>{num(item.quantity)}</Td>
        <Td>{item.unit}</Td>
        <Td right>{money(item.unitCost)}</Td>
        <Td right>{pct(item.markupPct, 1)}</Td>
        <Td right>{money(lineCost(item))}</Td>
        <Td right className={cn("font-medium", nested ? "text-slate-600" : "text-slate-900")}>
          {money(linePrice(item))}
        </Td>
        {withFlags ? (
          <Td>
            <span className="flex flex-wrap gap-1">
              {item.isAllowance && !nested ? <Badge className="bg-amber-50 text-amber-800 ring-amber-200">Allowance</Badge> : null}
              {item.isOptional ? <Badge className="bg-violet-50 text-violet-800 ring-violet-200">Optional</Badge> : null}
            </span>
          </Td>
        ) : null}
        {editable ? (
          <Td>
            <span className="flex items-center justify-end gap-1">
              {canBuildAllowances && item.isAllowance && !nested ? (
                <ConfirmForm
                  action={allowanceActions!.convert}
                  hidden={{ ...hidden, id: item.id }}
                  message="Turn this line into a built-up allowance so you can add more cost-code lines to it?"
                  variant="ghost"
                >
                  <span title="Build this allowance up from several cost-code lines">
                    <Layers className="inline h-3.5 w-3.5" /> Build up
                  </span>
                </ConfirmForm>
              ) : null}
              <Link href={withParam(baseHref, "edit", item.id)} className={buttonClasses("ghost", "sm")} title="Edit">
                <Pencil className="h-3.5 w-3.5" /> Edit
              </Link>
              <ConfirmForm action={actions.remove} hidden={{ ...hidden, id: item.id }} message="Delete this line item?" variant="ghost">
                <span className="text-rose-700">Delete</span>
              </ConfirmForm>
            </span>
          </Td>
        ) : null}
      </Tr>
    );
  }

  function AllowanceBlock({ allowance, lines }: { allowance: EditorAllowance; lines: EditorItem[] }) {
    const t = lineTotals(lines);
    const outOfSync = allowance.selection && Math.abs(allowance.selection.allowance - t.price) >= 0.01;
    const header =
      editable && allowanceActions && editingAllowanceId === allowance.id ? (
        <tr className="bg-amber-50/60">
          <td colSpan={colCount} className="border-l-4 border-amber-400 px-4 py-3">
            <form action={allowanceActions.update} className="space-y-3">
              <HiddenFields hidden={hidden} />
              <input type="hidden" name="id" value={allowance.id} />
              <AllowanceFields allowance={allowance} groups={groupNames} idPrefix={`edit-allowance-${allowance.id}`} />
              <div className="flex items-center gap-2">
                <SubmitButton size="sm">Save allowance</SubmitButton>
                <Link href={baseHref} className={buttonClasses("secondary", "sm")}>
                  Cancel
                </Link>
              </div>
            </form>
          </td>
        </tr>
      ) : (
        <tr id={`allowance-${allowance.id}`} className="scroll-mt-24 border-t border-amber-200 bg-amber-50/70">
          <td className="border-l-4 border-amber-400 px-4 py-2.5">
            <Badge className="bg-amber-100 text-amber-900 ring-amber-300">Allowance</Badge>
          </td>
          <td className="px-4 py-2.5">
            <span className="block font-semibold text-slate-900">{allowance.name}</span>
            {allowance.description ? <span className="block text-xs text-slate-600">{allowance.description}</span> : null}
            <span className="block text-xs text-slate-500">
              Built from {lines.length} line{lines.length === 1 ? "" : "s"}
            </span>
          </td>
          <td className="px-4 py-2.5" colSpan={3} />
          <Td right className="text-xs text-slate-600">
            {t.cost > 0 ? pct((t.markup / t.cost) * 100, 1) : "—"}
          </Td>
          <Td right className="font-medium">
            {money(t.cost)}
          </Td>
          <Td right className="font-semibold text-amber-900">
            {money(t.price)}
          </Td>
          {withFlags ? (
            <Td>
              {allowance.selection ? (
                <span className="flex flex-col gap-0.5">
                  {selectionHref ? (
                    <Link href={selectionHref(allowance.selection.id)} className="text-xs font-medium text-blue-700 hover:underline">
                      Selection ↗
                    </Link>
                  ) : (
                    <span className="text-xs">Selection</span>
                  )}
                  {outOfSync ? <Badge className="bg-rose-50 text-rose-800 ring-rose-200">Out of sync</Badge> : null}
                </span>
              ) : null}
            </Td>
          ) : null}
          {editable ? (
            <Td>
              {allowanceActions ? (
                <span className="flex items-center justify-end gap-1">
                  <Link href={`${withParam(baseHref, "addTo", allowance.id)}#allowance-${allowance.id}`} className={buttonClasses("ghost", "sm")} title="Add a cost-code line to this allowance">
                    <Plus className="h-3.5 w-3.5" /> Line
                  </Link>
                  <Link href={withParam(baseHref, "editAllowance", allowance.id)} className={buttonClasses("ghost", "sm")} title="Edit allowance">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Link>
                  <ConfirmForm
                    action={allowanceActions.remove}
                    hidden={{ ...hidden, id: allowance.id }}
                    message={`Remove the "${allowance.name}" allowance? Its ${lines.length} line(s) stay on the estimate as regular lines.`}
                    variant="ghost"
                  >
                    <span className="text-rose-700">Remove</span>
                  </ConfirmForm>
                </span>
              ) : null}
            </Td>
          ) : null}
        </tr>
      );

    return (
      <>
        {header}
        {lines.map((item) => (
          <Row key={item.id} item={item} nested />
        ))}
        {lines.length === 0 && addToAllowanceId !== allowance.id ? (
          <tr className="bg-amber-50/20">
            <td colSpan={colCount} className="border-l-4 border-amber-300 px-4 py-2 pl-8 text-xs italic text-slate-500">
              No lines yet. Add the cost codes that make up this allowance (e.g. tile material, hardwood material, install labor).
            </td>
          </tr>
        ) : null}
        {editable && addToAllowanceId === allowance.id ? (
          <tr className="bg-amber-50/40">
            <td colSpan={colCount} className="border-l-4 border-amber-300 px-4 py-3 pl-8">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-900">Add line to {allowance.name}</p>
              <form action={actions.create} className="space-y-3">
                <HiddenFields hidden={hidden} />
                <ItemFields
                  costCodes={costCodes}
                  groups={groupNames}
                  withGroups={withGroups}
                  withFlags={withFlags}
                  defaultMarkup={defaultMarkup}
                  idPrefix={`add-to-${allowance.id}`}
                  fixedAllowanceId={allowance.id}
                />
                <div className="flex items-center gap-2">
                  <SubmitButton size="sm">Add to allowance</SubmitButton>
                  <Link href={baseHref} className={buttonClasses("secondary", "sm")}>
                    Done
                  </Link>
                </div>
              </form>
            </td>
          </tr>
        ) : null}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <THead>
          <tr>
            <Th>Cost code</Th>
            <Th>Description</Th>
            <Th right>Qty</Th>
            <Th>Unit</Th>
            <Th right>Unit cost</Th>
            <Th right>Markup</Th>
            <Th right>Cost</Th>
            <Th right>Price</Th>
            {withFlags ? <Th>Flags</Th> : null}
            {editable ? <Th className="text-right">Actions</Th> : null}
          </tr>
        </THead>
        <TBody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-4 py-8 text-center text-sm text-slate-500">
                No line items yet.
              </td>
            </tr>
          ) : null}
          {groups.map(([group, groupEntries]) => {
            const gt = lineTotals(groupEntries.flatMap(entryItems));
            return (
              <GroupRows key={group || "all"} group={group} withGroups={!!withGroups} colCount={colCount} totals={gt} withFlags={!!withFlags} editable={editable}>
                {groupEntries.map((e) =>
                  e.kind === "item" ? <Row key={e.item.id} item={e.item} /> : <AllowanceBlock key={e.allowance.id} allowance={e.allowance} lines={e.items} />,
                )}
              </GroupRows>
            );
          })}
        </TBody>
        {items.length > 0 ? (
          <TFoot>
            <tr>
              <td className="px-4 py-2.5 font-semibold text-slate-900" colSpan={6}>
                Total{withFlags ? " (excluding optional items)" : ""}
              </td>
              <Td right>{money(totals.cost)}</Td>
              <Td right className="font-semibold text-slate-900">
                {money(totals.price)}
              </Td>
              {withFlags ? <Td /> : null}
              {editable ? <Td /> : null}
            </tr>
            {optionalTotals && optionalTotals.price > 0 ? (
              <tr className="text-slate-500">
                <td className="px-4 py-2 text-xs font-normal" colSpan={6}>
                  Optional items (not included)
                </td>
                <Td right className="text-xs font-normal">
                  {money(optionalTotals.cost)}
                </Td>
                <Td right className="text-xs font-normal">
                  {money(optionalTotals.price)}
                </Td>
                {withFlags ? <Td /> : null}
                {editable ? <Td /> : null}
              </tr>
            ) : null}
          </TFoot>
        ) : null}
      </Table>

      {editable ? (
        <div className="space-y-3">
          <Collapsible summary="Add line item" defaultOpen={entries.length === 0}>
            <form action={actions.create} className="space-y-3">
              <HiddenFields hidden={hidden} />
              <ItemFields
                costCodes={costCodes}
                groups={groupNames}
                withGroups={withGroups}
                withFlags={withFlags}
                defaultMarkup={defaultMarkup}
                idPrefix="new-item"
                allowances={allowanceActions ? allowances : undefined}
              />
              <SubmitButton size="sm">Add item</SubmitButton>
            </form>
          </Collapsible>
          {allowanceActions ? (
            <Collapsible summary="Add allowance (built from cost-code lines)">
              <form action={allowanceActions.create} className="space-y-3">
                <HiddenFields hidden={hidden} />
                <p className="text-sm text-slate-600">
                  The client sees one allowance amount (e.g. <em>Flooring</em>); you build it from separate cost-code lines such as tile material, hardwood material and
                  install labor. Budget and job costing track each cost code.
                </p>
                <AllowanceFields groups={groupNames} idPrefix="new-allowance" costCodes={costCodes} />
                <SubmitButton size="sm">Create allowance</SubmitButton>
              </form>
            </Collapsible>
          ) : null}
        </div>
      ) : readOnlyHint ? (
        <p className="text-sm text-slate-500">{readOnlyHint}</p>
      ) : null}
    </div>
  );
}

function GroupRows({
  group,
  withGroups,
  colCount,
  totals,
  withFlags,
  editable,
  children,
}: {
  group: string;
  withGroups: boolean;
  colCount: number;
  totals: { cost: number; price: number };
  withFlags: boolean;
  editable: boolean;
  children: React.ReactNode;
}) {
  if (!withGroups) return <>{children}</>;
  return (
    <>
      <tr className="bg-slate-50/80">
        <td colSpan={colCount} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">
          {group}
        </td>
      </tr>
      {children}
      <tr className="bg-slate-50/40 text-xs text-slate-600">
        <td className="px-4 py-1.5 italic" colSpan={6}>
          {group} subtotal
        </td>
        <Td right className="py-1.5 text-xs">
          {money(totals.cost)}
        </Td>
        <Td right className="py-1.5 text-xs font-medium text-slate-800">
          {money(totals.price)}
        </Td>
        {withFlags ? <td /> : null}
        {editable ? <td /> : null}
      </tr>
    </>
  );
}

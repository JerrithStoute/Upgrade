import Link from "next/link";
import { Pencil } from "lucide-react";
import { Badge, Collapsible, ConfirmForm, Field, SubmitButton, Table, THead, TBody, Tr, Th, Td, TFoot, buttonClasses } from "@/components/ui";
import { UNITS } from "@/lib/constants";
import { lineCost, linePrice, money, num, pct } from "@/lib/utils";
import { groupBy, lineTotals } from "@/lib/finance";

export type EditorItem = {
  id: string;
  costCodeId: string | null;
  costCode: { code: string; name: string } | null;
  group?: string;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  markupPct: number;
  isAllowance?: boolean;
  isOptional?: boolean;
  sortOrder: number;
};

type ServerAction = (formData: FormData) => void | Promise<void>;

type Props = {
  items: EditorItem[];
  costCodes: { id: string; code: string; name: string }[];
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
};

function withEdit(baseHref: string, id: string) {
  return `${baseHref}${baseHref.includes("?") ? "&" : "?"}edit=${id}`;
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

/** Field set shared by the add and edit forms. */
function ItemFields({
  item,
  costCodes,
  groups,
  withGroups,
  withFlags,
  defaultMarkup,
  idPrefix,
}: {
  item?: EditorItem;
  costCodes: Props["costCodes"];
  groups: string[];
  withGroups?: boolean;
  withFlags?: boolean;
  defaultMarkup: number;
  idPrefix: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-12">
      {withGroups ? (
        <Field label="Group" htmlFor={`${idPrefix}-group`} className="md:col-span-2">
          <input
            id={`${idPrefix}-group`}
            name="group"
            className="input"
            list={`${idPrefix}-groups`}
            defaultValue={item?.group ?? groups[groups.length - 1] ?? "General"}
            required
          />
          <datalist id={`${idPrefix}-groups`}>
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
        </Field>
      ) : null}
      <Field label="Cost code" htmlFor={`${idPrefix}-costCode`} className={withGroups ? "md:col-span-3" : "md:col-span-3"}>
        <select id={`${idPrefix}-costCode`} name="costCodeId" className="input" defaultValue={item?.costCodeId ?? ""}>
          <option value="">— None —</option>
          {costCodes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.code} – {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Description" htmlFor={`${idPrefix}-description`} className={withGroups ? "col-span-2 md:col-span-7" : "col-span-2 md:col-span-9"}>
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
      {withFlags ? (
        <div className="col-span-2 flex items-end gap-5 pb-2 md:col-span-3">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="isAllowance" defaultChecked={item?.isAllowance ?? false} className="h-4 w-4 rounded border-slate-300" />
            Allowance
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="isOptional" defaultChecked={item?.isOptional ?? false} className="h-4 w-4 rounded border-slate-300" />
            Optional
          </label>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Cost-based line items table (estimate / change order) with inline edit-by-row,
 * delete, and an "Add line item" form. Server component; all mutations are the
 * server actions passed in via `actions`.
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
}: Props) {
  const groups = withGroups ? groupBy(items, (i) => i.group ?? "General") : [["", items] as [string, EditorItem[]]];
  const groupNames = groups.map(([g]) => g).filter(Boolean);
  const totals = lineTotals(items);
  const optionalTotals = withFlags ? lineTotals(items.filter((i) => i.isOptional), { includeOptional: true }) : null;
  const colCount = 8 + (withFlags ? 1 : 0) + (editable ? 1 : 0);

  function Row({ item }: { item: EditorItem }) {
    if (editable && editingId === item.id) {
      return (
        <tr className="bg-blue-50/40">
          <td colSpan={colCount} className="px-4 py-3">
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
      <Tr className={item.isOptional ? "text-slate-500" : undefined}>
        <Td className="whitespace-nowrap text-xs text-slate-500">
          {item.costCode ? (
            <>
              <span className="font-mono text-slate-700">{item.costCode.code}</span> – {item.costCode.name}
            </>
          ) : (
            "—"
          )}
        </Td>
        <Td className="min-w-[200px]">{item.description}</Td>
        <Td right>{num(item.quantity)}</Td>
        <Td>{item.unit}</Td>
        <Td right>{money(item.unitCost)}</Td>
        <Td right>{pct(item.markupPct, 1)}</Td>
        <Td right>{money(lineCost(item))}</Td>
        <Td right className="font-medium text-slate-900">
          {money(linePrice(item))}
        </Td>
        {withFlags ? (
          <Td>
            <span className="flex flex-wrap gap-1">
              {item.isAllowance ? <Badge className="bg-amber-50 text-amber-800 ring-amber-200">Allowance</Badge> : null}
              {item.isOptional ? <Badge className="bg-violet-50 text-violet-800 ring-violet-200">Optional</Badge> : null}
            </span>
          </Td>
        ) : null}
        {editable ? (
          <Td>
            <span className="flex items-center justify-end gap-1">
              <Link href={withEdit(baseHref, item.id)} className={buttonClasses("ghost", "sm")} title="Edit">
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
          {items.length === 0 ? (
            <tr>
              <td colSpan={colCount} className="px-4 py-8 text-center text-sm text-slate-500">
                No line items yet.
              </td>
            </tr>
          ) : null}
          {groups.map(([group, groupItems]) => {
            const gt = lineTotals(groupItems);
            return (
              <GroupRows key={group || "all"} group={group} withGroups={!!withGroups} colCount={colCount} totals={gt} withFlags={!!withFlags} editable={editable}>
                {groupItems.map((item) => (
                  <Row key={item.id} item={item} />
                ))}
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
        <Collapsible summary="Add line item" defaultOpen={items.length === 0}>
          <form action={actions.create} className="space-y-3">
            <HiddenFields hidden={hidden} />
            <ItemFields costCodes={costCodes} groups={groupNames} withGroups={withGroups} withFlags={withFlags} defaultMarkup={defaultMarkup} idPrefix="new-item" />
            <SubmitButton size="sm">Add item</SubmitButton>
          </form>
        </Collapsible>
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

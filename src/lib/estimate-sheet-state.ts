import { byCategory, type SheetLine, type SheetSpec } from "./estimate-sheet";
import { NO_VIEW } from "./proposal-options";
import { evaluateFormula, formulaRefs } from "./formula";
import { followTable, tableProfitPct, type MarkupRow } from "./markup";
import { settleSales, usesSales } from "./sales-price";

/**
 * Everything you can do to the estimate sheet before saving. Pure: the screen
 * keeps a `SheetState` and runs these; Save sends the result, Discard drops it.
 */

export type SheetState = {
  specs: SheetSpec[];
  basePrice: number | null;
  totalSqFt: number | null;
  /** The job's estimate parameter values, by parameter id (empty on templates). */
  values: Record<string, number>;
  /** The Markup, Margin & Tax table. */
  markup: MarkupRow[];
  /** What "Sales price" works out to (only when a line uses it). */
  sales?: number;
  dirty: boolean;
};

/** A typed-in quantity / unit cost replaces its formula. */
const unlink = (p: Partial<SheetLine>): Partial<SheetLine> => ({
  ...p,
  ...(p.quantity !== undefined && p.qtyFormula === undefined ? { qtyFormula: null } : {}),
  ...(p.unitCost !== undefined && p.costFormula === undefined ? { costFormula: null } : {}),
});

/** A formula's quantity from these values (a parameter with no value counts as 0). */
export function formulaQty(formula: string, values: Record<string, number>) {
  return evaluateFormula(
    formula,
    values,
    Object.keys(values).map((id) => ({ id, name: id })),
  ).value;
}

export type SheetAction =
  | { type: "reset"; state: SheetState }
  | { type: "header"; patch: Partial<Pick<SheetState, "basePrice" | "totalSqFt">> }
  /** A job parameter's value: every item whose formula uses it updates. */
  | { type: "paramValue"; id: string; value: number | null }
  /** The Markup, Margin & Tax table changed: lines still at the old table profit % follow it. */
  | { type: "markup"; rows: MarkupRow[] }
  | { type: "spec"; spec: string; patch: Partial<Omit<SheetSpec, "key" | "id" | "lines">> }
  | { type: "line"; spec: string; line: string; patch: Partial<Omit<SheetLine, "key" | "id">> }
  /** spec null: into whichever item `before` is in, just above that line. */
  | { type: "addLine"; spec: string | null; key: string; markupPct: number; init?: Partial<SheetLine>; before?: string | null }
  | { type: "addSpec"; category: string; key: string; name?: string }
  | { type: "duplicateSpec"; spec: string; key: string; lineKeys: string[] }
  | { type: "renameCategory"; from: string; to: string }
  | { type: "deleteSpec"; spec: string }
  | { type: "deleteCategory"; category: string }
  | { type: "deleteLines"; lines: string[] }
  | { type: "patchLines"; lines: string[]; patch: Partial<Omit<SheetLine, "key" | "id">> }
  | { type: "specLines"; spec: string; patch: (l: SheetLine) => Partial<SheetLine> }
  /** toSpec null: into whichever item `before` is in. */
  | { type: "moveLine"; line: string; toSpec: string | null; before: string | null }
  /** toCategory null: into whichever category `before` is in. */
  | { type: "moveSpec"; spec: string; toCategory: string | null; before: string | null }
  | { type: "moveCategory"; category: string; before: string | null }
  /** Replace the whole sheet's items (e.g. "Organize by my divisions"). */
  | { type: "setSpecs"; specs: SheetSpec[] };

/** Specs of one category stay together, in the order their category first appears. */
function tidy(specs: SheetSpec[]) {
  return byCategory(specs).flatMap(([, s]) => s);
}

export function newLine(key: string, markupPct: number, init?: Partial<SheetLine>): SheetLine {
  return {
    id: null,
    key,
    costCodeId: null,
    description: "",
    quantity: 1,
    unit: "ea",
    unitCost: 0,
    markupPct,
    costType: "MATERIAL",
    notes: "",
    isOptional: false,
    fromTakeoff: false,
    materialItemId: null,
    addToItemList: false,
    qtyFormula: null,
    costFormula: null,
    ...init,
  };
}

export function newSpec(key: string, category: string, name = "New item"): SheetSpec {
  return {
    id: null,
    key,
    name,
    category,
    specText: "",
    kind: "SPECIFICATION",
    isAllowance: false,
    clientNotes: "",
    tradeNotes: "",
    urgent: false,
    requestedBy: "",
    proposalView: NO_VIEW,
    allowanceProfit: null,
    lines: [],
  };
}

function mapSpec(specs: SheetSpec[], key: string, fn: (s: SheetSpec) => SheetSpec) {
  return specs.map((s) => (s.key === key ? fn(s) : s));
}

function edit(state: SheetState, specs: SheetSpec[]): SheetState {
  return { ...state, specs, dirty: true };
}

/** Lines using "Sales price" settle at the price they're part of (see sales-price.ts) — after every change. */
export function settleSheet(state: SheetState): SheetState {
  const all = state.specs.flatMap((s) => s.lines);
  if (!all.some(usesSales)) return state.sales === undefined ? state : { ...state, sales: undefined };
  const { sales, lines } = settleSales(all, state.values, state.basePrice, state.markup);
  const next = new Map(lines.map((l) => [l.key, l]));
  const moved = (l: SheetLine) => {
    const n = next.get(l.key)!;
    return Math.abs(n.quantity - l.quantity) > 1e-9 || Math.abs(n.unitCost - l.unitCost) > 1e-9;
  };
  const specs = state.specs.map((s) => (s.lines.some(moved) ? { ...s, lines: s.lines.map((l) => (moved(l) ? next.get(l.key)! : l)) } : s));
  return specs.some((s, i) => s !== state.specs[i]) || state.sales !== sales ? { ...state, specs, sales } : state;
}

export function sheetReducer(state: SheetState, a: SheetAction): SheetState {
  return settleSheet(reduce(state, a));
}

function reduce(state: SheetState, a: SheetAction): SheetState {
  switch (a.type) {
    case "reset":
      return a.state;
    case "header":
      return { ...state, ...a.patch, dirty: true };
    case "spec": {
      const specs = mapSpec(state.specs, a.spec, (s) => {
        const next = { ...s, ...a.patch };
        // A one-line item shows as one row: its line's name follows the item's (unless you'd given it its own).
        const lone = s.lines.length === 1 ? s.lines[0] : null;
        if (a.patch.name !== undefined && lone && (lone.description === s.name || !lone.description)) next.lines = [{ ...lone, description: a.patch.name }];
        return next;
      });
      // A new category name moves the item to the end of that category.
      if (a.patch.category !== undefined) {
        const moved = specs.find((s) => s.key === a.spec)!;
        const rest = specs.filter((s) => s.key !== a.spec);
        const lastOfCat = rest.map((s) => s.category).lastIndexOf(moved.category);
        rest.splice(lastOfCat === -1 ? rest.length : lastOfCat + 1, 0, moved);
        return edit(state, tidy(rest));
      }
      return edit(state, specs);
    }
    case "line": {
      // A formula sets the quantity; typing a quantity unlinks the formula.
      const patch = { ...a.patch };
      if (typeof patch.qtyFormula === "string") patch.quantity = formulaQty(patch.qtyFormula, state.values);
      else if (patch.quantity !== undefined && patch.qtyFormula === undefined) patch.qtyFormula = null;
      // Unit cost works the same way.
      if (typeof patch.costFormula === "string") patch.unitCost = formulaQty(patch.costFormula, state.values);
      else if (patch.unitCost !== undefined && patch.costFormula === undefined) patch.costFormula = null;
      // A new cost type: a line still at the table's profit % takes the new type's.
      if (patch.costType !== undefined && patch.markupPct === undefined) {
        const line = state.specs.find((s) => s.key === a.spec)?.lines.find((l) => l.key === a.line);
        const before = line ? tableProfitPct(state.markup, line.costType) : null;
        const after = tableProfitPct(state.markup, patch.costType);
        if (line && before !== null && after !== null && Math.abs(line.markupPct - before) < 1e-6) patch.markupPct = after;
      }
      return edit(
        state,
        mapSpec(state.specs, a.spec, (s) => ({ ...s, lines: s.lines.map((l) => (l.key === a.line ? { ...l, ...patch } : l)) })),
      );
    }
    case "markup": {
      const specs = state.specs.map((s) => {
        let changed = false;
        const lines = s.lines.map((l) => {
          const pct = followTable(state.markup, a.rows, l);
          if (pct === null) return l;
          changed = true;
          return { ...l, markupPct: pct };
        });
        return changed ? { ...s, lines } : s;
      });
      return { ...state, specs, markup: a.rows, dirty: true };
    }
    case "paramValue": {
      const values = { ...state.values };
      if (a.value === null) delete values[a.id];
      else values[a.id] = a.value;
      const refs = (f: string | null) => !!f && formulaRefs(f).includes(a.id);
      const uses = (l: SheetLine) => refs(l.qtyFormula) || refs(l.costFormula);
      const update = (l: SheetLine) => ({
        ...l,
        ...(refs(l.qtyFormula) ? { quantity: formulaQty(l.qtyFormula!, values) } : {}),
        ...(refs(l.costFormula) ? { unitCost: formulaQty(l.costFormula!, values) } : {}),
      });
      const touched = state.specs.some((s) => s.lines.some(uses));
      const specs = touched ? state.specs.map((s) => (s.lines.some(uses) ? { ...s, lines: s.lines.map((l) => (uses(l) ? update(l) : l)) } : s)) : state.specs;
      // The values save with the job on their own; only lines they changed need "Save changes".
      return { ...state, specs, values, dirty: state.dirty || touched };
    }
    case "addLine": {
      const spec = a.spec ?? state.specs.find((s) => s.lines.some((l) => l.key === a.before))?.key;
      if (!spec) return state;
      return edit(
        state,
        mapSpec(state.specs, spec, (s) => {
          const lines = [...s.lines];
          const at = a.before ? lines.findIndex((l) => l.key === a.before) : -1;
          lines.splice(at === -1 ? lines.length : at, 0, newLine(a.key, a.markupPct, a.init));
          return { ...s, lines };
        }),
      );
    }
    case "addSpec": {
      const specs = [...state.specs];
      const lastOfCat = specs.map((s) => s.category).lastIndexOf(a.category);
      specs.splice(lastOfCat === -1 ? specs.length : lastOfCat + 1, 0, newSpec(a.key, a.category, a.name));
      return edit(state, specs);
    }
    case "duplicateSpec": {
      const i = state.specs.findIndex((s) => s.key === a.spec);
      if (i === -1) return state;
      const src = state.specs[i];
      const copy: SheetSpec = {
        ...src,
        id: null,
        key: a.key,
        name: `${src.name} (copy)`,
        // Copies aren't tied to the takeoff (it would update both) and aren't re-added to the Item List.
        lines: src.lines.map((l, j) => ({ ...l, id: null, key: a.lineKeys[j], fromTakeoff: false, takeoffKey: null })),
      };
      const specs = [...state.specs];
      specs.splice(i + 1, 0, copy);
      return edit(state, specs);
    }
    case "renameCategory": {
      const to = a.to.trim();
      if (!to || to === a.from) return state;
      return edit(state, tidy(state.specs.map((s) => (s.category === a.from ? { ...s, category: to } : s))));
    }
    case "deleteSpec":
      return edit(
        state,
        state.specs.filter((s) => s.key !== a.spec),
      );
    case "deleteCategory":
      return edit(
        state,
        state.specs.filter((s) => s.category !== a.category),
      );
    case "deleteLines": {
      const gone = new Set(a.lines);
      return edit(
        state,
        state.specs.map((s) => (s.lines.some((l) => gone.has(l.key)) ? { ...s, lines: s.lines.filter((l) => !gone.has(l.key)) } : s)),
      );
    }
    case "patchLines": {
      const keys = new Set(a.lines);
      return edit(
        state,
        state.specs.map((s) => (s.lines.some((l) => keys.has(l.key)) ? { ...s, lines: s.lines.map((l) => (keys.has(l.key) ? { ...l, ...unlink(a.patch) } : l)) } : s)),
      );
    }
    case "specLines":
      return edit(
        state,
        mapSpec(state.specs, a.spec, (s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, ...unlink(a.patch(l)) })) })),
      );
    case "moveLine": {
      if (a.line === a.before) return state;
      const line = state.specs.flatMap((s) => s.lines).find((l) => l.key === a.line);
      const toSpec = a.toSpec ?? state.specs.find((s) => s.lines.some((l) => l.key === a.before))?.key;
      if (!line || !toSpec || !state.specs.some((s) => s.key === toSpec)) return state;
      const specs = state.specs.map((s) => {
        const lines = s.lines.filter((l) => l.key !== a.line);
        if (s.key !== toSpec) return lines.length === s.lines.length ? s : { ...s, lines };
        const at = a.before ? lines.findIndex((l) => l.key === a.before) : -1;
        lines.splice(at === -1 ? lines.length : at, 0, line);
        return { ...s, lines };
      });
      return edit(state, specs);
    }
    case "moveSpec": {
      if (a.spec === a.before) return state;
      const spec = state.specs.find((s) => s.key === a.spec);
      const toCategory = a.toCategory ?? state.specs.find((s) => s.key === a.before)?.category;
      if (!spec || toCategory === undefined) return state;
      const rest = state.specs.filter((s) => s.key !== a.spec);
      const moved = { ...spec, category: toCategory };
      let at = a.before ? rest.findIndex((s) => s.key === a.before) : -1;
      if (at === -1) {
        const last = rest.map((s) => s.category).lastIndexOf(toCategory);
        at = last === -1 ? rest.length : last + 1;
      }
      rest.splice(at, 0, moved);
      return edit(state, tidy(rest));
    }
    case "setSpecs":
      return edit(state, a.specs);
    case "moveCategory": {
      if (a.category === a.before) return state;
      const moving = state.specs.filter((s) => s.category === a.category);
      const rest = state.specs.filter((s) => s.category !== a.category);
      const at = a.before ? rest.findIndex((s) => s.category === a.before) : -1;
      rest.splice(at === -1 ? rest.length : at, 0, ...moving);
      return edit(state, rest);
    }
  }
}

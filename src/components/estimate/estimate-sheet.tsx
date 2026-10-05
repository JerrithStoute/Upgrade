"use client";

import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Trash2,
  Calculator,
  FolderTree,
  ChevronDown,
  X,
  ChevronRight,
  Eye,
  GripVertical,
  Link2,
  ListChecks,
  ListPlus,
  MoreHorizontal,
  Percent,
  Plus,
  Ruler,
  CircleDollarSign,
  AlertTriangle,
} from "lucide-react";
import { UNITS } from "@/lib/constants";
import { cn, costCodeLabel, money, num } from "@/lib/utils";
import {
  COST_TYPES,
  guessCostType,
  organizeSheet,
  byCategory,
  lineMath,
  linesTotals,
  specsTotals,
  toSaveInput,
  type SaveSheetInput,
  type SheetLine,
  type SheetSpec,
  type Totals,
} from "@/lib/estimate-sheet";
import { settleSheet, sheetReducer, type SheetAction, type SheetState } from "@/lib/estimate-sheet-state";
import { SALES_ID, SALES_PARAM, settleSales, usesSales } from "@/lib/sales-price";
import { buttonClasses } from "@/components/ui";
import { SpecPanel } from "./spec-panel";
import { CostCodeCell, NumCell, QtyCell, cellClass } from "./cells";
import { ParametersForm, type ParamSetup } from "./parameters-form";
import { formulaRefs } from "@/lib/formula";
import { CodePicker, CostCodePanel } from "./cost-codes";
import { DivisionsForm, type DivisionSetup } from "./divisions-form";
import type { SheetCostCode } from "@/lib/cost-code-divisions";
import type { TakeoffDetailRow } from "@/lib/takeoff-data";
import { allowanceExtras, tableExtras, tableProfitPct, type MarkupRow } from "@/lib/markup";
import { MarkupPanel } from "./markup-table";
import { moveByArrow } from "@/components/grid-keys";

type CostCode = SheetCostCode;
type SaveResult = { ok: true; estimateId?: string; learned?: string[] } | { ok: false; error: string };

// A note that outlives the fresh copy of the sheet a save brings back ("Your divisions were updated…").
let flash: string | null = null;

export type SheetProps = {
  /** Which estimate / template this is — what's open or collapsed is remembered for it on this computer. */
  viewKey: string;
  initial: SheetSpec[];
  costCodes: CostCode[];
  /** Profit % new lines start with. */
  defaultMarkup: number;
  /** Job estimates: versions, sq. ft. and base price. Templates leave it out. */
  estimate?: {
    version: number;
    nextVersion: number;
    isDraft: boolean;
    status: string;
    basePrice: number | null;
    totalSqFt: number | null;
    /** Item List prices for lines tied to it ("Refresh prices from Item List"). */
    itemPrices: Record<string, number>;
    /** The job's Material list — where a takeoff line's detail is. */
    materialListHref: string;
    /** The takeoff items behind each takeoff line, by its takeoff key — the line's dropdown. */
    takeoffDetail?: Record<string, TakeoffDetailRow[]>;
  };
  save: (input: SaveSheetInput, mode: "over" | "new") => Promise<SaveResult>;
  /** Your divisions (Settings): which division each cost code category goes in, and their order. */
  filing: { map: Record<string, string>; order: string[] };
  /** Admins: edit your divisions from here (the same editor as Settings). */
  divisionsSetup?: { initial: DivisionSetup[]; categories: { name: string; codes: number }[] };
  /** Your estimate parameters (Settings), for quantity formulas. */
  parameters: ParamSetup[];
  /** The job's parameter values (job estimates only). */
  values?: Record<string, number>;
  /** Job estimates: saves the job's parameter values (when the Parameters panel closes). */
  saveValues?: (values: Record<string, number>) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Admins can edit the parameter list from the estimate. */
  canEditParameters?: boolean;
  /** Job estimates: whether new allowances include profit (company setting). */
  allowanceProfitDefault?: boolean;
  /** Where to go after "Save as new version" (the new estimate's id is added to the end). */
  newVersionHref?: string;
  /** The Markup, Margin & Tax table (profit rows fill new lines' profit %). */
  markupTable: MarkupRow[];
  /** Why the table can't change (approved, with change orders), or null. */
  markupLocked?: string | null;
  /** Locked by hand: shown as it is, no edits until it's unlocked. */
  locked?: boolean;
  /** Admins: "Save as my default". */
  saveMarkupDefault?: (rows: MarkupRow[]) => Promise<{ ok: true } | { ok: false; error: string }>;
};

// --- Columns (the eye button hides them; remembered on this computer) ---------------

const COLUMNS = [
  { key: "qty", label: "Qty", width: 100 },
  { key: "unit", label: "Units", width: 76 },
  { key: "unitCost", label: "Unit cost", width: 100 },
  { key: "extCost", label: "Ext. cost", width: 108 },
  { key: "costType", label: "Cost type", width: 132 },
  { key: "costCode", label: "Cost code", width: 210 },
  { key: "profitPct", label: "Profit %", width: 84 },
  { key: "profit", label: "Profit $", width: 104 },
  { key: "price", label: "Total price", width: 116 },
  { key: "perSqFt", label: "$ / sq. ft.", width: 92 },
  { key: "pctTotal", label: "% of total", width: 80 },
  { key: "notes", label: "Notes", width: 220 },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];

// Small things remembered on this computer: hidden columns, whether the cost code list is open.
const prefListeners = new Set<() => void>();
const prefCache = new Map<string, string>();
function readPref(key: string) {
  if (!prefCache.has(key)) {
    let v = "";
    try {
      v = localStorage.getItem(key) ?? "";
    } catch {
      /* storage blocked */
    }
    prefCache.set(key, v);
  }
  return prefCache.get(key)!;
}
function writePref(key: string, value: string) {
  prefCache.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked: just this visit */
  }
  for (const l of prefListeners) l();
}
function subscribePrefs(cb: () => void) {
  prefListeners.add(cb);
  return () => prefListeners.delete(cb);
}
function usePref(key: string) {
  return useSyncExternalStore(
    subscribePrefs,
    () => readPref(key),
    () => "",
  );
}
const HIDDEN_KEY = "estimate-hidden-columns";
const CODES_KEY = "estimate-cost-codes-open";
const writeHidden = (cols: string[]) => writePref(HIDDEN_KEY, cols.join(","));

let keySeq = 0;
const newKey = () => `new-${Date.now().toString(36)}-${++keySeq}`;

type Drag = { kind: "line"; key: string } | { kind: "spec"; key: string } | { kind: "category"; key: string } | { kind: "code"; key: string };
type DropTarget = { kind: "line" | "spec" | "category" | "specEnd"; key: string };

/**
 * The estimate, in the user's words: divisions → categories (the selections /
 * specifications) → items (the cost-coded lines). In code those are `category`,
 * spec items and lines. Change anything — totals update as you type — and nothing
 * is saved until "Save changes" (or thrown away with "Discard"). Drag the grips to
 * reorder; click a category's name for its details.
 */
export function EstimateSheet({
  viewKey,
  initial,
  costCodes,
  defaultMarkup,
  estimate,
  save,
  newVersionHref,
  filing,
  divisionsSetup,
  parameters,
  values,
  canEditParameters,
  saveValues,
  allowanceProfitDefault,
  markupTable,
  markupLocked = null,
  saveMarkupDefault,
  locked = false,
}: SheetProps) {
  const router = useRouter();
  const start = useMemo<SheetState>(
    () => ({ specs: initial, basePrice: estimate?.basePrice ?? null, totalSqFt: estimate?.totalSqFt ?? null, values: values ?? {}, markup: markupTable, dirty: false }),
    [initial, estimate?.basePrice, estimate?.totalSqFt, values, markupTable],
  );
  const [state, rawDispatch] = useReducer(sheetReducer, start, settleSheet);
  // A locked estimate is for looking: edits don't take.
  const dispatch = useMemo<React.Dispatch<SheetAction>>(() => (locked ? () => {} : rawDispatch), [locked]);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [openSpec, setOpenSpec] = useState<string | null>(null);
  const [focusLine, setFocusLine] = useState<string | null>(null);
  // The spec item clicks in the cost code list add to: the last one you worked in.
  const [target, setTarget] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [editingDivisions, setEditingDivisions] = useState(false);
  const [notNow, setNotNow] = useState(false);
  const [note] = useState(() => flash);
  useEffect(() => {
    flash = null;
  }, []);
  const codesOpen = usePref(CODES_KEY) === "1";
  // What's being dragged lives in a ref so the row handlers never change (rows don't re-render on drag).
  const dragRef = useRef<Drag | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [askSave, setAskSave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const hiddenRaw = usePref(HIDDEN_KEY);
  const hidden = useMemo(() => new Set(hiddenRaw.split(",").filter(Boolean)), [hiddenRaw]);
  const cols = COLUMNS.filter((c) => !hidden.has(c.key));
  const show = useCallback((k: ColKey) => !hidden.has(k), [hidden]);

  const totals = useMemo(() => specsTotals(state.specs), [state.specs]);
  // Overhead / tax rows of the Markup, Margin & Tax table, on top of the lines.
  const extras = useMemo(
    () =>
      tableExtras(
        state.markup,
        state.specs.flatMap((s) => s.lines),
      ),
    [state.markup, state.specs],
  );
  // "Use estimate total": the price before tax. With lines figured from the sales price
  // (realtor, liability), it's the price those lines are figured from — so it matches the
  // moment it's in, instead of moving them (and itself) again.
  const estimateTotal = useMemo(() => {
    const lines = state.specs.flatMap((s) => s.lines);
    return lines.some(usesSales) ? settleSales(lines, state.values, null, state.markup).sales : round2(totals.price + extras.overheadTotal);
  }, [state.specs, state.values, state.markup, totals.price, extras.overheadTotal]);
  const [markupOpen, setMarkupOpen] = useState(false);
  // A new line's profit %: the table's for its cost type, else the starting profit %.
  const markup = state.markup;
  const profitFor = useCallback((costType: string) => tableProfitPct(markup, costType) ?? defaultMarkup, [markup, defaultMarkup]);
  const groups = useMemo(() => byCategory(state.specs), [state.specs]);
  // What's open or collapsed, remembered on this computer for each estimate. The first time, it opens collapsed all the way.
  const viewPref = `estimate-view:${viewKey}`;
  const storedView = usePref(viewPref);
  const allCollapsed = useMemo(() => new Set([...groups.map(([c]) => `cat:${c}`), ...state.specs.map((s) => s.key)]), [groups, state.specs]);
  const collapsed = useMemo(() => {
    if (!storedView) return allCollapsed;
    try {
      return new Set<string>(JSON.parse(storedView));
    } catch {
      return allCollapsed;
    }
  }, [storedView, allCollapsed]);
  const setCollapsed = useCallback(
    (next: Set<string> | ((c: Set<string>) => Set<string>)) => {
      const n = typeof next === "function" ? next(collapsed) : next;
      if (n !== collapsed) writePref(viewPref, JSON.stringify(Array.from(n)));
    },
    [collapsed, viewPref],
  );
  const known = useMemo(
    () => ({ specIds: initial.flatMap((s) => (s.id ? [s.id] : [])), lineIds: initial.flatMap((s) => s.lines.flatMap((l) => (l.id ? [l.id] : []))) }),
    [initial],
  );
  // The job's sq. ft.: your "job sq. ft." parameter when you have one, else typed in here.
  const sqftValue = state.totalSqFt;
  const sqft = sqftValue && sqftValue > 0 ? sqftValue : null;
  const [paramsOpen, setParamsOpen] = useState<"values" | "list" | null>(null);
  // The job's values as last saved: closing the panel saves them if they changed.
  const [savedValues, setSavedValues] = useState<Record<string, number>>(() => values ?? {});
  const [valuesNote, setValuesNote] = useState<{ ok: boolean; text: string } | null>(null);
  const sameValues = (a: Record<string, number>, b: Record<string, number>) => {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
  };
  const paramsMode = (m: "values" | "list" | null) => {
    setParamsOpen(m);
    if (m !== null || !saveValues || sameValues(state.values, savedValues)) return;
    const next = state.values;
    setValuesNote({ ok: true, text: "Saving the job's parameters…" });
    void saveValues(next).then((r) => {
      if (r.ok) {
        setSavedValues(next);
        setValuesNote({ ok: true, text: "The job's parameters were saved." });
      } else setValuesNote({ ok: false, text: r.error });
    });
  };
  const materialListHref = estimate?.materialListHref ?? null;
  const takeoffDetail = estimate?.takeoffDetail ?? null;
  // Takeoff lines dropped down to show the takeoff items behind them.
  const [detailOpen, setDetailOpen] = useState<Set<string>>(() => new Set());
  const toggleDetail = useCallback((key: string) => {
    setDetailOpen((d) => {
      const n = new Set(d);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);
  const used = useMemo(() => new Set(state.specs.flatMap((s) => s.lines.flatMap((l) => (l.costCodeId ? [l.costCodeId] : [])))), [state.specs]);
  const targetSpec = target ? (state.specs.find((s) => s.key === target) ?? null) : null;

  /**
   * A cost line for a code. Dropped on a line (above it) or an item (at its end) it
   * goes there. Otherwise it goes into its division's spec item — "1000 Permits and
   * Fees" holds Legal Fees, Permit… — made (in `category`) if it isn't on the estimate yet.
   */
  const addFromCode = useCallback(
    (code: CostCode, where: { kind: "line" | "spec" | "category"; key: string } | null, opts: { category?: string; made?: Map<string, string> } = {}) => {
      const lineKey = newKey();
      const init = { costCodeId: code.id, description: code.name, costType: guessCostType(code.name) };
      const markupPct = profitFor(init.costType);
      if (where?.kind === "line") dispatch({ type: "addLine", spec: null, before: where.key, key: lineKey, markupPct, init });
      else if (where?.kind === "spec") dispatch({ type: "addLine", spec: where.key, key: lineKey, markupPct, init });
      else {
        const inCategory = where?.kind === "category" ? where.key : null;
        const name = code.division.trim();
        const madeKey = `${inCategory ?? ""}\u0000${name.toLowerCase()}`;
        let specKey =
          opts.made?.get(madeKey) ?? state.specs.find((s) => s.name.trim().toLowerCase() === name.toLowerCase() && (inCategory === null || s.category === inCategory))?.key;
        if (!specKey) {
          specKey = newKey();
          dispatch({ type: "addSpec", category: inCategory ?? (opts.category?.trim() || filing.map[code.division] || DEFAULT_CATEGORY), key: specKey, name });
          opts.made?.set(madeKey, specKey);
        }
        dispatch({ type: "addLine", spec: specKey, key: lineKey, markupPct, init });
      }
    },
    [profitFor, state.specs, filing.map, dispatch],
  );
  // "Organize by my divisions": per-code categories fold into their cost code category, and each goes in its division.
  const groupOfCode = useMemo(() => new Map(costCodes.map((c) => [c.id, c.division])), [costCodes]);
  const codeGroups = useMemo(() => Array.from(new Set(costCodes.map((c) => c.division))), [costCodes]);
  const organized = (map: Record<string, string>, order: string[]) => organizeSheet(state.specs, { groupOfCode, groups: codeGroups, divisionOf: map, order, newKey });
  const pending = useMemo(
    () => (filing.order.length ? organizeSheet(state.specs, { groupOfCode, groups: codeGroups, divisionOf: filing.map, order: filing.order, newKey }).changed : 0),
    [state.specs, groupOfCode, codeGroups, filing],
  );
  const organize = (map = filing.map, order = filing.order) => {
    const r = organized(map, order);
    if (r.changed) dispatch({ type: "setSpecs", specs: r.specs });
  };
  const clickCode = (code: CostCode) => {
    if (targetSpec) {
      addFromCode(code, { kind: "spec", key: targetSpec.key });
      setCollapsed((c) => {
        if (!c.has(targetSpec.key)) return c;
        const n = new Set(c);
        n.delete(targetSpec.key);
        return n;
      });
    } else addFromCode(code, null);
  };
  const addPicked = (codes: CostCode[], category: string) => {
    const made = new Map<string, string>();
    for (const c of codes) addFromCode(c, null, { category, made });
    setPicking(false);
  };

  // --- Drag and drop: lines onto lines / items; items onto items / categories; categories onto categories.
  const onDragStart = useCallback((d: Drag, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", d.key);
    const row = (e.currentTarget as Element).closest("tr");
    if (row) e.dataTransfer.setDragImage(row, 16, 16);
    dragRef.current = d;
  }, []);
  const onDragOver = useCallback((t: DropTarget, e: React.DragEvent) => {
    if (!accepts(dragRef.current, t)) return;
    e.preventDefault();
    setOver(`${t.kind}:${t.key}`);
  }, []);
  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    setOver(null);
  }, []);
  const onDrop = useCallback(
    (t: DropTarget, e: React.DragEvent) => {
      e.preventDefault();
      const d = dragRef.current;
      dragRef.current = null;
      setOver(null);
      if (!d || !accepts(d, t)) return;
      if (d.kind === "code") {
        const code = costCodes.find((c) => c.id === d.key);
        if (code) addFromCode(code, { kind: t.kind === "specEnd" ? "spec" : t.kind, key: t.key });
      } else dispatch(dropAction(d, t));
    },
    [costCodes, addFromCode, dispatch],
  );
  const onDragCode = useCallback((code: CostCode, e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", code.name);
    dragRef.current = { kind: "code", key: code.id };
  }, []);
  const ctx = useMemo<RowCtx>(
    () => ({
      show,
      total: totals.price,
      sqft,
      costCodes,
      dispatch,
      onDragStart,
      onDragOver,
      onDragEnd,
      onDrop,
      setTarget,
      materialListHref,
      // "Sales price" first in every ƒ picker (job estimates).
      params: estimate ? [SALES_PARAM, ...parameters] : parameters,
      values: state.sales === undefined ? state.values : { ...state.values, [SALES_ID]: state.sales },
      takeoffDetail,
      toggleDetail,
      colCount: cols.length + 3,
    }),
    [
      show,
      totals.price,
      sqft,
      costCodes,
      onDragStart,
      onDragOver,
      onDragEnd,
      onDrop,
      materialListHref,
      estimate,
      parameters,
      state.values,
      state.sales,
      takeoffDetail,
      toggleDetail,
      cols.length,
      dispatch,
    ],
  );
  const dropProps = (t: DropTarget) => ({ onDragOver: (e: React.DragEvent) => onDragOver(t, e), onDrop: (e: React.DragEvent) => onDrop(t, e) });
  const dragProps = (d: Drag) => ({ draggable: true, onDragStart: (e: React.DragEvent) => onDragStart(d, e), onDragEnd });
  const dropLine = (t: DropTarget) => (over === `${t.kind}:${t.key}` ? DROP_LINE : "");

  // Leaving with unsaved changes asks first (reload / close, and links inside the app).
  const dirty = state.dirty;
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    const click = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || a.getAttribute("target") === "_blank" || a.getAttribute("href")?.startsWith("#")) return;
      if (!window.confirm("You have unsaved changes on this estimate. Leave without saving?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", click, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", click, true);
    };
  }, [dirty]);

  const toggle = useCallback(
    (key: string) => {
      setCollapsed((c) => {
        const n = new Set(c);
        if (n.has(key)) n.delete(key);
        else n.add(key);
        return n;
      });
    },
    [setCollapsed],
  );
  const pick = useCallback((keys: string[], on: boolean) => {
    setPicked((p) => {
      const n = new Set(p);
      for (const k of keys) {
        if (on) n.add(k);
        else n.delete(k);
      }
      return n;
    });
  }, []);
  const addLine = useCallback(
    (spec: string) => {
      const key = newKey();
      // A category whose items all share one cost code (4570 Garage Doors): the new item starts with it too.
      const lines = state.specs.find((s) => s.key === spec)?.lines ?? [];
      const codes = new Set(lines.map((l) => l.costCodeId));
      const costCodeId = codes.size === 1 ? (lines[0]?.costCodeId ?? null) : null;
      dispatch({ type: "addLine", spec, key, markupPct: profitFor("MATERIAL"), init: costCodeId ? { costCodeId } : undefined });
      setFocusLine(key);
      setTarget(spec);
      setCollapsed((c) => {
        if (!c.has(spec)) return c;
        const n = new Set(c);
        n.delete(spec);
        return n;
      });
    },
    [profitFor, setCollapsed, state.specs, dispatch],
  );
  const addSpec = (category: string) => {
    const key = newKey();
    dispatch({ type: "addSpec", category, key });
    setOpenSpec(key);
    setTarget(key);
  };
  const addCategory = () => {
    const names = new Set(state.specs.map((s) => s.category));
    let name = "New division";
    for (let i = 2; names.has(name); i++) name = `New division ${i}`;
    addSpec(name);
  };

  // --- Save / discard ---------------------------------------------------------------
  const doSave = (mode: "over" | "new") => {
    setError(null);
    startSaving(async () => {
      const r = await save(
        toSaveInput(state.specs, known, {
          basePrice: state.basePrice,
          totalSqFt: sqftValue && sqftValue > 0 ? sqftValue : null,
          parameterValues: estimate ? state.values : undefined,
          markupTable: markupLocked ? undefined : state.markup,
        }),
        mode,
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAskSave(false);
      if (r.learned?.length) flash = `Your divisions were updated: ${r.learned.join(", ")}`;
      // Fresh data comes back from the server and replaces this screen's copy.
      dispatch({ type: "reset", state: { ...state, dirty: false } });
      if (r.estimateId && newVersionHref && mode === "new") router.push(newVersionHref + r.estimateId);
      else router.refresh();
    });
  };
  const onSaveClick = () => {
    if (!estimate) doSave("over");
    else setAskSave(true);
  };
  const discard = () => {
    if (window.confirm("Throw away every change since the last save?")) {
      dispatch({ type: "reset", state: start });
      // The job's parameter values were already saved: keep them (and the quantities they give).
      for (const id of new Set([...Object.keys(start.values), ...Object.keys(savedValues)]))
        if (start.values[id] !== savedValues[id]) dispatch({ type: "paramValue", id, value: savedValues[id] ?? null });
      setPicked(new Set());
      setError(null);
    }
  };

  const pickedLines = Array.from(picked);
  const allKeys = state.specs.flatMap((s) => [s.key, ...s.lines.map((l) => l.key)]);
  const open = openSpec ? state.specs.find((s) => s.key === openSpec) : null;
  const tableWidth = 52 + 340 + cols.reduce((n, c) => n + c.width, 0) + 44;
  const colCount = cols.length + 3;

  return (
    <div className="space-y-3">
      {/* Toolbar — one fixed-height row; its contents change, its size doesn't. */}
      <div className="flex h-10 items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" className={buttonClasses("secondary", "sm")} onClick={addCategory}>
            <Plus className="h-3.5 w-3.5" /> Division
          </button>
          <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => setCollapsed(new Set())}>
            Expand all
          </button>
          <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => setCollapsed(allCollapsed)}>
            Collapse all
          </button>
        </div>
        <div className="flex items-center gap-2">
          {divisionsSetup ? (
            <button
              type="button"
              className={buttonClasses("secondary", "sm")}
              onClick={() => setEditingDivisions(true)}
              title="Your divisions and the categories in each (same as Settings)"
            >
              <FolderTree className="h-3.5 w-3.5" /> Divisions
            </button>
          ) : null}
          <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => setPicking(true)} title="Tick cost codes to add as categories">
            <ListChecks className="h-3.5 w-3.5" /> Add from cost codes
          </button>
          <button
            type="button"
            className={cn(buttonClasses("secondary", "sm"), codesOpen && "border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100")}
            aria-pressed={codesOpen}
            onClick={() => writePref(CODES_KEY, codesOpen ? "" : "1")}
          >
            <BookOpen className="h-3.5 w-3.5" /> Cost codes
          </button>
          <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => setMarkupOpen(true)} title="Profit, overhead and tax for this estimate">
            <Percent className="h-3.5 w-3.5" /> Markup &amp; tax
          </button>
          {estimate ? (
            <button
              type="button"
              className={buttonClasses("secondary", "sm")}
              onClick={() => paramsMode("values")}
              title="This job's numbers that item quantities and unit costs use"
            >
              <Calculator className="h-3.5 w-3.5" /> Parameters
            </button>
          ) : null}
          <ColumnPicker hidden={hidden} />
        </div>
      </div>

      {pending > 0 && !notNow ? (
        <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1 text-sm text-amber-900">
          <FolderTree className="h-4 w-4 shrink-0" />
          <span
            className="min-w-0 flex-1 truncate"
            title="Organizing folds single cost codes into their category (e.g. Legal Fees and Permit into 1000 Permits and Fees) and puts each category in its division."
          >
            <b className="font-semibold">
              {pending} categor{pending === 1 ? "y isn't" : "ies aren't"} organized by your divisions
            </b>
            <span className="text-xs"> — Organize tucks single cost codes into their category and each category into its division.</span>
          </span>
          <button type="button" className={buttonClasses("primary", "sm", "h-7")} onClick={() => organize()}>
            Organize
          </button>
          <button type="button" className={buttonClasses("ghost", "sm", "h-7")} onClick={() => setNotNow(true)}>
            Not now
          </button>
        </div>
      ) : null}

      <div className="flex items-start gap-3">
        {/* Its own window, sized to the screen: the sideways scrollbar is always in view (just above
            the bottom bar) and the column headings stay at the top — no trip to the end of the estimate. */}
        <div className="max-h-[calc(100vh-12.5rem-var(--job-head,0px))] min-w-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          {groups.length === 0 ? (
            // Outside the table, so it sits in the middle of what you can see.
            <div className="px-4 py-14 text-center">
              <p className="text-sm font-medium text-slate-800">Nothing on this estimate yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                Pick the cost codes this job needs — each cost code category becomes a category (your selection/specification) with its codes as items, filed in your divisions. You
                can add more any time from the Cost codes list.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button type="button" className={buttonClasses("primary")} onClick={() => setPicking(true)}>
                  <ListChecks className="h-4 w-4" /> Start from my cost codes
                </button>
                <button type="button" className={buttonClasses("secondary")} onClick={addCategory}>
                  <Plus className="h-4 w-4" /> Blank division
                </button>
              </div>
              <p className="mt-3 text-xs text-slate-400">Items can also come from the takeoff (Send to estimate) or a template.</p>
            </div>
          ) : (
            <table
              className={cn("table-fixed text-left text-sm", locked && "[&_input]:pointer-events-none [&_select]:pointer-events-none")}
              style={{ width: "100%", minWidth: tableWidth }}
              onKeyDown={moveByArrow}
            >
              <colgroup>
                <col style={{ width: 52 }} />
                <col />
                {cols.map((c) => (
                  <col key={c.key} style={{ width: c.width }} />
                ))}
                <col style={{ width: 44 }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-[0_1px_0_0_var(--color-slate-200)]">
                <tr>
                  <th className="px-2 py-2.5">
                    <input
                      type="checkbox"
                      aria-label="Pick everything"
                      className="h-3.5 w-3.5 rounded border-slate-300"
                      checked={allKeys.length > 0 && allKeys.every((k) => picked.has(k))}
                      onChange={(e) => pick(allKeys, e.target.checked)}
                    />
                  </th>
                  <th className="px-2 py-2.5 font-medium">Description</th>
                  {cols.map((c) => (
                    <th key={c.key} className={cn("px-2 py-2.5 font-medium", isNumCol(c.key) && "text-right")}>
                      {c.label}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              {groups.map(([category, specs]) => {
                const catKey = `cat:${category}`;
                const catLines = specs.flatMap((s) => s.lines);
                const catKeys = specs.flatMap((s) => [s.key, ...s.lines.map((l) => l.key)]);
                const catCollapsed = collapsed.has(catKey);
                return (
                  <tbody key={category} className="border-t border-slate-200">
                    <tr className={cn("bg-slate-50", dropLine({ kind: "category", key: category }))} {...dropProps({ kind: "category", key: category })}>
                      <td className="px-2 py-2">
                        <span className="flex items-center gap-1">
                          <input
                            type="checkbox"
                            aria-label={`Pick everything in ${category}`}
                            className="h-3.5 w-3.5 rounded border-slate-300"
                            checked={catKeys.every((k) => picked.has(k))}
                            onChange={(e) => pick(catKeys, e.target.checked)}
                          />
                          <span {...dragProps({ kind: "category", key: category })} title="Drag to move this division" className="cursor-grab text-slate-300 hover:text-slate-500">
                            <GripVertical className="h-4 w-4" />
                          </span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => toggle(catKey)}
                            className="rounded p-0.5 text-slate-500 hover:bg-slate-200"
                            aria-label={catCollapsed ? "Expand" : "Collapse"}
                          >
                            {catCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </button>
                          <CategoryName name={category} onRename={(to) => dispatch({ type: "renameCategory", from: category, to })} />
                          <span className="shrink-0 text-xs font-normal text-slate-400">
                            {specs.length} categor{specs.length === 1 ? "y" : "ies"}
                          </span>
                        </span>
                      </td>
                      <TotalsCells ctx={ctx} t={linesTotals(catLines)} strong />
                      <td className="px-1">
                        <RowMenu
                          label={`${category} options`}
                          items={[
                            { label: "Add category", onClick: () => addSpec(category) },
                            { label: "Delete division", danger: true, onClick: () => dispatch({ type: "deleteCategory", category }) },
                          ]}
                        />
                      </td>
                    </tr>
                    {catCollapsed
                      ? null
                      : specs.map((s) => {
                          const specCollapsed = collapsed.has(s.key);
                          const specKeys = [s.key, ...s.lines.map((l) => l.key)];
                          const linked = s.lines.some((l) => l.fromTakeoff || l.materialItemId);
                          const refreshable = estimate ? s.lines.some((l) => l.materialItemId && estimate.itemPrices[l.materialItemId] !== undefined) : false;
                          // One line: the item and its line share a row (no "Blueprints" under "Blueprints").
                          const single = s.lines.length === 1 ? s.lines[0] : null;
                          // No items: it looks empty (no arrow, no $0 totals) and says so.
                          const empty = s.lines.length === 0;
                          return (
                            <SpecRows key={s.key}>
                              <tr
                                className={cn(
                                  "group/spec border-t border-slate-100 hover:bg-slate-50/60",
                                  codesOpen && target === s.key && "bg-blue-50/70 shadow-[inset_3px_0_0_0_var(--color-blue-600)] hover:bg-blue-50/70",
                                  dropLine({ kind: "spec", key: s.key }),
                                )}
                                onClick={() => setTarget(s.key)}
                                onFocus={() => setTarget(s.key)}
                                {...dropProps({ kind: "spec", key: s.key })}
                              >
                                <td className="px-2 py-1.5">
                                  <span className="flex items-center gap-1">
                                    <input
                                      type="checkbox"
                                      aria-label={`Pick ${s.name}`}
                                      className="h-3.5 w-3.5 rounded border-slate-300"
                                      checked={specKeys.every((k) => picked.has(k))}
                                      onChange={(e) => pick(specKeys, e.target.checked)}
                                    />
                                    <span
                                      {...dragProps({ kind: "spec", key: s.key })}
                                      title="Drag to move this category"
                                      className="cursor-grab text-slate-300 hover:text-slate-500"
                                    >
                                      <GripVertical className="h-4 w-4" />
                                    </span>
                                  </span>
                                </td>
                                <td className="relative py-1.5 pl-6 pr-2">
                                  <span className="flex min-w-0 items-center gap-1">
                                    {single || empty ? (
                                      <span className="w-5 shrink-0" />
                                    ) : (
                                      <button
                                        type="button"
                                        onClick={() => toggle(s.key)}
                                        className="rounded p-0.5 text-slate-400 hover:bg-slate-100"
                                        aria-label={specCollapsed ? "Expand" : "Collapse"}
                                      >
                                        {specCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => setOpenSpec(s.key)}
                                      className="min-w-0 truncate text-left font-semibold text-slate-900 hover:text-blue-700 hover:underline"
                                      title={`${s.name || "Untitled category"} — click for details`}
                                      data-cell
                                    >
                                      {s.name || "Untitled category"}
                                    </button>
                                    <SpecBadges spec={s} />
                                    {single ? <LinkIcon line={single} ctx={ctx} open={detailOpen.has(single.key)} /> : null}
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        addLine(s.key);
                                      }}
                                      // Floats over the end of the cell on hover, so it never takes room from the name.
                                      className="pointer-events-none absolute right-1 top-1/2 inline-flex -translate-y-1/2 items-center gap-0.5 rounded bg-white px-1.5 py-0.5 text-xs font-medium text-slate-500 opacity-0 shadow-sm ring-1 ring-slate-200 hover:text-blue-700 focus:pointer-events-auto focus:opacity-100 group-hover/spec:pointer-events-auto group-hover/spec:opacity-100"
                                      title={single ? "Add another item to this category (it splits into separate item rows)" : "Add an item to this category"}
                                    >
                                      <Plus className="h-3 w-3" /> Add item
                                    </button>
                                  </span>
                                </td>
                                {single ? (
                                  <LineCells line={single} spec={s.key} ctx={ctx} />
                                ) : empty ? (
                                  <td colSpan={cols.length} className="px-2 py-1.5 text-xs italic text-slate-400">
                                    No items yet —{" "}
                                    <button type="button" className="font-medium not-italic text-blue-700 hover:underline" onClick={() => addLine(s.key)}>
                                      + Add item
                                    </button>
                                  </td>
                                ) : (
                                  <TotalsCells ctx={ctx} t={linesTotals(s.lines)} />
                                )}
                                <td className="px-1">
                                  <RowMenu
                                    label={`${s.name} options`}
                                    items={[
                                      { label: "Edit details", onClick: () => setOpenSpec(s.key) },
                                      { label: "Add item", hint: single ? "Splits this category into separate item rows" : undefined, onClick: () => addLine(s.key) },
                                      ...(single
                                        ? [
                                            {
                                              label: single.isOptional ? "Include in the price" : "Make optional (not in the price)",
                                              onClick: () => dispatch({ type: "line", spec: s.key, line: single.key, patch: { isOptional: !single.isOptional } }),
                                            },
                                          ]
                                        : []),
                                      { label: "Duplicate", onClick: () => dispatch({ type: "duplicateSpec", spec: s.key, key: newKey(), lineKeys: s.lines.map(() => newKey()) }) },
                                      ...(estimate
                                        ? [
                                            {
                                              label: "Add these items to the Item List",
                                              hint: "On save, items not in the Item List are added to it",
                                              onClick: () =>
                                                dispatch({
                                                  type: "specLines",
                                                  spec: s.key,
                                                  patch: (l: SheetLine) => (l.materialItemId || !l.description ? {} : { addToItemList: true }),
                                                }),
                                            },
                                            ...(refreshable
                                              ? [
                                                  {
                                                    label: "Refresh prices from Item List",
                                                    onClick: () =>
                                                      dispatch({
                                                        type: "specLines",
                                                        spec: s.key,
                                                        patch: (l: SheetLine) =>
                                                          l.materialItemId && estimate.itemPrices[l.materialItemId] !== undefined
                                                            ? { unitCost: estimate.itemPrices[l.materialItemId] }
                                                            : {},
                                                      }),
                                                  },
                                                ]
                                              : []),
                                            ...(linked
                                              ? [
                                                  {
                                                    label: "Stop updating from Item List",
                                                    hint: "The takeoff and Item List stop changing these items",
                                                    onClick: () =>
                                                      dispatch({
                                                        type: "specLines",
                                                        spec: s.key,
                                                        patch: () => ({ fromTakeoff: false, materialItemId: null, addToItemList: false }),
                                                      }),
                                                  },
                                                ]
                                              : []),
                                          ]
                                        : []),
                                      { label: "Delete category", danger: true, onClick: () => dispatch({ type: "deleteSpec", spec: s.key }) },
                                    ]}
                                  />
                                </td>
                              </tr>
                              {single && detailOpen.has(single.key) ? <TakeoffDetail line={single} ctx={ctx} /> : null}
                              {specCollapsed || single || empty ? null : (
                                <>
                                  {s.lines.map((l) => (
                                    <LineRow
                                      key={l.key}
                                      line={l}
                                      spec={s.key}
                                      ctx={ctx}
                                      picked={picked.has(l.key)}
                                      onPick={pick}
                                      autoFocus={focusLine === l.key}
                                      dropHere={over === `line:${l.key}`}
                                      detailOpen={detailOpen.has(l.key)}
                                    />
                                  ))}
                                  <tr className={dropLine({ kind: "specEnd", key: s.key })} {...dropProps({ kind: "specEnd", key: s.key })}>
                                    <td />
                                    <td colSpan={colCount - 1} className="pb-1.5 pl-14">
                                      <button
                                        type="button"
                                        onClick={() => addLine(s.key)}
                                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                                      >
                                        <Plus className="h-3 w-3" /> Add item
                                      </button>
                                    </td>
                                  </tr>
                                </>
                              )}
                            </SpecRows>
                          );
                        })}
                    {catCollapsed ? null : (
                      <tr>
                        <td />
                        <td colSpan={colCount - 1} className="pb-2 pl-7">
                          <button
                            type="button"
                            onClick={() => addSpec(category)}
                            className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-blue-700"
                          >
                            <Plus className="h-3 w-3" /> Add category to {category}
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
          )}
        </div>
        {codesOpen ? (
          <CostCodePanel
            codes={costCodes}
            used={used}
            target={targetSpec ? { name: targetSpec.name, category: targetSpec.category } : null}
            onAdd={clickCode}
            onDragCode={onDragCode}
            onDragEnd={onDragEnd}
            onClearTarget={() => setTarget(null)}
            onClose={() => writePref(CODES_KEY, "")}
          />
        ) : null}
      </div>

      {/* Bottom bar: always the same size, so nothing jumps when you start editing. */}
      <div className="sticky bottom-0 z-20 -mx-1 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 shadow-[0_-4px_12px_-6px_rgba(15,23,42,0.15)] backdrop-blur">
        {/* Ticked items: their bar floats right above this one, so it's there wherever you're working. */}
        {pickedLines.length ? (
          <div className="absolute -top-12 left-1/2 -translate-x-1/2 rounded-lg shadow-lg">
            <BulkBar keys={pickedLines} specs={state.specs} costCodes={costCodes} dispatch={dispatch} clear={() => setPicked(new Set())} />
          </div>
        ) : null}
        <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
          {estimate ? (
            <label className="block">
              <span className="label !mb-0.5">Total sq. ft.</span>
              <NumCell
                value={sqftValue ?? 0}
                blankZero
                ariaLabel="Total square feet"
                className="!w-28 border-slate-300 bg-white text-right"
                onChange={(v) => dispatch({ type: "header", patch: { totalSqFt: v > 0 ? v : null } })}
              />
            </label>
          ) : null}
          <Figure label="Est. cost" value={money(totals.cost)} hint={sqft ? `${money(totals.cost / sqft)} / sq. ft.` : undefined} />
          <Figure label="Est. profit" value={money(totals.profit)} hint={totals.cost > 0 ? `${num((totals.profit / totals.cost) * 100, 1)}% on cost` : undefined} />
          {extras.overheadTotal ? <Figure label="Overhead" value={money(extras.overheadTotal)} /> : null}
          {extras.taxTotal ? <Figure label="Tax" value={money(extras.taxTotal)} /> : null}
          <Figure
            label="Est. total"
            value={money(totals.price + extras.total)}
            strong
            hint={[sqft ? `${money((totals.price + extras.total) / sqft)} / sq. ft.` : "", extras.taxTotal ? "with tax" : ""].filter(Boolean).join(" · ") || undefined}
          />
          {estimate ? (
            <div>
              <span className="label !mb-0.5">Base price</span>
              <span className="flex items-center gap-1.5">
                <NumCell
                  value={state.basePrice ?? 0}
                  blankZero
                  money
                  ariaLabel="Base price"
                  placeholder="Not set"
                  className="!w-36 border-slate-300 bg-white text-right font-semibold"
                  onChange={(v) => dispatch({ type: "header", patch: { basePrice: v > 0 ? v : null } })}
                />
                <button
                  type="button"
                  className={buttonClasses("ghost", "sm")}
                  title={extras.taxTotal ? "Put the estimate total (before tax — tax is added on top) in the base price" : "Put the estimate total in the base price"}
                  disabled={state.basePrice !== null && Math.abs(state.basePrice - estimateTotal) < 0.005}
                  onClick={() => dispatch({ type: "header", patch: { basePrice: estimateTotal } })}
                >
                  Use estimate total
                </button>
              </span>
              <BaseNote basePrice={state.basePrice} sqft={sqft} totals={{ ...totals, price: totals.price + extras.overheadTotal }} />
            </div>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <span className={cn("text-xs", error ? "text-rose-700" : "text-amber-700")}>
              {error ?? (locked ? "Locked — unlock it to make changes" : state.dirty ? "Not saved yet" : "")}
            </span>
            {valuesNote && !error ? (
              <span className={cn("max-w-xs truncate text-xs", valuesNote.ok ? "text-emerald-700" : "text-rose-700")} title={valuesNote.text}>
                {valuesNote.text}
              </span>
            ) : null}
            {!error && !state.dirty && note ? (
              <span className="max-w-md truncate text-xs text-emerald-700" title={note}>
                {note}
              </span>
            ) : null}
            <button type="button" className={buttonClasses("secondary")} disabled={!state.dirty || saving} onClick={discard}>
              Discard
            </button>
            <button
              type="button"
              className={buttonClasses("primary")}
              disabled={!state.dirty || saving}
              title={state.dirty ? undefined : "Change something first"}
              onClick={onSaveClick}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <SpecPanel
          spec={open}
          categories={groups.map(([c]) => c)}
          totals={linesTotals(open.lines)}
          proposal={!!estimate}
          allowanceProfitDefault={estimate ? (allowanceProfitDefault ?? false) : undefined}
          allowanceExtra={allowanceExtras(state.markup, open.lines)}
          onChange={(patch) => dispatch({ type: "spec", spec: open.key, patch })}
          onClose={() => setOpenSpec(null)}
          onDelete={() => {
            dispatch({ type: "deleteSpec", spec: open.key });
            setOpenSpec(null);
          }}
        />
      ) : null}

      {markupOpen ? (
        <MarkupPanel
          rows={state.markup}
          amounts={Object.fromEntries(extras.rows.map((x) => [x.row.id, x.amount]))}
          costCodes={costCodes}
          locked={markupLocked}
          saveDefault={saveMarkupDefault}
          onChange={(rows) => dispatch({ type: "markup", rows })}
          onClose={() => setMarkupOpen(false)}
        />
      ) : null}

      {paramsOpen ? (
        <ParametersPanel
          mode={paramsOpen}
          parameters={parameters}
          values={state.values}
          specs={state.specs}
          canEdit={!!canEditParameters}
          onValue={(id, value) => dispatch({ type: "paramValue", id, value })}
          onMode={paramsMode}
        />
      ) : null}

      {editingDivisions && divisionsSetup ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Your divisions">
          <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-slate-900/20" onClick={() => setEditingDivisions(false)} />
          <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-slate-50 shadow-2xl">
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
              <h2 className="text-base font-semibold text-slate-900">Your divisions</h2>
              <button type="button" onClick={() => setEditingDivisions(false)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="flex-1 overflow-y-auto p-5">
              <DivisionsForm
                compact
                initial={divisionsSetup.initial}
                categories={divisionsSetup.categories}
                onSaved={(saved) => {
                  const map: Record<string, string> = {};
                  for (const d of saved) for (const c of d.divisions) map[c] = d.name;
                  organize(
                    map,
                    saved.map((d) => d.name),
                  );
                  setNotNow(false);
                  setEditingDivisions(false);
                }}
              />
            </div>
          </aside>
        </div>
      ) : null}

      {picking ? (
        <CodePicker
          codes={costCodes}
          used={used}
          categories={Array.from(new Set([...filing.order, ...groups.map(([c]) => c)]))}
          byCategories={filing.order.length > 0}
          onConfirm={addPicked}
          onCancel={() => setPicking(false)}
        />
      ) : null}

      {askSave && estimate ? <SaveDialog estimate={estimate} saving={saving} error={error} onCancel={() => setAskSave(false)} onSave={doSave} /> : null}
    </div>
  );
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Where new spec items go until you file them in your own categories. */
const DEFAULT_CATEGORY = "General";
const DROP_LINE = "shadow-[inset_0_2px_0_0_var(--color-blue-600)]";

function accepts(d: Drag | null, t: DropTarget) {
  if (!d) return false;
  if (d.kind === "code") return true;
  if (d.kind === "line") return t.kind !== "category";
  if (d.kind === "spec") return t.kind === "spec" || t.kind === "category";
  return t.kind === "category";
}

/** Dropping a line on a line puts it above that line; on an item (or its "Add line" row), at the end of it. */
function dropAction(d: Drag & { kind: "line" | "spec" | "category" }, t: DropTarget): SheetAction {
  if (d.kind === "line") return t.kind === "line" ? { type: "moveLine", line: d.key, toSpec: null, before: t.key } : { type: "moveLine", line: d.key, toSpec: t.key, before: null };
  if (d.kind === "spec")
    return t.kind === "spec" ? { type: "moveSpec", spec: d.key, toCategory: null, before: t.key } : { type: "moveSpec", spec: d.key, toCategory: t.key, before: null };
  return { type: "moveCategory", category: d.key, before: t.key };
}
const isNumCol = (k: ColKey) => k !== "unit" && k !== "costType" && k !== "costCode" && k !== "notes";

/** Lets the spec header, its lines and its "Add line" row sit together without an extra element. */
function SpecRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

type RowCtx = {
  show: (k: ColKey) => boolean;
  total: number;
  sqft: number | null;
  costCodes: CostCode[];
  dispatch: React.Dispatch<SheetAction>;
  onDragStart: (d: Drag, e: React.DragEvent) => void;
  onDragOver: (t: DropTarget, e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (t: DropTarget, e: React.DragEvent) => void;
  /** Working in an item makes it where the cost code list adds lines. */
  setTarget: (spec: string) => void;
  materialListHref: string | null;
  takeoffDetail: Record<string, TakeoffDetailRow[]> | null;
  toggleDetail: (lineKey: string) => void;
  colCount: number;
  params: ParamSetup[];
  values: Record<string, number>;
};

/** Category and spec item rows: only the money columns have anything in them. */
function TotalsCells({ ctx, t, strong }: { ctx: RowCtx; t: Totals; strong?: boolean }) {
  const cell = cn("px-2 py-1.5 text-right tabular-nums", strong ? "font-semibold text-slate-900" : "font-medium text-slate-700");
  return (
    <>
      {COLUMNS.filter((c) => ctx.show(c.key)).map((c) => {
        switch (c.key) {
          case "extCost":
            return (
              <td key={c.key} className={cell}>
                {money(t.cost)}
              </td>
            );
          case "profit":
            return (
              <td key={c.key} className={cell}>
                {money(t.profit)}
              </td>
            );
          case "price":
            return (
              <td key={c.key} className={cell}>
                {money(t.price)}
              </td>
            );
          case "perSqFt":
            return (
              <td key={c.key} className={cn(cell, "text-slate-500")}>
                {ctx.sqft ? money(t.price / ctx.sqft) : ""}
              </td>
            );
          case "pctTotal":
            return (
              <td key={c.key} className={cn(cell, "text-slate-500")}>
                {ctx.total ? `${num((t.price / ctx.total) * 100, 1)}%` : ""}
              </td>
            );
          default:
            return <td key={c.key} />;
        }
      })}
    </>
  );
}

/** Small marks after a category's name (the word shows on hover) — the name keeps the room. */
function SpecBadges({ spec }: { spec: SheetSpec }) {
  const mark = "inline-flex h-4 w-4 items-center justify-center rounded ring-1 ring-inset";
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {spec.isAllowance ? (
        <span className={cn(mark, "bg-amber-50 text-amber-700 ring-amber-200")} title="Allowance" aria-label="Allowance">
          <CircleDollarSign className="h-3 w-3" />
        </span>
      ) : null}
      {spec.kind === "SELECTION" ? (
        <span className={cn(mark, "bg-violet-50 text-violet-700 ring-violet-200")} title="Selection — the client picks" aria-label="Selection">
          <ListChecks className="h-3 w-3" />
        </span>
      ) : null}
      {spec.urgent ? (
        <span className={cn(mark, "bg-rose-50 text-rose-700 ring-rose-200")} title="Urgent" aria-label="Urgent">
          <AlertTriangle className="h-3 w-3" />
        </span>
      ) : null}
      {spec.requestedBy ? <span className="text-[11px] text-slate-500">by {shortDate(spec.requestedBy)}</span> : null}
    </span>
  );
}

function shortDate(ymd: string) {
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

type LineRowProps = {
  line: SheetLine;
  spec: string;
  ctx: RowCtx;
  picked: boolean;
  onPick: (keys: string[], on: boolean) => void;
  autoFocus: boolean;
  dropHere: boolean;
  /** Its takeoff items are dropped down. */
  detailOpen: boolean;
};

/** A line's editable cells, from Qty to Notes. */
function LineCells({ line: l, spec, ctx }: { line: SheetLine; spec: string; ctx: RowCtx }) {
  const { show, dispatch } = ctx;
  const set = (patch: Partial<SheetLine>) => dispatch({ type: "line", spec, line: l.key, patch });
  const m = lineMath(l);
  const muted = l.isOptional ? "text-slate-400" : "";
  return (
    <>
      {show("qty") ? (
        <td className="px-1 py-0.5">
          <QtyCell
            value={l.quantity}
            formula={l.qtyFormula}
            params={ctx.params}
            values={ctx.values}
            onNumber={(v) => set({ quantity: v })}
            onFormula={(qtyFormula) => set({ qtyFormula })}
          />
        </td>
      ) : null}
      {show("unit") ? (
        <td className="px-1 py-0.5">
          <UnitCell value={l.unit} onChange={(unit) => set({ unit })} />
        </td>
      ) : null}
      {show("unitCost") ? (
        <td className="px-1 py-0.5">
          <QtyCell
            money
            ariaLabel="Unit cost"
            value={l.unitCost}
            formula={l.costFormula}
            params={ctx.params}
            values={ctx.values}
            onNumber={(v) => set({ unitCost: v })}
            onFormula={(costFormula) => set({ costFormula })}
          />
        </td>
      ) : null}
      {show("extCost") ? <td className={cn("px-2 py-0.5 text-right tabular-nums", muted)}>{money(m.cost)}</td> : null}
      {show("costType") ? (
        <td className="px-1 py-0.5">
          <select className={cellClass} value={l.costType} aria-label="Cost type" onChange={(e) => set({ costType: e.target.value })}>
            {COST_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </td>
      ) : null}
      {show("costCode") ? (
        <td className="px-1 py-0.5">
          <CostCodeCell value={l.costCodeId} costCodes={ctx.costCodes} onChange={(costCodeId) => set({ costCodeId })} />
        </td>
      ) : null}
      {show("profitPct") ? (
        <td className="px-1 py-0.5">
          <NumCell value={l.markupPct} ariaLabel="Profit %" className="text-right" onChange={(v) => set({ markupPct: v })} />
        </td>
      ) : null}
      {show("profit") ? <td className={cn("px-2 py-0.5 text-right tabular-nums", muted)}>{money(m.profit)}</td> : null}
      {show("price") ? <td className={cn("px-2 py-0.5 text-right font-medium tabular-nums text-slate-900", muted)}>{money(m.price)}</td> : null}
      {show("perSqFt") ? <td className="px-2 py-0.5 text-right tabular-nums text-slate-500">{ctx.sqft ? money(m.price / ctx.sqft) : ""}</td> : null}
      {show("pctTotal") ? (
        <td className="px-2 py-0.5 text-right tabular-nums text-slate-500">{ctx.total && !l.isOptional ? `${num((m.price / ctx.total) * 100, 1)}%` : ""}</td>
      ) : null}
      {show("notes") ? (
        <td className="px-1 py-0.5">
          <input className={cellClass} value={l.notes} placeholder="—" aria-label="Notes" onChange={(e) => set({ notes: e.target.value })} />
        </td>
      ) : null}
    </>
  );
}

/** One cost line: every cell edits in place. */
const LineRow = memo(function LineRow({ line: l, spec, ctx, picked, onPick, autoFocus, dropHere, detailOpen }: LineRowProps) {
  const { dispatch } = ctx;
  const target: DropTarget = { kind: "line", key: l.key };
  const set = (patch: Partial<SheetLine>) => dispatch({ type: "line", spec, line: l.key, patch });
  const muted = l.isOptional ? "text-slate-400" : "";
  return (
    <>
      <tr
        onFocus={() => ctx.setTarget(spec)}
        className={cn("group/line hover:bg-blue-50/40", picked && "bg-blue-50/60", dropHere && DROP_LINE)}
        onDragOver={(e) => ctx.onDragOver(target, e)}
        onDrop={(e) => ctx.onDrop(target, e)}
      >
        <td className="px-2 py-0.5">
          <span className="flex items-center gap-1">
            <input
              type="checkbox"
              aria-label="Pick this item"
              className="h-3.5 w-3.5 rounded border-slate-300"
              checked={picked}
              onChange={(e) => onPick([l.key], e.target.checked)}
            />
            <span
              draggable
              onDragStart={(e) => ctx.onDragStart({ kind: "line", key: l.key }, e)}
              onDragEnd={ctx.onDragEnd}
              title="Drag to move this item"
              className="cursor-grab text-slate-200 group-hover/line:text-slate-400"
            >
              <GripVertical className="h-4 w-4" />
            </span>
          </span>
        </td>
        <td className="py-0.5 pl-12 pr-1">
          <span className="flex items-center gap-1">
            {/* Before the name, away from everything else in the row (Discard brings it back until you save). */}
            <button
              type="button"
              tabIndex={-1}
              onClick={() => dispatch({ type: "deleteLines", lines: [l.key] })}
              className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 hover:bg-rose-50 hover:text-rose-600 focus:opacity-100 group-hover/line:opacity-100"
              aria-label={`Delete ${l.description || "this item"}`}
              title="Delete this item"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <input
              className={cn(cellClass, muted)}
              value={l.description}
              placeholder="Description"
              aria-label="Description"
              autoFocus={autoFocus}
              onChange={(e) => set({ description: e.target.value })}
            />
            <LinkIcon line={l} ctx={ctx} open={detailOpen} />
          </span>
        </td>
        <LineCells line={l} spec={spec} ctx={ctx} />
        <td className="px-1">
          <RowMenu
            label="Line options"
            items={[
              { label: l.isOptional ? "Include in the price" : "Make optional (not in the price)", onClick: () => set({ isOptional: !l.isOptional }) },
              { label: "Delete item", danger: true, onClick: () => dispatch({ type: "deleteLines", lines: [l.key] }) },
            ]}
          />
        </td>
      </tr>
      {detailOpen ? <TakeoffDetail line={l} ctx={ctx} /> : null}
    </>
  );
});

const OTHER_UNIT = "__other__";

/** Units: every unit in the list (plus this line's own, if it's something else); "Other…" types a new one. */
function UnitCell({ value, onChange }: { value: string; onChange: (unit: string) => void }) {
  const known = (UNITS as readonly string[]).includes(value);
  return (
    <select
      className={cellClass}
      value={value}
      aria-label="Units"
      onChange={(e) => {
        if (e.target.value !== OTHER_UNIT) return onChange(e.target.value);
        const typed = window.prompt("Unit", known ? "" : value)?.trim();
        if (typed) onChange(typed.slice(0, 20));
      }}
    >
      {!known ? <option value={value}>{value || "—"}</option> : null}
      {UNITS.map((u) => (
        <option key={u} value={u}>
          {u}
        </option>
      ))}
      <option value={OTHER_UNIT}>Other…</option>
    </select>
  );
}

/** A takeoff line dropped down: the takeoff items behind it (only its cost code's). */
function TakeoffDetail({ line: l, ctx }: { line: SheetLine; ctx: RowCtx }) {
  const rows = (l.takeoffKey && ctx.takeoffDetail?.[l.takeoffKey]) || [];
  const sum = Math.round(rows.reduce((n, r) => n + r.quantity * r.unitCost, 0) * 100) / 100;
  const stale = Math.abs(sum - Math.round(l.quantity * l.unitCost * 100) / 100) >= 0.01;
  return (
    <tr className="bg-slate-50/70">
      <td />
      <td colSpan={ctx.colCount - 1} className="py-2 pl-16 pr-4">
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">The takeoff has no items for this cost code now — send the takeoff again to update this line.</p>
        ) : (
          <table className="w-full max-w-2xl text-xs">
            <thead className="text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="py-1 text-left font-medium">From the takeoff</th>
                <th className="w-24 py-1 text-right font-medium">Qty</th>
                <th className="w-16 py-1 pl-2 text-left font-medium">Units</th>
                <th className="w-24 py-1 text-right font-medium">Unit cost</th>
                <th className="w-28 py-1 text-right font-medium">Ext. cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/70 text-slate-700">
              {rows.map((r, i) => (
                <tr key={i}>
                  <td className="py-1 pr-3">{r.description}</td>
                  <td className="py-1 text-right tabular-nums">{num(r.quantity, 2)}</td>
                  <td className="py-1 pl-2">{r.unit}</td>
                  <td className="py-1 text-right tabular-nums">{money(r.unitCost)}</td>
                  <td className="py-1 text-right tabular-nums">{money(r.quantity * r.unitCost)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-300 font-medium text-slate-800">
                <td className="py-1" colSpan={4}>
                  {stale ? <span className="font-normal text-amber-700">The takeoff changed since it was sent — send it again to update this line. </span> : null}
                  {ctx.materialListHref ? (
                    <a href={ctx.materialListHref} target="_blank" rel="noopener" className="font-normal text-blue-700 hover:underline">
                      Whole material list
                    </a>
                  ) : null}
                </td>
                <td className="py-1 text-right tabular-nums">{money(sum)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </td>
    </tr>
  );
}

function LinkIcon({ line: l, ctx, open }: { line: SheetLine; ctx: RowCtx; open: boolean }) {
  const materialListHref = ctx.materialListHref;
  if (l.fromTakeoff && l.takeoffKey && ctx.takeoffDetail)
    return (
      <button
        type="button"
        onClick={() => ctx.toggleDetail(l.key)}
        aria-expanded={open}
        title={open ? "Hide the takeoff items" : "From the takeoff — click to see the takeoff items behind it. Sending the takeoff again updates this cost."}
        className={cn("flex shrink-0 items-center rounded p-0.5 hover:bg-blue-50 hover:text-blue-700", open ? "bg-blue-50 text-blue-700" : "text-slate-400")}
      >
        <Ruler className="h-3.5 w-3.5" />
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
    );
  if (l.fromTakeoff)
    return materialListHref ? (
      <a
        href={materialListHref}
        target="_blank"
        rel="noopener"
        title="From the takeoff — sending it again updates this cost. Click for the item-by-item detail (Material list)."
        className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-blue-50 hover:text-blue-700"
      >
        <Ruler className="h-3.5 w-3.5" />
      </a>
    ) : (
      <span title="From the takeoff — sending the takeoff again updates this line" className="shrink-0 text-slate-400">
        <Ruler className="h-3.5 w-3.5" />
      </span>
    );
  if (l.materialItemId)
    return (
      <span title="Tied to the Item List" className="shrink-0 text-slate-400">
        <Link2 className="h-3.5 w-3.5" />
      </span>
    );
  if (l.addToItemList)
    return (
      <span title="Will be added to the Item List when you save" className="shrink-0 text-blue-600">
        <ListPlus className="h-3.5 w-3.5" />
      </span>
    );
  if (l.isOptional) return <span className="shrink-0 text-[10px] font-semibold uppercase text-slate-400">Optional</span>;
  return null;
}

function CategoryName({ name, onRename }: { name: string; onRename: (to: string) => void }) {
  const [text, setText] = useState<string | null>(null);
  const commit = () => {
    if (text !== null && text.trim() && text.trim() !== name) onRename(text.trim());
    setText(null);
  };
  return (
    <input
      className={cn(cellClass, "min-w-0 flex-1 font-semibold uppercase tracking-wide text-slate-800")}
      value={text ?? name}
      aria-label="Division name"
      title="Click to rename this division"
      onFocus={() => setText(name)}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setText(null);
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
    />
  );
}

type MenuItem = { label: string; onClick: () => void; danger?: boolean; hint?: string };

function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white py-1 text-sm normal-case tracking-normal shadow-lg">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              title={it.hint}
              onClick={() => {
                setOpen(false);
                it.onClick();
              }}
              className={cn("block w-full px-3 py-1.5 text-left hover:bg-slate-50", it.danger ? "text-rose-700" : "text-slate-700")}
            >
              {it.label}
              {it.hint ? <span className="block text-[11px] text-slate-400">{it.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ColumnPicker({ hidden }: { hidden: Set<string> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const flip = (k: string) => writeHidden(hidden.has(k) ? Array.from(hidden).filter((x) => x !== k) : [...hidden, k]);
  return (
    <div ref={ref} className="relative">
      <button type="button" className={buttonClasses("secondary", "sm")} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Eye className="h-3.5 w-3.5" /> Columns{hidden.size ? ` (${hidden.size} hidden)` : ""}
      </button>
      {open ? (
        <div className="absolute right-0 top-full z-30 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
          {COLUMNS.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
              <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={!hidden.has(c.key)} onChange={() => flip(c.key)} />
              {c.label}
            </label>
          ))}
          <button type="button" className="mt-1 w-full rounded px-2 py-1 text-left text-xs font-medium text-blue-700 hover:bg-slate-50" onClick={() => writeHidden([])}>
            Show all
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** What to do with the lines you've ticked. */
function BulkBar({
  keys,
  specs,
  costCodes,
  dispatch,
  clear,
}: {
  keys: string[];
  specs: SheetSpec[];
  costCodes: CostCode[];
  dispatch: React.Dispatch<SheetAction>;
  clear: () => void;
}) {
  const lineKeys = new Set(specs.flatMap((s) => s.lines.map((l) => l.key)));
  const lines = keys.filter((k) => lineKeys.has(k));
  const pickedSpecs = keys.filter((k) => specs.some((s) => s.key === k));
  const [pct, setPct] = useState("");
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2 py-1 text-xs text-blue-900 ring-1 ring-inset ring-blue-200">
      <span className="font-semibold">
        {lines.length} item{lines.length === 1 ? "" : "s"}
      </span>
      <select
        aria-label="Set cost type"
        className="rounded border border-blue-200 bg-white px-1 py-0.5"
        value=""
        onChange={(e) => e.target.value && dispatch({ type: "patchLines", lines, patch: { costType: e.target.value } })}
      >
        <option value="">Cost type…</option>
        {COST_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
      <select
        aria-label="Set cost code"
        className="w-32 rounded border border-blue-200 bg-white px-1 py-0.5"
        value=""
        onChange={(e) => e.target.value && dispatch({ type: "patchLines", lines, patch: { costCodeId: e.target.value === "-" ? null : e.target.value } })}
      >
        <option value="">Cost code…</option>
        <option value="-">No cost code</option>
        {costCodes.map((c) => (
          <option key={c.id} value={c.id}>
            {costCodeLabel(c)}
          </option>
        ))}
      </select>
      <input
        aria-label="Set profit %"
        placeholder="Profit %"
        className="w-16 rounded border border-blue-200 bg-white px-1 py-0.5"
        value={pct}
        onChange={(e) => setPct(e.target.value)}
      />
      <button
        type="button"
        className="rounded px-1.5 py-0.5 font-medium hover:bg-blue-100 disabled:opacity-40"
        disabled={pct.trim() === "" || !Number.isFinite(Number(pct))}
        onClick={() => {
          dispatch({ type: "patchLines", lines, patch: { markupPct: Number(pct) } });
          setPct("");
        }}
      >
        Set
      </button>
      <button
        type="button"
        className="rounded px-1.5 py-0.5 font-medium text-rose-700 hover:bg-rose-50"
        onClick={() => {
          dispatch({ type: "deleteLines", lines });
          for (const s of pickedSpecs) dispatch({ type: "deleteSpec", spec: s });
          clear();
        }}
      >
        Delete
      </button>
      <button type="button" className="rounded px-1.5 py-0.5 hover:bg-blue-100" onClick={clear}>
        Clear
      </button>
    </div>
  );
}

function Figure({ label, value, hint, strong }: { label: string; value: string; hint?: string; strong?: boolean }) {
  return (
    <div className="min-w-[7rem]">
      <span className="label !mb-0.5">{label}</span>
      <span className={cn("block tabular-nums", strong ? "text-lg font-bold text-slate-900" : "text-base font-semibold text-slate-800")}>{value}</span>
      <span className="block h-4 text-[11px] text-slate-500">{hint ?? ""}</span>
    </div>
  );
}

function BaseNote({ basePrice, totals, sqft }: { basePrice: number | null; totals: Totals; sqft: number | null }) {
  let note = "Goes on the proposal";
  if (basePrice !== null) {
    const diff = basePrice - totals.price;
    if (Math.abs(diff) >= 0.5) note = `${money(Math.abs(diff))} ${diff > 0 ? "over" : "under"} the estimate · profit at this price ${money(basePrice - totals.cost)}`;
    else note = "Matches the estimate total";
  }
  // Its price per sq. ft. first, like the cost and total beside it.
  const perSqFt = basePrice !== null && sqft ? `${money(basePrice / sqft)} / sq. ft. · ` : "";
  return (
    <span className="block h-4 whitespace-nowrap text-[11px] text-slate-500">
      {perSqFt ? <span className="font-semibold text-slate-700">{perSqFt}</span> : null}
      {note}
    </span>
  );
}

function SaveDialog({
  estimate,
  saving,
  error,
  onCancel,
  onSave,
}: {
  estimate: NonNullable<SheetProps["estimate"]>;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onSave: (mode: "over" | "new") => void;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" role="dialog" aria-modal="true" aria-label="Save the estimate">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">Save the estimate</h2>
        {estimate.isDraft ? (
          <p className="mt-1 text-sm text-slate-600">Update this version, or keep it as it is and save your changes as a new one.</p>
        ) : (
          <p className="mt-1 text-sm text-slate-600">
            v{estimate.version} is {estimate.status.toLowerCase()}, so it stays as it is. Your changes become v{estimate.nextVersion}.
          </p>
        )}
        <div className="mt-4 space-y-2">
          {estimate.isDraft ? (
            <button
              type="button"
              disabled={saving}
              onClick={() => onSave("over")}
              className="block w-full rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-50"
            >
              <span className="block text-sm font-semibold text-slate-900">Save over v{estimate.version}</span>
              <span className="block text-xs text-slate-500">Replaces this version with what&apos;s on screen.</span>
            </button>
          ) : null}
          <button
            type="button"
            disabled={saving}
            onClick={() => onSave("new")}
            className="block w-full rounded-lg border border-slate-200 px-4 py-3 text-left hover:border-blue-300 hover:bg-blue-50/50 disabled:opacity-50"
          >
            <span className="block text-sm font-semibold text-slate-900">Save as new version (v{estimate.nextVersion})</span>
            <span className="block text-xs text-slate-500">v{estimate.version} stays exactly as it was saved.</span>
          </button>
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs text-rose-700">{saving ? <span className="text-slate-500">Saving…</span> : (error ?? "")}</span>
          <button type="button" className={buttonClasses("ghost", "sm")} onClick={onCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * This job's parameter values (Heated sq. ft., Roof squares…). Changing one updates
 * every item whose quantity uses it; saved with the estimate. Admins can switch to
 * editing the list itself (same as Settings).
 */
function ParametersPanel({
  mode,
  parameters,
  values,
  specs,
  canEdit,
  onValue,
  onMode,
}: {
  mode: "values" | "list";
  parameters: ParamSetup[];
  values: Record<string, number>;
  specs: SheetSpec[];
  canEdit: boolean;
  onValue: (id: string, value: number | null) => void;
  onMode: (m: "values" | "list" | null) => void;
}) {
  const uses = new Map<string, number>();
  for (const s of specs)
    for (const l of s.lines) for (const id of new Set([...formulaRefs(l.qtyFormula ?? ""), ...formulaRefs(l.costFormula ?? "")])) uses.set(id, (uses.get(id) ?? 0) + 1);
  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Parameters">
      <button type="button" aria-label="Close" className="absolute inset-0 cursor-default bg-slate-900/20" onClick={() => onMode(null)} />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-xl flex-col bg-slate-50 shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">{mode === "values" ? "This job's parameters" : "Your parameter list"}</h2>
          <span className="flex items-center gap-2">
            {canEdit ? (
              mode === "values" ? (
                <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => onMode("list")}>
                  Edit the list
                </button>
              ) : (
                <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => onMode("values")}>
                  Back to this job&apos;s values
                </button>
              )
            ) : null}
            <button type="button" onClick={() => onMode(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </span>
        </header>
        <div className="flex-1 overflow-y-auto p-5">
          {mode === "list" ? (
            <ParametersForm compact initial={parameters} onSaved={() => onMode("values")} />
          ) : parameters.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
              No parameters yet.{" "}
              {canEdit ? (
                <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => onMode("list")}>
                  Make your list
                </button>
              ) : (
                "An admin can make the list in Settings."
              )}
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Parameter</th>
                    <th className="w-36 px-3 py-2 text-right font-medium">Value</th>
                    <th className="w-24 px-3 py-2 text-right font-medium">Used by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parameters.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-1.5 text-slate-800">{p.name}</td>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-1.5">
                          <NumCell
                            value={values[p.id] ?? 0}
                            blankZero={values[p.id] === undefined}
                            ariaLabel={p.name}
                            placeholder="—"
                            className="border-slate-300 bg-white text-right"
                            onChange={(v) => onValue(p.id, v)}
                            onClear={() => onValue(p.id, null)}
                          />
                          <span className="w-8 shrink-0 text-xs text-slate-500">{p.unit}</span>
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-right text-xs tabular-nums text-slate-500">
                        {uses.get(p.id) ? `${uses.get(p.id)} item${uses.get(p.id) === 1 ? "" : "s"}` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {mode === "values" ? (
            <p className="mt-3 text-xs text-slate-500">
              Items whose quantity or unit cost uses a parameter (ƒ in the cell) update as you type. These numbers belong to the job — every estimate version uses them — and are
              saved when you click Done.
            </p>
          ) : null}
        </div>
        {mode === "values" ? (
          <footer className="flex items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-3">
            <button type="button" className={buttonClasses("primary", "sm")} onClick={() => onMode(null)}>
              Done
            </button>
          </footer>
        ) : null}
      </aside>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Hand,
  Minus,
  MousePointer2,
  MoveHorizontal,
  MoveVertical,
  Spline,
  Pencil,
  Plus,
  RotateCw,
  Ruler,
  RulerDimensionLine,
  Scaling,
  Trash2,
  ZoomIn,
  ZoomOut,
  Tag,
  Magnet,
  Printer,
  ClipboardList,
  Sigma,
  Undo2,
  Redo2,
  Copy,
  ScanSearch,
  ChevronDown,
  GripVertical,
} from "lucide-react";
import { Button, buttonClasses } from "@/components/ui";
import { cn, money, num } from "@/lib/utils";
import {
  CONDITION_TYPES,
  CONDITION_TYPE_LABELS,
  PDF_UNITS_PER_INCH,
  PRESET_SCALES,
  centroid,
  dist,
  feetInches,
  firstEdgeAngle,
  framingLengths,
  framingMembers,
  hipLength,
  beamLabel,
  beamOptions,
  inchesText,
  isCountType,
  isUnitType,
  doorSizeCode,
  arcPath,
  shapePath,
  memberThickness,
  parseStockLengths,
  stockPieces,
  measurementMetrics,
  metricUnit,
  polylineLength,
  type ConditionType,
  type MetricKey,
  type Pt,
} from "@/lib/takeoff";
import { PlanCanvas, renderSheetGray } from "./plan-canvas";
import { AutoCountPanel, FoundMarkers, autoCountPlan, newAutoCount, type AutoCount } from "./auto-count";
import { searchSheet } from "./symbol-search";
import { TakeoffMenu, type TakeoffMenuData } from "./takeoff-menu";
import { RevisionOverlay, type DiffMap } from "./revision-overlay";
import { BringForwardPanel, ComparePanel, type RevisionInfo } from "./revision-panels";
import { NO_ALIGN, alignFromPairs, composeAlign, pairSheets, parseAlign, type Align } from "@/lib/revisions";
import { cropGray, type Box } from "@/lib/symbol-match";
import { buildSnapIndex, findSnap, type SnapHit } from "./snap";
import { ConditionDrawer, type DrawerCondition } from "./condition-drawer";
import { TotalsPanel, type PanelView, type TotalsPanelData } from "./totals-panel";
import { DoorPicker, type DoorChoice, type NewUnit, type UnitCodes } from "./door-picker";
import type { CodeRules } from "@/lib/code-groups";
import type { MemberSizeOption } from "../../_components/condition-form";
import type { ItemOption } from "../../_components/assembly-form";
import {
  bringTakeoffsForward,
  saveSheetAlign,
  createCountMarkers,
  deleteMeasurements,
  createMeasurement,
  deleteMeasurement,
  initPlanPages,
  quickCreateCondition,
  createDoorItem,
  renameSheet,
  setSheetScale,
  updateMeasurement,
  reorderConditions,
} from "../../actions";

type ViewerCondition = {
  id: string;
  name: string;
  type: string;
  color: string;
  metric: string;
  unit: string;
  pitch: number;
  pitchMode: string;
  pitch2: number | null;
  height: number;
  depth: number;
  spacing: number;
  overhang: number;
  memberSize: string | null;
  stockLengths: string | null;
  /** Beams: bearing and plies (JSON). */
  options?: string | null;
  memberWidthIn: number | null;
  boardFeetPerLf: number | null;
  soldAs: string | null;
  total: number;
  sheetTotal: number;
  /** Measured for information only (not on the estimate). */
  referenceOnly: boolean;
  unassignedDoors: number; // Doors: markers with no door picked yet
};

type ViewerMeasurement = {
  id: string;
  conditionId: string;
  points: Pt[];
  isDeduction: boolean;
  angle: number;
  pitch?: number | null; // this shape's own pitch (null = the condition's)
  pitch2?: number | null;
  height?: number | null; // Linear: this line's own wall height (null = the takeoff's)
  arcs?: number[]; // indexes of arc points (the curve passes through them)
  materialItemId?: string | null; // Doors: which door this marker is
  cased?: boolean | null; // Windows: cased or not (null = cased)
  pending?: boolean;
};

type Tool = "select" | "measure" | "calibrate" | "pan" | "ruler" | "autocount";

/** Windows: cased (trimmed) or not. */
function CasedSwitch({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-2 flex items-center gap-2">
      <span className="text-[10px] font-semibold uppercase text-slate-500">Trim</span>
      <div role="radiogroup" aria-label="Cased" className="inline-flex overflow-hidden rounded-md border border-slate-300 text-[11px]">
        {[
          [true, "Cased"],
          [false, "Not cased"],
        ].map(([v, label]) => (
          <button
            key={String(v)}
            type="button"
            role="radio"
            aria-checked={value === v}
            onClick={() => onChange(v as boolean)}
            className={cn("px-2 py-1 font-medium", value === v ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50")}
          >
            {label as string}
          </button>
        ))}
      </div>
    </div>
  );
}

// Framing labels on/off, remembered per browser.
const LABELS_KEY = "takeoff.framingLabels";
const LABELS_EVENT = "takeoff-labels";
function readLabels() {
  try {
    return localStorage.getItem(LABELS_KEY) !== "0";
  } catch {
    return true;
  }
}
function writeLabels(on: boolean) {
  try {
    localStorage.setItem(LABELS_KEY, on ? "1" : "0");
  } catch {
    /* storage blocked — the toggle just won't be remembered */
  }
  window.dispatchEvent(new Event(LABELS_EVENT));
}
// Snapping to the plan's lines on/off, remembered per browser.
const SNAP_KEY = "takeoff.snap";
function readSnap() {
  try {
    return localStorage.getItem(SNAP_KEY) !== "0";
  } catch {
    return true;
  }
}
function writeSnap(on: boolean) {
  try {
    localStorage.setItem(SNAP_KEY, on ? "1" : "0");
  } catch {
    /* storage blocked */
  }
  window.dispatchEvent(new Event(LABELS_EVENT));
}
const SNAP_PX = 10; // how close (screen px) the pointer must be to snap

/** Everything needed to (re)create a shape — for undo / redo and copy / paste. */
type ShapeData = {
  sheetId: string;
  conditionId: string;
  points: Pt[];
  isDeduction: boolean;
  angle: number;
  pitch: number | null;
  pitch2: number | null;
  height?: number | null;
  arcs?: number[];
  materialItemId?: string | null;
  cased?: boolean | null;
};
type ShapePatch = {
  angle?: number;
  isDeduction?: boolean;
  conditionId?: string;
  pitch?: number | null;
  pitch2?: number | null;
  height?: number | null; // Linear: this line's own wall height (null = the takeoff's)
  points?: Pt[];
  arcs?: number[]; // sent with points
  materialItemId?: string | null; // Doors: which door
  cased?: boolean | null; // Windows
};
type HistoryEntry =
  | { kind: "create"; id: string; data: ShapeData }
  | { kind: "delete"; id: string; data: ShapeData }
  | { kind: "update"; id: string; before: ShapePatch; after: ShapePatch }
  // Auto-count: many markers added at once, undone together.
  | { kind: "createMany"; ids: string[]; conditionId: string; markers: { sheetId: string; x: number; y: number }[]; materialItemId: string | null; cased: boolean | null };

// Totals / Material list panel: which view is open ("" = closed), remembered per browser.
const PANEL_KEY = "takeoff.panel";
function readPanel(): PanelView | "" {
  try {
    const v = localStorage.getItem(PANEL_KEY);
    return v === "totals" || v === "materials" ? v : "";
  } catch {
    return "";
  }
}
function writePanel(v: PanelView | "") {
  try {
    localStorage.setItem(PANEL_KEY, v);
  } catch {
    /* storage blocked — the panel just won't be remembered */
  }
  window.dispatchEvent(new Event(LABELS_EVENT));
}
// Plan rotation (view only — measurements stay as drawn), remembered per sheet.
const ROTATION_KEY = "takeoff.rotation.";
function readRotation(sheetKey: string): number {
  try {
    const v = Number(localStorage.getItem(ROTATION_KEY + sheetKey));
    return v === 90 || v === 180 || v === 270 ? v : 0;
  } catch {
    return 0;
  }
}
function writeRotation(sheetKey: string, deg: number) {
  try {
    if (deg) localStorage.setItem(ROTATION_KEY + sheetKey, String(deg));
    else localStorage.removeItem(ROTATION_KEY + sheetKey);
  } catch {
    /* storage blocked — the rotation just won't be remembered */
  }
  window.dispatchEvent(new Event(LABELS_EVENT));
}
function subscribeLabels(cb: () => void) {
  window.addEventListener(LABELS_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(LABELS_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 8;
const CLOSE_PX = 10; // screen px to snap onto the first point and close a shape

const EDGE_PICK_PX = 12; // how close (screen px) the pointer must be to pick a wall

/** Horizontal (0) or vertical (90°), whichever is closer to `angle`. */
function nearestAxis(angle: number) {
  return Math.abs(Math.cos(angle)) >= Math.abs(Math.sin(angle)) ? 0 : Math.PI / 2;
}

/** Direction of edge `i` of a closed outline. */
function edgeAngle(pts: Pt[], i: number) {
  const a = pts[i];
  const b = pts[(i + 1) % pts.length];
  return Math.atan2(b[1] - a[1], b[0] - a[0]);
}

/** Index of the outline edge nearest `p`, if within `max` page units. */
function nearestEdge(pts: Pt[], p: Pt, max: number): number | null {
  let best: number | null = null;
  let bestD = max;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    if (d <= bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

function minPoints(type: string) {
  return isCountType(type) ? 1 : isLineType(type) ? 2 : 3;
}

/** Shapes that can have curved (arc) segments. */
function canArc(type: string) {
  return !isCountType(type) && type !== "OPENING";
}

/** Shapes drawn as lines (not closed outlines). */
function isLineType(type: string) {
  return type === "LINEAR" || type === "HIP_VALLEY" || type === "BEAM" || type === "WALL" || type === "OPENING";
}

/** Joists/rafters and hips/valleys take a pitch per shape; beams are level. */
function hasShapePitch(type: string) {
  return type === "FRAMING" || type === "HIP_VALLEY";
}

/** "6" → 6, "" → null (use the condition's pitch). */
/** A wall height typed in feet; blank (or 0) = use the takeoff's. */
function heightOrNull(text: string | undefined) {
  const n = Number((text ?? "").trim());
  return (text ?? "").trim() !== "" && Number.isFinite(n) && n > 0 ? n : null;
}

function pitchOrNull(text: string) {
  const t = text.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function PlanViewer({
  projectId,
  plan,
  plans,
  pageNumber,
  sheet,
  sheets,
  conditions,
  measurements,
  editor,
  totalsPanel,
  doors,
  windows,
  codes,
  codeAlert,
  countMarkers,
  revision,
  menu,
  notice,
}: {
  projectId: string;
  plan: {
    id: string;
    name: string;
    kind: string;
    pageCount: number | null;
    fileUrl: string;
  };
  /** Every plan set on the job with its sheets (for the one sheet picker). */
  plans: { id: string; name: string; revision: number; replaced: boolean; sheets: { pageNumber: number; name: string; scaled: boolean; count: number }[] }[];
  pageNumber: number;
  sheet: {
    id: string;
    name: string;
    unitsPerFoot: number | null;
    scaleLabel: string | null;
    prevSheetId: string | null; // the sheet it replaces in the previous revision
    align: string | null; // how that old sheet lines up with this one
  } | null;
  sheets: {
    id: string;
    prevSheetId: string | null;
    pageNumber: number;
    name: string;
    scaled: boolean;
    count: number;
  }[];
  /** Every count / door / window marker on this plan's sheets (auto-count skips spots already counted). */
  countMarkers: { sheetId: string; conditionId: string; x: number; y: number }[];
  /** Where this plan set sits among its revisions. */
  revision: RevisionInfo;
  /** The "⋯ Takeoff" menu: estimates, templates, admin or not. */
  menu: TakeoffMenuData;
  /** A note to show on arrival (e.g. "Added 4 takeoffs from the template"). */
  notice?: string | null;
  conditions: ViewerCondition[];
  measurements: ViewerMeasurement[];
  /** The condition edit panel, when open (?cond=<id> or ?cond=new). */
  /** Totals and Material List for the side panel (refreshed after every change). */
  totalsPanel: TotalsPanelData;
  /** Doors on the Item List (category Doors, with a size) for the Doors takeoff. */
  doors: DoorChoice[];
  /** Windows on the Item List (category Windows, with a size) for the Windows takeoff. */
  windows: DoorChoice[];
  /** Cost codes and the remembered "same code for all …" answers, for new doors / windows. */
  codes: UnitCodes;
  /** "3 items need a cost code" — floats over the plan's corner when there are any. */
  codeAlert?: React.ReactNode;
  editor: {
    condition: DrawerCondition | null;
    costCodes: { id: string; code: string | null; name: string }[];
    codeRules: CodeRules;
    memberSizes: MemberSizeOption[];
    items: ItemOption[];
    defaultMarkup: number;
    pricesLocked: boolean;
    nextColor: string;
    /** Admins: takeoff templates a new takeoff can also go into. */
    toolbox?: { id: string; name: string }[];
  } | null;
}) {
  const router = useRouter();
  const base = `/projects/${projectId}/takeoff`;
  const viewerHref = `${base}/${plan.id}?page=${pageNumber}`;
  const editHref = (conditionId: string) => `${viewerHref}&cond=${conditionId}`;
  const scrollRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [, startTransition] = useTransition();

  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitted, setFitted] = useState(false);
  const [tool, setTool] = useState<Tool>("select");
  const [activeId, setActiveId] = useState<string | null>(conditions[0]?.id ?? null);
  const [deduct, setDeduct] = useState(false);
  const [draft, setDraft] = useState<Pt[]>([]);
  // Arcs while drawing: which draft points are arc points, and whether the next click is one.
  const [draftArcs, setDraftArcs] = useState<number[]>([]);
  const [arcNext, setArcNext] = useState(false);
  const [doorPanelMin, setDoorPanelMin] = useState(false);
  // Windows: whether the next window placed is cased, per Windows takeoff (cased unless switched off).
  const [casedPick, setCasedPick] = useState<Record<string, boolean>>({});
  // Doors: the door the next click places, per Doors takeoff (starts as the last one used there).
  const [doorPick, setDoorPick] = useState<Record<string, string | null>>(() => {
    const last: Record<string, string | null> = {};
    for (const m of measurements) if (m.materialItemId) last[m.conditionId] = m.materialItemId;
    return last;
  });
  const resetDraft = () => {
    setDraft([]);
    setDraftArcs([]);
    setArcNext(false);
  };
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<ViewerMeasurement[]>([]);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [calib, setCalib] = useState<Pt[]>([]);
  // Ruler: a quick distance on the plan, not saved and not tied to a condition.
  const [ruler, setRuler] = useState<Pt[]>([]);
  const [calibFeet, setCalibFeet] = useState("");
  const [calibInches, setCalibInches] = useState("");
  const [applyToPlan, setApplyToPlan] = useState(false);
  const [sheetName, setSheetName] = useState(sheet?.name ?? "");
  const [newCondName, setNewCondName] = useState("");
  const [newCondType, setNewCondType] = useState<ConditionType>("AREA");
  const [shiftHeld, setShiftHeld] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Framing direction: a new outline waiting for its member direction, or an existing shape being re-aimed.
  const [dirFor, setDirFor] = useState<{ points: Pt[]; arcs: number[]; conditionId: string } | { id: string } | null>(null);
  // Direction hovered in the chooser (preview), and "parallel to a wall" edge picking.
  const [dirPreview, setDirPreview] = useState<number | null>(null);
  const [edgePick, setEdgePick] = useState(false);
  const showLabels = useSyncExternalStore(subscribeLabels, readLabels, () => true);
  const panel = useSyncExternalStore(subscribeLabels, readPanel, () => "" as const);
  const sheetKey = sheet?.id ?? `${plan.id}:${pageNumber}`;
  const rotation = useSyncExternalStore(
    subscribeLabels,
    () => readRotation(sheetKey),
    () => 0,
  );
  const sideways = rotation === 90 || rotation === 270;
  /** A label angle (page space) turned so the text reads upright on screen at this rotation. */
  const readable = (deg: number) => {
    let d = (((deg + rotation) % 360) + 360) % 360;
    if (d > 90 && d <= 270) d -= 180;
    return d - rotation;
  };
  const togglePanel = (v: PanelView) => writePanel(panel === v ? "" : v);
  // Pitch for the next joist/rafter outline or hip/valley line; blank = the condition's.
  const [nextPitch, setNextPitch] = useState({
    forId: activeId,
    p1: "",
    p2: "",
  });
  if (nextPitch.forId !== activeId) setNextPitch({ forId: activeId, p1: "", p2: "" });
  // Linear: wall height for the next line, per takeoff — kept until you change it (blank = the takeoff's).
  const [nextHeight, setNextHeight] = useState<Record<string, string>>({});
  // Wall height being edited on the selected line.
  const [selHeight, setSelHeight] = useState<{ id: string | null; h: string }>({ id: null, h: "" });
  // Pitch being edited on the selected shape.
  const [selPitch, setSelPitch] = useState<{
    id: string | null;
    p1: string;
    p2: string;
  }>({ id: null, p1: "", p2: "" });
  // Snapping: the page's own line work, indexed for quick lookups; Alt turns it off while held.
  const snapOn = useSyncExternalStore(subscribeLabels, readSnap, () => true);
  const [altHeld, setAltHeld] = useState(false);
  const [vectors, setVectors] = useState<Float32Array | null>(null);
  const snapIndex = useMemo(() => (vectors && vectors.length ? buildSnapIndex(vectors) : null), [vectors]);
  const [snapHit, setSnapHit] = useState<SnapHit | null>(null);
  // Editing a selected shape: dragging one point, or the whole shape.
  const [drag, setDrag] = useState<{
    id: string;
    mode: "vertex" | "move";
    index: number;
    start: Pt;
    startPoints: Pt[];
    points: Pt[];
    moved: boolean;
  } | null>(null);
  const [overrides, setOverrides] = useState<Map<string, { points: Pt[]; arcs?: number[] }>>(new Map());
  // Undo / redo for this sheet. Re-created shapes get new ids; idMap follows them.
  const history = useRef<{ undo: HistoryEntry[]; redo: HistoryEntry[] }>({
    undo: [],
    redo: [],
  });
  const idMap = useRef(new Map<string, string>());
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });
  const clipboard = useRef<ShapeData | null>(null);
  const pointerPage = useRef<Pt | null>(null);
  const [flash, setFlash] = useState<string | null>(notice ?? null);
  // Takeoffs whose details are open in the list.
  const [infoOpen, setInfoOpen] = useState<Set<string>>(new Set());
  // Auto-count: the search under way / under review, and the box being dragged around a sample symbol.
  const [auto, setAuto] = useState<AutoCount | null>(null);
  const [autoBox, setAutoBox] = useState<{ a: Pt; b: Pt } | null>(null);
  const autoAbort = useRef<AbortController | null>(null);
  // Revisions: comparing with the previous one, points clicked to line the sheets up, where they differ, and the bring-forward panel.
  const [compare, setCompare] = useState<{ fade: number } | null>(null);
  const [aligning, setAligning] = useState<{ old: Pt[]; now: Pt[] } | null>(null);
  const [diff, setDiff] = useState<DiffMap | null>(null);
  const [forward, setForward] = useState(false);

  // The Takeoff tab opens the sheet you were last on (per job).
  useEffect(() => {
    document.cookie = `takeoff-last-${projectId}=${plan.id}:${pageNumber}; path=/; max-age=31536000; samesite=lax`;
  }, [projectId, plan.id, pageNumber]);

  // Reset per-sheet state when moving between pages (the canvas and loaded PDF stay mounted).
  const [shownPage, setShownPage] = useState(pageNumber);
  if (shownPage !== pageNumber) {
    setShownPage(pageNumber);
    resetDraft();
    setCalib([]);
    setRuler([]);
    setSelectedId(null);
    setDirFor(null);
    setDirPreview(null);
    setEdgePick(false);
    setFitted(false);
    setSheetName(sheet?.name ?? "");
    setVectors(null);
    setSnapHit(null);
    setDrag(null);
    setHistoryCounts({ undo: 0, redo: 0 });
    setAligning(null);
    setDiff(null);
  }
  useEffect(() => {
    // Undo history is per sheet.
    history.current = { undo: [], redo: [] };
  }, [pageNumber]);
  useEffect(() => {
    if (!flash) return;
    const t = window.setTimeout(() => setFlash(null), 2500);
    return () => window.clearTimeout(t);
  }, [flash]);

  const condById = useMemo(() => new Map(conditions.map((c) => [c.id, c])), [conditions]);

  // The takeoff list's order: a dragged takeoff shows in its new place right away; the
  // order is saved in the background. Alt + ↑ / ↓ moves the one you're on.
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ id: string; after: boolean } | null>(null);
  const [, startReorder] = useTransition();
  const listed = useMemo(() => {
    if (!order) return conditions;
    const out = order.flatMap((id) => condById.get(id) ?? []);
    for (const c of conditions) if (!order.includes(c.id)) out.push(c);
    return out;
  }, [order, conditions, condById]);
  const reorder = (ids: string[]) => {
    setOrder(ids);
    startReorder(async () => {
      await reorderConditions({ projectId, ids });
      router.refresh();
    });
  };
  const active = activeId ? (condById.get(activeId) ?? null) : null;
  const unitsPerFoot = sheet?.unitsPerFoot ?? null;

  const shapes = useMemo(
    () =>
      [...measurements.filter((m) => !removing.has(m.id)), ...pending].map((m) => {
        // Show a shape where it's being dragged to, or where it was just moved while saving.
        if (drag?.id === m.id) return { ...m, points: drag.points };
        const moved = overrides.get(m.id);
        return moved ? { ...m, points: moved.points, arcs: moved.arcs ?? m.arcs } : m;
      }),
    [measurements, pending, removing, drag, overrides],
  );
  const selected = shapes.find((m) => m.id === selectedId) ?? null;

  // --- PDF page count (first open) ---------------------------------------------
  const onPageCount = useCallback(
    (n: number) => {
      if (plan.pageCount === n && sheets.length === n) return;
      startTransition(async () => {
        try {
          await initPlanPages({ projectId, planId: plan.id, pageCount: n });
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not index the plan pages");
        }
      });
    },
    [plan.pageCount, plan.id, sheets.length, projectId, router],
  );

  // --- Zoom ------------------------------------------------------------------------
  const fitWidth = useCallback(() => {
    const el = scrollRef.current;
    if (!el || !size) return;
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (el.clientWidth - 32) / (sideways ? size.h : size.w))));
  }, [size, sideways]);

  /** Page size reported by the canvas; each newly shown sheet starts fitted to the width. */
  const onSize = (w: number, h: number) => {
    setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    if (!fitted && scrollRef.current) {
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (scrollRef.current.clientWidth - 32) / (sideways ? h : w))));
      setFitted(true);
    }
  };

  /** Zoom keeping the page point under (clientX, clientY) fixed on screen. */
  const zoomAt = useCallback(
    (next: number, clientX?: number, clientY?: number) => {
      const el = scrollRef.current;
      const svg = svgRef.current;
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      if (!el || !svg) return setZoom(z);
      const box = el.getBoundingClientRect();
      const cx = clientX ?? box.left + box.width / 2;
      const cy = clientY ?? box.top + box.height / 2;
      const r = svg.getBoundingClientRect();
      const px = (cx - r.left) / zoom;
      const py = (cy - r.top) / zoom;
      setZoom(z);
      requestAnimationFrame(() => {
        const r2 = svg.getBoundingClientRect();
        el.scrollLeft += r2.left + px * z - cx;
        el.scrollTop += r2.top + py * z - cy;
      });
    },
    [zoom],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // The scroll wheel zooms at the pointer (Shift + wheel still scrolls sideways).
    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey) return;
      e.preventDefault();
      zoomAt(zoom * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoom, zoomAt]);

  // --- Pointer -> page coordinates ---------------------------------------------------
  const toPage = useCallback(
    (clientX: number, clientY: number): Pt => {
      const r = svgRef.current!.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      // The plan may be turned on screen; undo the turn to get the point on the sheet.
      const [u, v] = rotation === 90 ? [y, r.width - x] : rotation === 180 ? [r.width - x, r.height - y] : rotation === 270 ? [r.height - y, x] : [x, y];
      return [u / zoom, v / zoom];
    },
    [zoom, rotation],
  );

  /** Shift snaps to horizontal / vertical / 45° from the previous point. */
  const snap = useCallback(
    (p: Pt, prev: Pt | undefined): Pt => {
      if (!shiftHeld || !prev) return p;
      const dx = p[0] - prev[0];
      const dy = p[1] - prev[1];
      const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const len = Math.hypot(dx, dy);
      return [prev[0] + Math.cos(angle) * len, prev[1] + Math.sin(angle) * len];
    },
    [shiftHeld],
  );

  /**
   * Snap to a takeoff point or the plan's line work near `raw`. Off while Shift (straight
   * lines) or Alt is held, or when the Snap toggle is off.
   */
  const magnet = (raw: Pt, excludeId?: string): SnapHit | null => {
    if (!snapOn || altHeld || shiftHeld) return null;
    const vertices: Pt[] = [...draft, ...calib];
    for (const m of shapes) if (m.id !== excludeId) vertices.push(...m.points);
    return findSnap(snapIndex, vertices, raw, SNAP_PX / zoom);
  };

  // --- Saving & history ------------------------------------------------------------------
  const syncHistory = () =>
    setHistoryCounts({
      undo: history.current.undo.length,
      redo: history.current.redo.length,
    });
  const record = (entry: HistoryEntry) => {
    history.current.undo.push(entry);
    if (history.current.undo.length > 100) history.current.undo.shift();
    history.current.redo = [];
    syncHistory();
  };
  const resolveId = (id: string) => {
    let x = id;
    for (let i = 0; i < 50 && idMap.current.has(x); i++) x = idMap.current.get(x)!;
    return x;
  };
  const shapeData = (m: ViewerMeasurement): ShapeData | null =>
    sheet
      ? {
          sheetId: sheet.id,
          conditionId: m.conditionId,
          points: m.points,
          isDeduction: m.isDeduction,
          angle: m.angle,
          pitch: m.pitch ?? null,
          pitch2: m.pitch2 ?? null,
          height: m.height ?? null,
          arcs: m.arcs ?? [],
          materialItemId: m.materialItemId ?? null,
          cased: m.cased ?? null,
        }
      : null;
  /** Saves a shape (copy / paste, undo of a delete). */
  const saveShape = async (data: ShapeData) => (await createMeasurement({ projectId, ...data })).id;

  /** Saves a new shape (shown right away as pending) and records it for undo. */
  const createShape = (data: ShapeData, track = true) => {
    const tempId = `pending-${Math.random().toString(36).slice(2)}`;
    setPending((p) => [
      ...p,
      {
        id: tempId,
        ...data,
        pending: true,
      },
    ]);
    startTransition(async () => {
      try {
        const id = await saveShape(data);
        if (track) record({ kind: "create", id, data });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save the measurement");
      } finally {
        setPending((p) => p.filter((m) => m.id !== tempId));
      }
    });
  };

  // --- Saving ---------------------------------------------------------------------------
  const save = useCallback(
    (cond: ViewerCondition, points: Pt[], framingAngle?: number, arcs: number[] = []) => {
      if (!sheet) return;
      const isDeduction = deduct && (cond.type === "AREA" || cond.type === "LINEAR");
      const angle = cond.type === "FRAMING" ? (framingAngle ?? firstEdgeAngle(points)) : 0;
      const pitch = hasShapePitch(cond.type) && nextPitch.forId === cond.id ? pitchOrNull(nextPitch.p1) : null;
      const pitch2 = cond.type === "HIP_VALLEY" && nextPitch.forId === cond.id ? pitchOrNull(nextPitch.p2) : null;
      const height = cond.type === "LINEAR" ? heightOrNull(nextHeight[cond.id]) : null;
      createShape({
        sheetId: sheet.id,
        conditionId: cond.id,
        points,
        arcs,
        isDeduction,
        angle,
        pitch,
        pitch2,
        height,
        materialItemId: isUnitType(cond.type) ? (doorPick[cond.id] ?? null) : null,
        cased: cond.type === "WINDOW" ? (casedPick[cond.id] ?? true) : null,
      });
    },
    // createShape is recreated each render; save only needs its latest version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deduct, projectId, sheet, nextPitch, nextHeight, doorPick, casedPick],
  );

  const finishDraft = useCallback(
    (points: Pt[], arcIdx: number[] = draftArcs) => {
      if (!active) return;
      // Drop accidental duplicate points (double-clicks), keeping arc points on their vertex.
      const keep = points.map((p, i) => i === 0 || dist(p, points[i - 1]) * zoom > 2);
      const clean = points.filter((_, i) => keep[i]);
      const newIndex = keep.map((_, i) => keep.slice(0, i + 1).filter(Boolean).length - 1);
      const arcs = arcIdx.filter((i) => keep[i] && newIndex[i] > 0).map((i) => newIndex[i]);
      resetDraft();
      if (clean.length < minPoints(active.type)) return;
      if (active.type === "FRAMING") {
        // Ask which way the members run before saving.
        setDirFor({ points: clean, arcs, conditionId: active.id });
        setDirPreview(null);
        setEdgePick(false);
        return;
      }
      save(active, clean, undefined, arcs);
    },
    [active, save, zoom, draftArcs],
  );

  const removeShape = useCallback(
    (id: string) => {
      if (id.startsWith("pending-")) return;
      const shape = shapes.find((m) => m.id === id);
      const data = shape ? shapeData(shape) : null;
      setRemoving((s) => new Set(s).add(id));
      setSelectedId(null);
      startTransition(async () => {
        try {
          await deleteMeasurement({ projectId, id });
          if (data) record({ kind: "delete", id, data });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not delete the measurement");
        } finally {
          setRemoving((s) => {
            const n = new Set(s);
            n.delete(id);
            return n;
          });
        }
      });
    },
    // shapeData / record are recreated each render; the latest are what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, shapes],
  );

  /** Changes a saved shape and records the change for undo. `before` defaults to the shape's current values. */
  const patchShape = (id: string, patchIn: ShapePatch, before?: ShapePatch) => {
    const shape = shapes.find((m) => m.id === id);
    const patch: ShapePatch = patchIn.points && !patchIn.arcs ? { ...patchIn, arcs: shape?.arcs ?? [] } : patchIn;
    const prev: ShapePatch = before ?? {};
    if (!before && shape) {
      for (const k of Object.keys(patch) as (keyof ShapePatch)[]) {
        if (k === "pitch" || k === "pitch2" || k === "height") prev[k] = shape[k] ?? null;
        else if (k === "points") prev.points = shape.points;
        else if (k === "arcs") prev.arcs = shape.arcs ?? [];
        else if (k === "materialItemId") prev.materialItemId = shape.materialItemId ?? null;
        else if (k === "cased") prev.cased = shape.cased ?? null;
        else if (k === "angle") prev.angle = shape.angle;
        else if (k === "isDeduction") prev.isDeduction = shape.isDeduction;
        else if (k === "conditionId") prev.conditionId = shape.conditionId;
      }
    }
    if (patch.points) setOverrides((o) => new Map(o).set(id, { points: patch.points!, arcs: patch.arcs }));
    startTransition(async () => {
      try {
        await updateMeasurement({ projectId, id, ...patch });
        record({ kind: "update", id, before: prev, after: patch });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update the measurement");
      } finally {
        if (patch.points)
          setOverrides((o) => {
            const n = new Map(o);
            n.delete(id);
            return n;
          });
      }
    });
  };

  // --- Auto-count -----------------------------------------------------------------------------
  const autoOn = tool === "autocount" && !!auto && !!active && auto.conditionId === active.id;
  const stopAuto = () => {
    autoAbort.current?.abort();
    autoAbort.current = null;
    setAuto(null);
    setAutoBox(null);
  };
  const startAuto = () => {
    if (!active || !isCountType(active.type)) return;
    autoAbort.current?.abort();
    setAuto(newAutoCount(active.id, auto?.allSheets ?? false));
    setTool("autocount");
    setSelectedId(null);
    showTakeoff(active.id);
  };
  /** Finds the sample (a box on `samplePage`, page units) on this sheet or every sheet. */
  const runAuto = async (conditionId: string, box: Box, allSheets: boolean, samplePage: number) => {
    autoAbort.current?.abort();
    const ctl = new AbortController();
    autoAbort.current = ctl;
    setAuto((a) => a && { ...a, conditionId, status: "searching", progress: 0, allSheets, results: {}, rejected: [], message: undefined });
    try {
      // About 48 pixels across the sample, so small symbols keep their detail.
      const want = Math.min(6, Math.max(1.5, 48 / Math.max(box.w, box.h)));
      const first = await renderSheetGray(plan.fileUrl, plan.kind, samplePage, want);
      const sc = first.scale;
      const sample = cropGray(first.gray, { x: box.x * sc, y: box.y * sc, w: box.w * sc, h: box.h * sc });
      const thumb = document.createElement("canvas");
      thumb.width = sample.w;
      thumb.height = sample.h;
      thumb.getContext("2d")?.drawImage(first.canvas, box.x * sc, box.y * sc, box.w * sc, box.h * sc, 0, 0, sample.w, sample.h);
      const sampleInfo = { pageNumber: samplePage, box, thumb: thumb.toDataURL() };
      const pages = allSheets ? sheets.map((sh) => sh.pageNumber) : [samplePage];
      const results: AutoCount["results"] = {};
      for (const [i, page] of pages.entries()) {
        const sheetId = sheets.find((sh) => sh.pageNumber === page)?.id;
        if (!sheetId) continue;
        const pic = page === samplePage ? first : await renderSheetGray(plan.fileUrl, plan.kind, page, sc);
        if (ctl.signal.aborted) return;
        const found = await searchSheet(
          pic.gray,
          { ...sample, data: sample.data.slice() },
          (f) => setAuto((a) => (a && a.status === "searching" ? { ...a, progress: (i + f) / pages.length } : a)),
          ctl.signal,
        );
        results[page] = { sheetId, matches: found.map((m) => ({ x: m.x / pic.scale, y: m.y / pic.scale, w: m.w / pic.scale, h: m.h / pic.scale, score: m.score })) };
        setAuto((a) => a && { ...a, sample: sampleInfo, results: { ...results }, progress: (i + 1) / pages.length });
      }
      if (!ctl.signal.aborted) setAuto((a) => a && { ...a, status: "done", sample: sampleInfo });
    } catch (e) {
      if (ctl.signal.aborted || (e instanceof Error && e.message === "cancelled")) return;
      setAuto((a) => a && { ...a, status: "error", message: e instanceof Error ? e.message : "The search didn't work" });
    }
  };
  /** Markers this takeoff already has on a sheet (found symbols there aren't counted twice). */
  const markersOn = (page: number): Pt[] => {
    if (!auto) return [];
    if (page === pageNumber) return shapes.filter((m) => m.conditionId === auto.conditionId).map((m) => m.points[0]);
    const sheetId = sheets.find((sh) => sh.pageNumber === page)?.id;
    return countMarkers.filter((m) => m.conditionId === auto.conditionId && m.sheetId === sheetId).map((m) => [m.x, m.y] as Pt);
  };
  const autoPlan = auto ? autoCountPlan(auto, markersOn) : null;
  const addAuto = () => {
    const c = auto ? condById.get(auto.conditionId) : undefined;
    if (!c || !autoPlan || !autoPlan.add.length) return;
    const markers = autoPlan.add;
    const materialItemId = isUnitType(c.type) ? (doorPick[c.id] ?? null) : null;
    const cased = c.type === "WINDOW" ? (casedPick[c.id] ?? true) : null;
    stopAuto();
    setTool("measure");
    startTransition(async () => {
      try {
        const { ids } = await createCountMarkers({ projectId, conditionId: c.id, markers, materialItemId, cased });
        record({ kind: "createMany", ids, conditionId: c.id, markers, materialItemId, cased });
        setFlash(`Added ${ids.length} count${ids.length === 1 ? "" : "s"} to ${c.name} — Ctrl+Z undoes them all`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not add the counts");
      }
    });
  };

  // --- Sheet picker: every plan set and its sheets (this plan's from the live sheet list) ---------
  const sheetGroups = plans.map((p) => {
    const list = p.id === plan.id ? sheets : p.sheets;
    const label = `${p.name}${p.revision > 1 || p.replaced ? ` · Rev ${p.revision}` : ""}${p.replaced ? " (replaced)" : ""}`;
    const options = list.length
      ? list.map((x) => ({
          value: `${p.id}:${x.pageNumber}`,
          planId: p.id,
          page: x.pageNumber,
          // With several plan sets, the closed picker also says which set you're in.
          label: `${plans.length > 1 ? `${p.name} › ` : ""}${x.pageNumber}. ${x.name}${x.scaled ? "" : " (no scale)"}${x.count ? ` · ${x.count}` : ""}`,
        }))
      : // Pages are counted the first time a plan set is opened.
        [{ value: `${p.id}:1`, planId: p.id, page: 1, label: `${plans.length > 1 ? `${p.name} › ` : ""}Open (pages load when opened)` }];
    return { planId: p.id, label, options };
  });
  const flatSheets = sheetGroups.flatMap((g) => g.options);
  const here = flatSheets.findIndex((o) => o.planId === plan.id && o.page === pageNumber);
  const prevSheet = here > 0 ? flatSheets[here - 1] : null;
  const nextSheet = here >= 0 && here < flatSheets.length - 1 ? flatSheets[here + 1] : null;

  // --- Revisions ------------------------------------------------------------------------------
  const prevRev = revision.prev;
  const superseded = !!revision.replacedBy;
  // Old sheet → new sheet, by sheet name then page number.
  const defaultPairs = useMemo(() => (prevRev ? pairSheets(prevRev.sheets, sheets) : new Map<string, string>()), [prevRev, sheets]);
  const pairId = !prevRev || !sheet ? null : (sheet.prevSheetId ?? [...defaultPairs].find(([, n]) => n === sheet.id)?.[0] ?? null);
  const pairSheet = prevRev?.sheets.find((x) => x.id === pairId) ?? null;
  const sheetAlign: Align = sheet && sheet.prevSheetId && sheet.prevSheetId === pairId ? parseAlign(sheet.align) : NO_ALIGN;
  const saveAlign = (prevSheetId: string | null, align: Align | null) => {
    if (!sheet) return;
    startTransition(async () => {
      try {
        await saveSheetAlign({ projectId, sheetId: sheet.id, prevSheetId, align });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not save");
      }
    });
  };
  /** Points clicked on the old drawing and then the same points on the new one → line the sheets up. */
  const finishAlign = (a = aligning) => {
    setAligning(null);
    if (!a) return;
    const n = Math.min(a.old.length, a.now.length);
    if (!n) return;
    saveAlign(pairId, composeAlign(sheetAlign, alignFromPairs(a.old.slice(0, n), a.now.slice(0, n))));
    setFlash(n === 1 ? "Old sheet shifted to line up" : "Sheets lined up");
  };
  // Takeoff shapes on (or inside) a change between the revisions.
  const changedShapes =
    compare && pairSheet && diff
      ? shapes.flatMap((m) => {
          const c = condById.get(m.conditionId);
          if (!c || m.pending || !m.points.length) return [];
          const pad = isCountType(c.type) ? 10 : 4;
          const xs = m.points.map((q) => q[0]);
          const ys = m.points.map((q) => q[1]);
          const box = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad };
          return diff.changedIn(box.x, box.y, box.w, box.h) > 6 ? [{ m, c, box }] : [];
        })
      : [];

  const runHistory = (direction: "undo" | "redo") => {
    const from = direction === "undo" ? history.current.undo : history.current.redo;
    const entry = from.pop();
    if (!entry) return;
    syncHistory();
    setSelectedId(null);
    startTransition(async () => {
      try {
        if (entry.kind === "createMany") {
          if (direction === "undo") await deleteMeasurements({ projectId, ids: entry.ids.map(resolveId) });
          else {
            const { ids } = await createCountMarkers({
              projectId,
              conditionId: entry.conditionId,
              markers: entry.markers,
              materialItemId: entry.materialItemId,
              cased: entry.cased,
            });
            entry.ids.forEach((old, i) => idMap.current.set(resolveId(old), ids[i]));
          }
          (direction === "undo" ? history.current.redo : history.current.undo).push(entry);
          setFlash(`${direction === "undo" ? "Undid" : "Redid"} an auto-count (${entry.ids.length})`);
          return;
        }
        const recreate = async (data: ShapeData) => {
          const old = resolveId(entry.id);
          const id = await saveShape(data);
          idMap.current.set(old, id);
        };
        const remove = () => deleteMeasurement({ projectId, id: resolveId(entry.id) });
        if (entry.kind === "create") await (direction === "undo" ? remove() : recreate(entry.data));
        else if (entry.kind === "delete") await (direction === "undo" ? recreate(entry.data) : remove());
        else
          await updateMeasurement({
            projectId,
            id: resolveId(entry.id),
            ...(direction === "undo" ? entry.before : entry.after),
          });
        (direction === "undo" ? history.current.redo : history.current.undo).push(entry);
        setFlash(`${direction === "undo" ? "Undid" : "Redid"} ${entry.kind === "create" ? "adding a shape" : entry.kind === "delete" ? "a delete" : "an edit"}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : `Could not ${direction}`);
      } finally {
        syncHistory();
      }
    });
  };

  const copySelected = () => {
    if (!selected || selected.pending) return;
    clipboard.current = shapeData(selected);
    setFlash("Copied — Ctrl+V pastes at the pointer");
  };
  /** Pastes the copied shape centred on `at` (or nudged off the original). */
  const pasteAt = (at: Pt | null) => {
    const c = clipboard.current;
    if (!c || !sheet) return;
    if (!condById.has(c.conditionId)) return setError("The copied shape's takeoff no longer exists");
    const [cx, cy] = centroid(c.points);
    const to: Pt = at ?? [cx + 24 / zoom, cy + 24 / zoom];
    const dx = to[0] - cx;
    const dy = to[1] - cy;
    createShape({
      ...c,
      sheetId: sheet.id,
      points: c.points.map(([x, y]) => [x + dx, y + dy] as Pt),
    });
  };
  const duplicateSelected = () => {
    if (!selected || selected.pending) return;
    clipboard.current = shapeData(selected);
    pasteAt(null);
  };

  /**
   * Finishes picking a framing direction. `null` = the default: for a new outline,
   * horizontal or vertical (whichever is closer to its first edge); for an existing
   * shape, no change.
   */
  const finishDirection = useCallback(
    (angle: number | null) => {
      if (dirFor && "points" in dirFor) {
        const cond = condById.get(dirFor.conditionId);
        if (cond) save(cond, dirFor.points, angle ?? nearestAxis(firstEdgeAngle(dirFor.points)), dirFor.arcs);
      } else if (dirFor && angle !== null) {
        patchShape(dirFor.id, { angle });
      }
      setDirFor(null);
      setDirPreview(null);
      setEdgePick(false);
    },
    // patchShape is recreated each render; the latest is what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dirFor, condById, save, projectId],
  );

  // --- Keyboard ------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(e.type === "keydown");
      if (e.key === "Alt") {
        setAltHeld(e.type === "keydown");
        e.preventDefault(); // keep the browser menu from grabbing focus
      }
      if (e.target instanceof Element && e.target.closest("input, select, textarea")) return;
      if (e.key === " ") {
        setSpaceHeld(e.type === "keydown");
        e.preventDefault();
        return;
      }
      if (e.type !== "keydown") return;
      if (dirFor) {
        const k = e.key.toLowerCase();
        if (k === "h") finishDirection(sideways ? Math.PI / 2 : 0);
        else if (k === "v") finishDirection(sideways ? 0 : Math.PI / 2);
        else if (k === "e") setEdgePick((v) => !v);
        else if (e.key === "Enter") finishDirection(null);
        else if (e.key === "Escape") {
          setDirFor(null);
          setDirPreview(null);
          setEdgePick(false);
        }
        return;
      }
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && (k === "z" || k === "y")) {
        e.preventDefault();
        runHistory(k === "y" || e.shiftKey ? "redo" : "undo");
        return;
      }
      if (mod && k === "c" && selected) {
        copySelected();
        return;
      }
      if (mod && k === "v") {
        e.preventDefault();
        pasteAt(pointerPage.current);
        return;
      }
      if (mod && k === "d" && selected) {
        e.preventDefault();
        duplicateSelected();
        return;
      }
      if (mod) return;
      if (e.key === "Escape") {
        if (tool === "autocount") {
          stopAuto();
          setTool("measure");
        }
        setAligning(null);
        resetDraft();
        setCalib([]);
        setRuler([]);
        setSelectedId(null);
      } else if (e.key === "Enter" && draft.length) {
        finishDraft(draft);
      } else if ((e.key === "Backspace" || e.key === "Delete") && draft.length) {
        e.preventDefault();
        setDraftArcs((a) => a.filter((i) => i < draft.length - 1));
        setArcNext(false);
        setDraft((d) => d.slice(0, -1));
      } else if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
        e.preventDefault();
        removeShape(selectedId);
      } else if ((e.key === "a" || e.key === "A") && tool === "measure" && active && canArc(active.type)) {
        setArcNext((v) => !v);
      } else if (e.key === "v" || e.key === "V") {
        setTool("select");
      } else if (e.key === "r" || e.key === "R") {
        setTool("ruler");
      } else if ((e.key === "m" || e.key === "M") && active) {
        setTool("measure");
        setHidden((h) => (h.has(active.id) ? new Set([...h].filter((x) => x !== active.id)) : h));
      } else if (e.key === "d" || e.key === "D") {
        setDeduct((d) => !d);
      } else if (e.key === "+" || e.key === "=") {
        zoomAt(zoom * 1.25);
      } else if (e.key === "-") {
        zoomAt(zoom / 1.25);
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
    // The edit helpers (runHistory, copy/paste) are recreated each render; listening with the latest is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, selectedId, selected, finishDraft, removeShape, active, zoom, zoomAt, dirFor, finishDirection, tool]);

  // --- Framing direction chooser ---------------------------------------------------------
  // The outline being aimed, its default direction, and what the preview shows right now.
  const dirShape = dirFor
    ? "points" in dirFor
      ? {
          points: dirFor.points,
          arcs: dirFor.arcs,
          conditionId: dirFor.conditionId,
          angle: nearestAxis(firstEdgeAngle(dirFor.points)),
        }
      : (shapes.find((m) => m.id === dirFor.id) ?? null)
    : null;
  const dirCond = dirShape ? (condById.get(dirShape.conditionId) ?? null) : null;
  const hoverEdge = dirFor && edgePick && dirShape && cursor ? nearestEdge(dirShape.points, cursor, EDGE_PICK_PX / zoom) : null;
  const dirAngle = dirShape ? (hoverEdge !== null ? edgeAngle(dirShape.points, hoverEdge) : (dirPreview ?? dirShape.angle)) : 0;

  // --- Mouse ---------------------------------------------------------------------------
  const panRef = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    moved: boolean;
    right?: boolean; // started with the right button
  } | null>(null);
  const suppressClick = useRef(false);
  const suppressContext = useRef(false);
  const panning = tool === "pan" || spaceHeld;

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    // Auto-count: drag a box around the sample symbol (clicks on found rings toggle them instead).
    if (tool === "autocount" && e.button === 0 && !panning && auto && auto.status !== "searching" && !(e.target as Element).closest("[data-found]")) {
      e.preventDefault();
      const p = toPage(e.clientX, e.clientY);
      setAutoBox({ a: p, b: p });
      try {
        svgRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* pointer already released */
      }
      return;
    }
    // Editing the selected shape: grab a point handle, or the shape itself.
    if (tool === "select" && e.button === 0 && !panning && !dirFor && selected && !selected.pending) {
      const target = e.target as Element;
      const handle = target.closest("[data-handle]");
      const onShape = target.closest(`[data-shape="${selected.id}"]`);
      if (handle || onShape) {
        e.preventDefault();
        const start = toPage(e.clientX, e.clientY);
        setDrag({
          id: selected.id,
          mode: handle ? "vertex" : "move",
          index: handle ? Number(handle.getAttribute("data-handle")) : -1,
          start,
          startPoints: selected.points,
          points: selected.points,
          moved: false,
        });
        try {
          svgRef.current?.setPointerCapture(e.pointerId);
        } catch {
          /* pointer already released */
        }
        return;
      }
    }
    // Right-drag pans too (a quick right-click without moving still finishes a shape / removes a point).
    const rightPan = e.button === 2 && !(e.target as Element).closest("[data-handle]");
    const wantsPan = e.button === 1 || rightPan || panning || (tool === "select" && e.button === 0 && e.target === svgRef.current);
    if (!wantsPan) return;
    e.preventDefault();
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
      moved: false,
      right: rightPan,
    };
    try {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const pan = panRef.current;
    if (pan && scrollRef.current) {
      const dx = e.clientX - pan.x;
      const dy = e.clientY - pan.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
      scrollRef.current.scrollLeft = pan.left - dx;
      scrollRef.current.scrollTop = pan.top - dy;
      return;
    }
    if (!svgRef.current) return;
    const raw = toPage(e.clientX, e.clientY);
    pointerPage.current = raw;
    if (autoBox) {
      setAutoBox({ ...autoBox, b: raw });
      return;
    }
    if (drag) {
      let points: Pt[];
      if (drag.mode === "vertex") {
        const hit = magnet(raw, drag.id);
        setSnapHit(hit);
        const p = hit?.point ?? raw;
        points = drag.startPoints.map((q, i) => (i === drag.index ? p : q));
      } else {
        const dx = raw[0] - drag.start[0];
        const dy = raw[1] - drag.start[1];
        points = drag.startPoints.map(([x, y]) => [x + dx, y + dy] as Pt);
      }
      const moved = drag.moved || dist(raw, drag.start) * zoom > 3;
      setDrag({ ...drag, points, moved });
      return;
    }
    if (tool === "measure" || tool === "calibrate" || tool === "ruler") {
      const hit = magnet(raw);
      setSnapHit(hit);
      setCursor(hit?.point ?? raw);
    } else if (dirFor) setCursor(raw);
  };

  const onPointerUp = () => {
    if (autoBox) {
      const [a, b] = [autoBox.a, autoBox.b];
      const box = { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
      setAutoBox(null);
      if (auto && box.w * zoom > 6 && box.h * zoom > 6) void runAuto(auto.conditionId, box, auto.allSheets, pageNumber);
      return;
    }
    if (panRef.current?.moved) suppressClick.current = true;
    // A right-drag pan shouldn't also finish the shape on release.
    if (panRef.current?.moved && panRef.current.right) suppressContext.current = true;
    panRef.current = null;
    if (drag) {
      if (drag.moved) {
        suppressClick.current = true;
        patchShape(drag.id, { points: drag.points }, { points: drag.startPoints });
      }
      setDrag(null);
      setSnapHit(null);
    }
  };

  /** Double-click on a selected outline or line: add a point on the nearest edge. */
  const onDoubleClickShape = (e: React.MouseEvent) => {
    if (tool !== "select" || !selected || selected.pending) return;
    const c = condById.get(selected.conditionId);
    if (!c || isCountType(c.type)) return;
    const p = toPage(e.clientX, e.clientY);
    const pts = selected.points;
    const closed = !isLineType(c.type);
    let best = -1;
    let bestD = 14 / zoom;
    let at: Pt = p;
    const edges = closed ? pts.length : pts.length - 1;
    for (let i = 0; i < edges; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
      const q: Pt = [a[0] + t * dx, a[1] + t * dy];
      const d = dist(p, q);
      if (d < bestD) {
        bestD = d;
        best = i;
        at = q;
      }
    }
    if (best < 0) return;
    e.stopPropagation();
    patchShape(selected.id, {
      points: [...pts.slice(0, best + 1), at, ...pts.slice(best + 1)],
      arcs: (selected.arcs ?? []).map((i) => (i > best ? i + 1 : i)),
    });
  };

  const onClick = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (panning) return;
    if (tool === "autocount") return;
    if (aligning) {
      const p = toPage(e.clientX, e.clientY);
      const next = aligning.old.length > aligning.now.length ? { ...aligning, now: [...aligning.now, p] } : { ...aligning, old: [...aligning.old, p] };
      if (next.now.length >= 2) finishAlign(next);
      else setAligning(next);
      return;
    }
    if (dirFor) {
      // Only "parallel to a wall" uses the plan: click a highlighted edge of the outline.
      if (edgePick && dirShape && hoverEdge !== null) finishDirection(edgeAngle(dirShape.points, hoverEdge));
      return;
    }
    if (tool === "select") {
      if (e.target === svgRef.current) setSelectedId(null);
      return;
    }
    const pointer = toPage(e.clientX, e.clientY);
    const raw = magnet(pointer)?.point ?? pointer;

    if (tool === "calibrate") {
      if (calib.length >= 2) setCalib([raw]);
      else setCalib((c) => [...c, snap(raw, c[c.length - 1])]);
      return;
    }

    if (tool === "ruler") {
      if (!unitsPerFoot) return setError("Set this sheet's scale before using the ruler.");
      // Two clicks pull a measurement; the next click starts a new one.
      setRuler((r) => (r.length === 1 ? [r[0], snap(raw, r[0])] : [raw]));
      return;
    }

    if (!active || !sheet) return;
    if (isCountType(active.type)) {
      save(active, [raw]);
      return;
    }
    if (!unitsPerFoot) {
      setError("Set this sheet's scale before measuring lengths or areas.");
      return;
    }
    // Second click of a double-click finishes the shape (the first click already added the point).
    if (e.detail >= 2) {
      finishDraft(draft);
      return;
    }
    const closes = !isLineType(active.type) && draft.length >= 3 && dist(raw, draft[0]) * zoom <= CLOSE_PX;
    if (closes) {
      finishDraft(draft);
      return;
    }
    // A wall run that comes back to its first corner closes the building and finishes in one click.
    if (active.type === "WALL" && draft.length >= 3 && dist(raw, draft[0]) * zoom <= CLOSE_PX) {
      finishDraft([...draft, draft[0]]);
      return;
    }
    // Arc: this click is a point the curve passes through; the next click is where it ends.
    if (arcNext && draft.length >= 1 && !draftArcs.includes(draft.length - 1)) {
      setDraftArcs((a) => [...a, draft.length]);
      setArcNext(false);
      setDraft((d) => [...d, raw]);
      return;
    }
    // An opening is one line across it: the second click saves it.
    if (active.type === "OPENING" && draft.length === 1) {
      finishDraft([draft[0], snap(raw, draft[0])]);
      return;
    }
    setDraft((d) => [...d, snap(raw, d[d.length - 1])]);
  };

  // --- Scale ------------------------------------------------------------------------------
  const applyScale = (upf: number, label: string) => {
    if (!sheet) return;
    startTransition(async () => {
      try {
        await setSheetScale({
          projectId,
          sheetId: sheet.id,
          unitsPerFoot: upf,
          scaleLabel: label,
          applyToPlan,
        });
        setCalib([]);
        setTool("select");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not set the scale");
      }
    });
  };

  const calibLength = (Number(calibFeet) || 0) + (Number(calibInches) || 0) / 12;
  const presetValue = PRESET_SCALES.find((s) => sheet?.unitsPerFoot && Math.abs(s.paperInchesPerFoot * PDF_UNITS_PER_INCH - sheet.unitsPerFoot) < 1e-6)?.label ?? "";

  // --- Live readout -----------------------------------------------------------------------
  const preview = draft.length && cursor ? [...draft, draftArcs.includes(draft.length - 1) ? cursor : snap(cursor, draft[draft.length - 1])] : draft;
  const previewPath = active ? arcPath(preview, draftArcs, !isLineType(active.type)) : preview;
  let readout: string | null = null;
  if (tool === "measure" && active && !isCountType(active.type) && unitsPerFoot && preview.length >= 2) {
    if (preview.length >= minPoints(active.type)) {
      const shape = {
        points: preview,
        arcs: draftArcs,
        isDeduction: false,
        angle: firstEdgeAngle(preview),
        pitch: hasShapePitch(active.type) ? pitchOrNull(nextPitch.p1) : null,
        pitch2: active.type === "HIP_VALLEY" ? pitchOrNull(nextPitch.p2) : null,
        height: active.type === "LINEAR" ? heightOrNull(nextHeight[active.id]) : null,
      };
      const m = measurementMetrics(active, shape, unitsPerFoot);
      const wallHeight = active.type === "LINEAR" ? (shape.height ?? active.height) : 0;
      readout =
        active.type === "WALL"
          ? `${feetInches(m.length)} · ${num(m.wall_area)} sf of wall`
          : active.type === "OPENING"
            ? `${inchesText(m.length * 12)} opening`
            : active.type === "HIP_VALLEY"
              ? `${feetInches(m.member_lf)} true length`
              : active.type === "BEAM"
                ? `${feetInches(m.members ? m.member_lf / m.members : 0)} beam, bearing included${m.members > 1 ? ` · ×${m.members} plies` : ""}`
                : wallHeight > 0
                  ? `${feetInches(m.length)} · ${num(m.wall_area)} sf at ${num(wallHeight, 2)}' high`
                  : `${num(m[active.metric as MetricKey] ?? 0)} ${metricUnit(active.metric)}`;
    } else {
      readout = feetInches(polylineLength(previewPath) / unitsPerFoot);
    }
  } else if (tool === "ruler" && unitsPerFoot && ruler.length) {
    const end = ruler[1] ?? (cursor ? snap(cursor, ruler[0]) : null);
    if (end) readout = feetInches(dist(ruler[0], end) / unitsPerFoot);
  } else if (tool === "calibrate" && calib.length === 1 && cursor) {
    readout = unitsPerFoot ? feetInches(dist(calib[0], cursor) / unitsPerFoot) : `${num(dist(calib[0], cursor), 0)} units`;
  }

  const shapeQuantity = (m: ViewerMeasurement) => {
    const c = condById.get(m.conditionId);
    if (!c) return null;
    const metrics = measurementMetrics(c, m, unitsPerFoot);
    return {
      value: metrics[c.metric as MetricKey] ?? 0,
      unit: metricUnit(c.metric),
      metrics,
    };
  };

  const doorById = new Map([...doors, ...windows].map((d) => [d.id, d]));
  /** Doors or windows to pick from for a Doors / Windows takeoff. */
  const unitsFor = (type: string) => (type === "WINDOW" ? windows : doors);
  const unitKind = (type: string) => (type === "WINDOW" ? ("window" as const) : ("door" as const));
  const addUnit = (kind: "door" | "window") => async (unit: NewUnit) => {
    try {
      const { id } = await createDoorItem({ ...unit, kind });
      router.refresh();
      return id;
    } catch (e) {
      setError(e instanceof Error ? e.message : `Could not add the ${kind}`);
      return null;
    }
  };
  const showTakeoff = (id: string) =>
    setHidden((h) => {
      if (!h.has(id)) return h;
      const n = new Set(h);
      n.delete(id);
      return n;
    });
  const allHidden = conditions.length > 0 && conditions.every((c) => hidden.has(c.id));

  // --- Rendering helpers --------------------------------------------------------------------
  const px = (n: number) => n / zoom; // screen px → page units
  const stroke = { vectorEffect: "non-scaling-stroke" as const };
  const cursorClass = panning
    ? "cursor-grab"
    : dirFor
      ? edgePick && hoverEdge !== null
        ? "cursor-pointer"
        : "cursor-default"
      : tool === "measure" || tool === "calibrate" || tool === "ruler" || tool === "autocount"
        ? "cursor-crosshair"
        : "cursor-default";

  /** Double-headed arrow showing which way framing members run. */
  const directionArrow = (at: Pt, angle: number, color: string, length = 44) => {
    const half = px(length) / 2;
    const head = px(8);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const a: Pt = [at[0] - dx * half, at[1] - dy * half];
    const b: Pt = [at[0] + dx * half, at[1] + dy * half];
    const tip = (p: Pt, s: number) =>
      [[p[0] - s * dx * head + dy * head * 0.6, p[1] - s * dy * head - dx * head * 0.6], p, [p[0] - s * dx * head - dy * head * 0.6, p[1] - s * dy * head + dx * head * 0.6]]
        .map((q) => q.join(","))
        .join(" ");
    return (
      <g pointerEvents="none">
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="white" strokeWidth={5} strokeLinecap="round" {...stroke} />
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={2.5} strokeLinecap="round" {...stroke} />
        <polyline points={tip(b, 1)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" {...stroke} />
        <polyline points={tip(a, -1)} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" {...stroke} />
      </g>
    );
  };

  /**
   * Framing-plan callout beside the direction arrow, e.g. "2x6 Rafters @ 16" o.c." over
   * "(18) 20'". Text runs along the members and is flipped to stay readable.
   */
  const framingLabel = (c: ViewerCondition, m: ViewerMeasurement, upf: number) => {
    const size = c.memberSize?.trim();
    // Framing-plan style: the member size when the condition name doesn't already say it.
    const name = size && !c.name.toLowerCase().includes(size.toLowerCase()) ? size : c.name;
    // Second line: this outline's cut lengths. Boards are packed per condition (short pieces
    // share boards), so the ordered sticks are on the Material List cut sheet, not here.
    const lengths = framingLengths(c, m, upf);
    let pieces = "";
    if (c.soldAs === "EXACT_LF") {
      const counts = new Map<number, number>();
      for (const l of lengths) for (const piece of stockPieces(l, null, c.soldAs)) counts.set(piece, (counts.get(piece) ?? 0) + 1);
      pieces = Array.from(counts.entries())
        .sort((a, b) => b[0] - a[0])
        .map(([len, n]) => `(${n}) ${feetInches(len)}`)
        .join("  ");
    } else if (lengths.length) {
      const lo = Math.min(...lengths);
      const hi = Math.max(...lengths);
      pieces = hi - lo < 1 / 12 ? `(${lengths.length}) ${feetInches(hi)}` : `(${lengths.length}) ${feetInches(lo)} – ${feetInches(hi)}`;
    }
    const deg = readable((m.angle * 180) / Math.PI);
    const [x, y] = centroid(m.points);
    const fs = px(12);
    const line1 = `${name} @ ${num(c.spacing, 2)}" o.c.${m.pitch != null ? ` · ${num(m.pitch, 2)}/12` : ""}`;
    // A light plate behind each line keeps the callout readable over members and plan text.
    const plate = (text: string, baseline: number) => {
      const w = text.length * fs * 0.6 + px(10);
      return (
        <rect
          x={x - w / 2}
          y={baseline - fs * 0.95}
          width={w}
          height={fs * 1.35}
          rx={px(3)}
          fill="white"
          fillOpacity={0.88}
          stroke={c.color}
          strokeOpacity={0.5}
          strokeWidth={1}
          {...stroke}
        />
      );
    };
    return (
      <g pointerEvents="none" transform={`rotate(${deg} ${x} ${y})`}>
        {plate(line1, y - px(14))}
        <text x={x} y={y - px(14)} textAnchor="middle" fontSize={fs} fontWeight={700} fill={c.color}>
          {line1}
        </text>
        {pieces ? (
          <>
            {plate(pieces, y + px(26))}
            <text x={x} y={y + px(26)} textAnchor="middle" fontSize={fs} fontWeight={600} fill={c.color}>
              {pieces}
            </text>
          </>
        ) : null}
      </g>
    );
  };

  /** Label along a wall run: "Ext 2x6 · 42'-6"". */
  const wallLabel = (c: ViewerCondition, m: ViewerMeasurement, upf: number) => {
    // On the longest straight piece; on a curved wall, at the middle of the curve.
    const path = shapePath(c.type, m);
    const total = polylineLength(path);
    let best = 0;
    for (let i = 1; i < path.length - 1; i++) if (dist(path[i], path[i + 1]) > dist(path[best], path[best + 1])) best = i;
    if (path.length > 2 && dist(path[best], path[best + 1]) < total * 0.2) best = Math.floor((path.length - 2) / 2);
    const a = path[best];
    const b = path[best + 1] ?? a;
    const x = (a[0] + b[0]) / 2;
    const y = (a[1] + b[1]) / 2;
    const deg = readable((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
    const text = `${c.name} · ${feetInches(total / upf)}`;
    const fs = px(11);
    const w = text.length * fs * 0.6 + px(10);
    return (
      <g pointerEvents="none" transform={`rotate(${deg} ${x} ${y})`}>
        <rect x={x - w / 2} y={y + px(9)} width={w} height={fs * 1.35} rx={px(3)} fill="white" fillOpacity={0.9} stroke={c.color} strokeOpacity={0.5} strokeWidth={1} {...stroke} />
        <text x={x} y={y + px(9) + fs * 0.98} textAnchor="middle" fontSize={fs} fontWeight={700} fill={c.color}>
          {text}
        </text>
      </g>
    );
  };

  /** Label along a hip / valley / ridge: "2x10 · 8/12 & 12/12 · 18'-4" → 20'". */
  const hipLabel = (c: ViewerCondition, m: ViewerMeasurement, upf: number) => {
    const { length } = hipLength(c, m, upf);
    const stock = parseStockLengths(c.stockLengths);
    const maxStock = stock?.length ? stock[stock.length - 1] : null;
    const own = m.pitch != null || m.pitch2 != null;
    const p1 = m.pitch ?? c.pitch;
    const p2 = m.pitch2 ?? (m.pitch != null ? m.pitch : (c.pitch2 ?? c.pitch));
    const pitchTag = own ? ` · ${num(p1, 2)}/12${p2 !== p1 ? ` & ${num(p2, 2)}/12` : ""}` : "";
    const text = `${c.memberSize?.trim() || c.name}${pitchTag} · ${feetInches(length)}${maxStock && length > maxStock + 1e-9 ? " (spliced)" : ""}`;
    return alongLabel(c, m, text);
  };

  /** A label riding along a line's longest segment. */
  const alongLabel = (c: ViewerCondition, m: ViewerMeasurement, text: string) => {
    // Middle of the longest segment, text running along it.
    let best = 0;
    for (let i = 1; i < m.points.length; i++) if (dist(m.points[i - 1], m.points[i]) > dist(m.points[best], m.points[best + 1] ?? m.points[best])) best = i - 1;
    const a = m.points[best];
    const b = m.points[best + 1] ?? a;
    const x = (a[0] + b[0]) / 2;
    const y = (a[1] + b[1]) / 2;
    const deg = readable((Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI);
    const fs = px(11);
    const w = text.length * fs * 0.6 + px(10);
    return (
      <g pointerEvents="none" transform={`rotate(${deg} ${x} ${y})`}>
        <rect
          x={x - w / 2}
          y={y - px(12) - fs * 0.95}
          width={w}
          height={fs * 1.35}
          rx={px(3)}
          fill="white"
          fillOpacity={0.9}
          stroke={c.color}
          strokeOpacity={0.5}
          strokeWidth={1}
          {...stroke}
        />
        <text x={x} y={y - px(12)} textAnchor="middle" fontSize={fs} fontWeight={700} fill={c.color}>
          {text}
        </text>
      </g>
    );
  };

  if (dirShape && dirCond && unitsPerFoot) {
    const dm = measurementMetrics(dirCond, { points: dirShape.points, arcs: dirShape.arcs, isDeduction: false, angle: dirAngle }, unitsPerFoot);
    readout = `${num(dm.members, 0)} members · ${num(dm.member_lf)} lf`;
  }

  const renderShape = (m: ViewerMeasurement) => {
    const c = condById.get(m.conditionId);
    if (!c || hidden.has(c.id)) return null;
    const isSel = m.id === selectedId;
    const color = c.color;
    const common = {
      "data-shape": m.id,
      onClick: (e: React.MouseEvent) => {
        if (tool !== "select" || panning || dirFor) return;
        e.stopPropagation();
        setSelectedId(m.id);
      },
      onDoubleClick: isSel ? onDoubleClickShape : undefined,
      style: {
        cursor: tool === "select" ? (isSel ? "move" : "pointer") : undefined,
      },
      opacity: m.pending ? 0.5 : 1,
    };
    if (c.type === "COUNT") {
      return (
        <g key={m.id} {...common}>
          {m.points.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r={px(isSel ? 9 : 7)} fill={color} fillOpacity={0.85} stroke="white" strokeWidth={2} {...stroke} />
          ))}
        </g>
      );
    }
    if (isUnitType(c.type)) {
      const door = doorById.get(m.materialItemId ?? "") ?? null;
      const [x, y] = m.points[0] ?? [0, 0];
      return (
        <g key={m.id} {...common}>
          <rect
            x={x - px(isSel ? 9 : 7)}
            y={y - px(isSel ? 9 : 7)}
            width={px(isSel ? 18 : 14)}
            height={px(isSel ? 18 : 14)}
            rx={px(2)}
            fill={door && m.cased !== false ? color : "white"}
            fillOpacity={0.9}
            stroke={door ? (m.cased === false ? color : "white") : "#dc2626"}
            strokeWidth={2}
            strokeDasharray={door ? undefined : "3 2"}
            {...stroke}
          />
          {c.type === "WINDOW" && door ? (
            <line x1={x - px(isSel ? 9 : 7)} y1={y} x2={x + px(isSel ? 9 : 7)} y2={y} stroke={m.cased === false ? color : "white"} strokeWidth={2} {...stroke} />
          ) : null}
          {showLabels ? (
            <text
              x={x}
              y={y}
              dy={-px(12)}
              transform={rotation ? `rotate(${-rotation} ${x} ${y})` : undefined}
              textAnchor="middle"
              fontSize={px(10)}
              fontWeight={700}
              fill={door ? color : "#dc2626"}
              stroke="white"
              strokeWidth={px(3)}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {door ? doorSizeCode(door.widthIn, door.heightIn) : "?"}
            </text>
          ) : null}
        </g>
      );
    }
    const d = shapePath(c.type, m)
      .map((p) => p.join(","))
      .join(" ");
    if (c.type === "WALL") {
      return (
        <g key={m.id} {...common}>
          <polyline points={d} fill="none" stroke="transparent" strokeWidth={16} {...stroke} />
          <polyline points={d} fill="none" stroke={color} strokeOpacity={0.85} strokeWidth={isSel ? 5 : 3} strokeLinejoin="miter" strokeLinecap="square" {...stroke} />
          {showLabels && unitsPerFoot && m.points.length >= 2 ? wallLabel(c, m, unitsPerFoot) : null}
        </g>
      );
    }
    if (c.type === "OPENING") {
      // A header line across the opening, with end ticks and its width.
      const [a, b] = [m.points[0], m.points[m.points.length - 1]];
      const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const tick = px(isSel ? 9 : 7);
      const nx = -Math.sin(ang) * tick;
      const ny = Math.cos(ang) * tick;
      const deg = readable((ang * 180) / Math.PI);
      const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      return (
        <g key={m.id} {...common}>
          <polyline points={d} fill="none" stroke="transparent" strokeWidth={14} {...stroke} />
          <polyline points={d} fill="none" stroke={color} strokeWidth={isSel ? 6 : 4} strokeLinecap="butt" {...stroke} />
          {[a, b].map((p, i) => (
            <line key={i} x1={p[0] - nx} y1={p[1] - ny} x2={p[0] + nx} y2={p[1] + ny} stroke={color} strokeWidth={2.5} {...stroke} />
          ))}
          {showLabels && unitsPerFoot ? (
            <text
              x={mid[0]}
              y={mid[1]}
              dy={-px(9)}
              transform={`rotate(${deg} ${mid[0]} ${mid[1]})`}
              textAnchor="middle"
              fontSize={px(10)}
              fontWeight={700}
              fill={color}
              stroke="white"
              strokeWidth={px(3)}
              paintOrder="stroke"
              pointerEvents="none"
            >
              {inchesText((polylineLength(m.points) / unitsPerFoot) * 12)}
            </text>
          ) : null}
        </g>
      );
    }
    if (c.type === "HIP_VALLEY" || c.type === "BEAM") {
      return (
        <g key={m.id} {...common}>
          <polyline points={d} fill="none" stroke="transparent" strokeWidth={14} {...stroke} />
          <polyline points={d} fill="none" stroke={color} strokeWidth={isSel ? 6 : 4} strokeLinejoin="round" strokeLinecap="round" {...stroke} />
          {m.points.map((p, i) =>
            i === 0 || i === m.points.length - 1 ? <circle key={i} cx={p[0]} cy={p[1]} r={px(3.5)} fill="white" stroke={color} strokeWidth={2} {...stroke} /> : null,
          )}
          {showLabels && unitsPerFoot && m.points.length >= 2 ? (c.type === "BEAM" ? alongLabel(c, m, beamLabel(c, m, unitsPerFoot)) : hipLabel(c, m, unitsPerFoot)) : null}
        </g>
      );
    }
    if (c.type === "LINEAR") {
      return (
        <g key={m.id} {...common}>
          <polyline points={d} fill="none" stroke="transparent" strokeWidth={12} {...stroke} />
          <polyline
            points={d}
            fill="none"
            stroke={color}
            strokeWidth={isSel ? 5 : 3}
            strokeDasharray={m.isDeduction ? "6 4" : undefined}
            strokeLinejoin="round"
            strokeLinecap="round"
            {...stroke}
          />
          {showLabels && m.height != null && m.points.length >= 2 ? alongLabel(c, m, `${num(m.height, 2)}' high`) : null}
        </g>
      );
    }
    const members =
      c.type === "FRAMING" && unitsPerFoot
        ? framingMembers(shapePath(c.type, m), m.angle, (c.spacing / 12) * unitsPerFoot, memberThickness(c.memberSize, unitsPerFoot, c.memberWidthIn))
        : [];
    return (
      <g key={m.id} {...common}>
        <polygon
          points={d}
          fill={m.isDeduction ? "white" : color}
          fillOpacity={m.isDeduction ? 0.7 : c.type === "FRAMING" ? 0.12 : 0.28}
          stroke={color}
          strokeWidth={isSel ? 4 : 2}
          strokeDasharray={m.isDeduction ? "6 4" : undefined}
          strokeLinejoin="round"
          {...stroke}
        />
        {members.map(([a, b], i) => (
          <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={1.25} {...stroke} />
        ))}
        {c.type === "FRAMING" && m.points.length >= 3 && !(dirFor && "id" in dirFor && dirFor.id === m.id) ? (
          <>
            {directionArrow(centroid(m.points), m.angle, color)}
            {showLabels && unitsPerFoot ? framingLabel(c, m, unitsPerFoot) : null}
          </>
        ) : null}
      </g>
    );
  };

  /** Pitch editor for the selected joist/rafter outline or hip/valley line. */
  const renderPitchEditor = (m: ViewerMeasurement, c: ViewerCondition) => {
    const editing = selPitch.id === m.id;
    const p1 = editing ? selPitch.p1 : m.pitch == null ? "" : String(m.pitch);
    const p2 = editing ? selPitch.p2 : m.pitch2 == null ? "" : String(m.pitch2);
    const hip = c.type === "HIP_VALLEY";
    return (
      <form
        className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-600"
        onSubmit={(e) => {
          e.preventDefault();
          patchShape(m.id, {
            pitch: pitchOrNull(p1),
            ...(hip ? { pitch2: pitchOrNull(p2) } : {}),
          });
          setSelPitch({ id: null, p1: "", p2: "" });
        }}
      >
        Pitch
        <input
          aria-label="Pitch for this shape"
          type="number"
          min="0"
          step="0.25"
          value={p1}
          placeholder={String(c.pitch)}
          onChange={(e) => setSelPitch({ id: m.id, p1: e.target.value, p2 })}
          className="w-12 rounded border border-slate-300 px-1 py-0.5"
        />
        {hip ? (
          <>
            &amp;
            <input
              aria-label="Side 2 pitch for this line"
              type="number"
              min="0"
              step="0.25"
              value={p2}
              placeholder={p1 || String(c.pitch2 ?? c.pitch)}
              onChange={(e) => setSelPitch({ id: m.id, p1, p2: e.target.value })}
              className="w-12 rounded border border-slate-300 px-1 py-0.5"
            />
          </>
        ) : null}
        /12
        <Button type="submit" size="sm" variant="secondary" disabled={!editing}>
          Apply
        </Button>
        {m.pitch != null || m.pitch2 != null ? (
          <button
            type="button"
            className="text-blue-700 underline"
            onClick={() => {
              patchShape(m.id, {
                pitch: null,
                ...(hip ? { pitch2: null } : {}),
              });
              setSelPitch({ id: null, p1: "", p2: "" });
            }}
          >
            use condition&apos;s
          </button>
        ) : (
          <span className="text-slate-400">(takeoff&apos;s)</span>
        )}
      </form>
    );
  };

  /** Wall height editor for the selected Linear line. */
  const renderHeightEditor = (m: ViewerMeasurement, c: ViewerCondition) => {
    const editing = selHeight.id === m.id;
    const h = editing ? selHeight.h : m.height == null ? "" : String(m.height);
    return (
      <form
        className="mt-2 flex flex-wrap items-center gap-1 text-xs text-slate-600"
        onSubmit={(e) => {
          e.preventDefault();
          patchShape(m.id, { height: heightOrNull(h) });
          setSelHeight({ id: null, h: "" });
        }}
      >
        Wall height
        <input
          aria-label="Wall height for this line"
          type="number"
          min="0"
          step="0.25"
          value={h}
          placeholder={c.height ? num(c.height, 2) : "8"}
          onChange={(e) => setSelHeight({ id: m.id, h: e.target.value })}
          className="w-14 rounded border border-slate-300 px-1 py-0.5"
        />
        ft
        <Button type="submit" size="sm" variant="secondary" disabled={!editing}>
          Apply
        </Button>
        {m.height != null ? (
          <button
            type="button"
            className="text-blue-700 underline"
            onClick={() => {
              patchShape(m.id, { height: null });
              setSelHeight({ id: null, h: "" });
            }}
          >
            use takeoff&apos;s
          </button>
        ) : (
          <span className="text-slate-400">(takeoff&apos;s)</span>
        )}
      </form>
    );
  };

  const sel = selected
    ? {
        m: selected,
        c: condById.get(selected.conditionId),
        q: shapeQuantity(selected),
      }
    : null;

  return (
    <div className="-mt-2 flex h-[calc(100vh-9rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Revisions ------------------------------------------------------------------------------ */}
      {prevRev || revision.replacedBy || revision.newer ? (
        <div
          className={cn(
            "flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1.5 text-xs",
            superseded ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-100 bg-blue-50/60 text-blue-950",
          )}
        >
          {revision.replacedBy ? (
            <>
              <strong>
                Rev {revision.revision} — replaced by Rev {revision.replacedBy.revision}.
              </strong>
              <span>Kept for comparing; its takeoffs moved to the new revision.</span>
              <Link href={`${base}/${revision.replacedBy.id}`} className="ml-auto font-semibold underline">
                Open Rev {revision.replacedBy.revision}
              </Link>
            </>
          ) : (
            <>
              <strong>Rev {revision.revision}</strong>
              {prevRev ? (
                prevRev.replaced ? (
                  <span>· takeoffs brought forward from Rev {prevRev.revision}</span>
                ) : (
                  <span>
                    · replaces Rev {prevRev.revision}, which still has {prevRev.sheets.reduce((n, x) => n + x.count, 0)} measurement(s)
                  </span>
                )
              ) : null}
              {revision.newer ? (
                <span>
                  · Rev {revision.newer.revision} is uploaded —{" "}
                  <Link href={`${base}/${revision.newer.id}`} className="font-semibold underline">
                    open it
                  </Link>
                </span>
              ) : null}
              <span className="ml-auto flex items-center gap-1.5">
                {prevRev ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCompare((c) => (c ? null : { fade: 0.85 }));
                      setAligning(null);
                      setForward(false);
                    }}
                    className={cn(
                      "rounded-md px-2 py-1 font-semibold ring-1 ring-inset",
                      compare ? "bg-blue-700 text-white ring-blue-700" : "bg-white text-blue-800 ring-blue-200 hover:bg-blue-50",
                    )}
                  >
                    {compare ? "Stop comparing" : `Compare with Rev ${prevRev.revision}`}
                  </button>
                ) : null}
                {prevRev && !prevRev.replaced ? (
                  <button
                    type="button"
                    onClick={() => {
                      setForward(true);
                      setCompare(null);
                    }}
                    className="rounded-md bg-blue-700 px-2 py-1 font-semibold text-white hover:bg-blue-800"
                  >
                    Bring takeoffs forward…
                  </button>
                ) : null}
              </span>
            </>
          )}
        </div>
      ) : null}
      {/* Toolbar ---------------------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
        <Link href={`/projects/${projectId}/plans`} className={buttonClasses("ghost", "sm")} title="All plan sets">
          <ArrowLeft className="h-3.5 w-3.5" /> Plans
        </Link>
        {/* One picker for every sheet of every plan set; the arrows step through the same list. */}
        <div className="flex items-center">
          <Link
            aria-label="Previous sheet"
            href={prevSheet ? `${base}/${prevSheet.planId}?page=${prevSheet.page}` : "#"}
            className={cn(buttonClasses("ghost", "sm"), !prevSheet && "pointer-events-none opacity-40")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <select
            aria-label="Sheet"
            className="input !h-8 !w-auto max-w-[22rem] !py-0 text-xs"
            value={`${plan.id}:${pageNumber}`}
            onChange={(e) => {
              const [planId, page] = e.target.value.split(":");
              router.push(`${base}/${planId}?page=${page}`);
            }}
          >
            {sheetGroups.map((g) => (
              <optgroup key={g.planId} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <Link
            aria-label="Next sheet"
            href={nextSheet ? `${base}/${nextSheet.planId}?page=${nextSheet.page}` : "#"}
            className={cn(buttonClasses("ghost", "sm"), !nextSheet && "pointer-events-none opacity-40")}
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
        {sheet ? (
          <form
            className="flex items-center"
            onSubmit={(e) => {
              e.preventDefault();
              const name = sheetName.trim();
              if (!name || name === sheet.name) return;
              startTransition(async () => {
                try {
                  await renameSheet({ projectId, sheetId: sheet.id, name });
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not rename the sheet");
                }
              });
            }}
          >
            <Pencil className="mr-1 h-3.5 w-3.5 text-slate-400" />
            <input
              aria-label="Sheet name"
              className="w-40 rounded border border-transparent px-1.5 py-1 text-xs hover:border-slate-300 focus:border-blue-500 focus:outline-none"
              value={sheetName}
              onChange={(e) => setSheetName(e.target.value)}
              onBlur={(e) => e.currentTarget.form?.requestSubmit()}
            />
          </form>
        ) : null}

        <div className="mx-1 h-6 w-px bg-slate-200" />

        {/* Scale */}
        <div className="flex items-center gap-1.5">
          <Scaling className={cn("h-4 w-4", unitsPerFoot ? "text-slate-400" : "text-amber-600")} />
          {plan.kind === "PDF" ? (
            <select
              aria-label="Scale"
              className={cn("input !h-8 !w-auto !py-0 text-xs", !unitsPerFoot && "!border-amber-400")}
              value={presetValue}
              disabled={!sheet}
              onChange={(e) => {
                const preset = PRESET_SCALES.find((s) => s.label === e.target.value);
                if (preset) applyScale(preset.paperInchesPerFoot * PDF_UNITS_PER_INCH, preset.label);
              }}
            >
              <option value="">{unitsPerFoot ? (sheet?.scaleLabel ?? "Custom") : "Set scale…"}</option>
              {PRESET_SCALES.map((s) => (
                <option key={s.label} value={s.label}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : (
            <span className={cn("text-xs", unitsPerFoot ? "text-slate-600" : "text-amber-700")}>{unitsPerFoot ? sheet?.scaleLabel : "No scale"}</span>
          )}
          <Button
            type="button"
            size="sm"
            variant={tool === "calibrate" ? "primary" : "secondary"}
            disabled={!sheet}
            onClick={() => {
              setTool(tool === "calibrate" ? "select" : "calibrate");
              setCalib([]);
              resetDraft();
            }}
            title="Click two ends of a known dimension"
          >
            <Ruler className="h-3.5 w-3.5" /> Calibrate
          </Button>
          <label className="flex items-center gap-1 text-xs text-slate-600" title="Use this scale on every sheet of this plan">
            <input type="checkbox" checked={applyToPlan} onChange={(e) => setApplyToPlan(e.target.checked)} className="h-3.5 w-3.5 rounded border-slate-300" />
            all sheets
          </label>
        </div>

        <div className="mx-1 h-6 w-px bg-slate-200" />

        {/* Tools */}
        <div className="flex items-center gap-1">
          <ToolButton active={tool === "select"} onClick={() => setTool("select")} title="Select (V) — click a shape; drag to pan">
            <MousePointer2 className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton active={tool === "pan"} onClick={() => setTool("pan")} title="Pan (hold Space)">
            <Hand className="h-3.5 w-3.5" />
          </ToolButton>
          <ToolButton
            active={tool === "ruler"}
            onClick={() => {
              setTool(tool === "ruler" ? "select" : "ruler");
              setRuler([]);
              setCalib([]);
            }}
            title="Ruler (R) — click two points to read a distance. Nothing is saved."
          >
            <RulerDimensionLine className="h-3.5 w-3.5" /> Ruler
          </ToolButton>
          <ToolButton
            active={tool === "measure"}
            disabled={!active || superseded}
            onClick={() => {
              setTool("measure");
              setCalib([]);
              if (active) showTakeoff(active.id);
            }}
            title="Measure (M) with the selected takeoff"
          >
            <Ruler className="h-3.5 w-3.5" /> Measure
          </ToolButton>
          {active && tool === "measure" && canArc(active.type) ? (
            <ToolButton active={arcNext} onClick={() => setArcNext((v) => !v)} title="Arc (A) — the next click is a point on the curve, the click after is where it ends">
              <Spline className="h-3.5 w-3.5" /> Arc
            </ToolButton>
          ) : null}
          {active && isCountType(active.type) && !superseded ? (
            <ToolButton
              active={tool === "autocount"}
              onClick={() => {
                if (tool === "autocount") {
                  stopAuto();
                  setTool("measure");
                } else startAuto();
              }}
              title="Auto-count — box one symbol and find every copy of it"
            >
              <ScanSearch className="h-3.5 w-3.5" /> Auto-count
            </ToolButton>
          ) : null}
          {active && (active.type === "AREA" || active.type === "LINEAR") ? (
            <ToolButton active={deduct} onClick={() => setDeduct((d) => !d)} title="Deduction (D) — subtracts from the takeoff">
              <Minus className="h-3.5 w-3.5" /> Deduct
            </ToolButton>
          ) : null}
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <button
            type="button"
            onClick={() => writeLabels(!showLabels)}
            title="Show or hide joist / rafter labels on the plan"
            aria-pressed={showLabels}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
              showLabels ? "border-blue-200 bg-blue-50 text-blue-800" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50",
            )}
          >
            <Tag className="h-3.5 w-3.5" /> Labels {showLabels ? "on" : "off"}
          </button>
          <button
            type="button"
            onClick={() => writeSnap(!snapOn)}
            title={
              snapOn
                ? `Snapping to the plan's lines and your takeoff points${vectors && !vectors.length ? " (this sheet has no line work — scanned?)" : ""}. Hold Alt to place freely.`
                : "Snapping off"
            }
            aria-pressed={snapOn}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
              snapOn ? "border-orange-200 bg-orange-50 text-orange-800" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50",
            )}
          >
            <Magnet className="h-3.5 w-3.5" /> Snap {snapOn ? "on" : "off"}
          </button>
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <ToolButton onClick={() => runHistory("undo")} disabled={historyCounts.undo === 0} title="Undo (Ctrl+Z)">
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </ToolButton>
          <ToolButton onClick={() => runHistory("redo")} disabled={historyCounts.redo === 0} title="Redo (Ctrl+Shift+Z / Ctrl+Y)">
            <Redo2 className="h-3.5 w-3.5" /> Redo
          </ToolButton>
          <Link
            href={`${base}/${plan.id}/print?pages=${pageNumber}`}
            target="_blank"
            className="inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            title="Print or save this sheet with the takeoff drawn on it"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </Link>
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <ToolButton active={panel === "totals"} onClick={() => togglePanel("totals")} title="Totals — each takeoff on this sheet and the whole job, updated as you measure">
            <Sigma className="h-3.5 w-3.5" /> Totals
          </ToolButton>
          <ToolButton active={panel === "materials"} onClick={() => togglePanel("materials")} title="Material list — everything the takeoff orders, updated as you measure">
            <ClipboardList className="h-3.5 w-3.5" /> Material list
          </ToolButton>
          <TakeoffMenu
            projectId={projectId}
            plan={{ id: plan.id, name: plan.name, revision: revision.revision, canRevise: !revision.replacedBy && !revision.newer }}
            here={`${base}/${plan.id}?page=${pageNumber}`}
            data={menu}
          />
        </div>

        <div className="ml-auto flex items-center gap-1">
          <ToolButton onClick={() => zoomAt(zoom / 1.25)} title="Zoom out (−)">
            <ZoomOut className="h-3.5 w-3.5" />
          </ToolButton>
          <button type="button" className="w-12 text-center text-xs tabular-nums text-slate-600 hover:text-slate-900" onClick={() => zoomAt(1)} title="100%">
            {Math.round(zoom * 100)}%
          </button>
          <ToolButton onClick={() => zoomAt(zoom * 1.25)} title="Zoom in (+)">
            <ZoomIn className="h-3.5 w-3.5" />
          </ToolButton>
          <Button type="button" variant="ghost" size="sm" onClick={fitWidth}>
            Fit
          </Button>
          <ToolButton
            onClick={() => {
              const next = (rotation + 90) % 360;
              writeRotation(sheetKey, next);
              // Fit the turned sheet to the width.
              const el = scrollRef.current;
              if (el && size) setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (el.clientWidth - 32) / (next % 180 ? size.h : size.w))));
            }}
            title={`Rotate the plan 90° (now ${rotation}°) — only how it's shown; your takeoffs stay put`}
          >
            <RotateCw className="h-3.5 w-3.5" />
            {rotation ? <span className="text-[11px] tabular-nums">{rotation}°</span> : null}
          </ToolButton>
        </div>
      </div>

      {/* Hint / status bar */}
      <div className="flex min-h-8 flex-wrap items-center gap-3 border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-xs text-slate-600">
        {error ? (
          <span className="flex items-center gap-2 text-rose-700">
            {error}
            <button type="button" className="underline" onClick={() => setError(null)}>
              dismiss
            </button>
          </span>
        ) : dirFor ? (
          <span>
            <strong className="font-medium text-slate-800">Member direction:</strong>{" "}
            {edgePick ? "click a wall of the outline — members run parallel to it." : "pick Horizontal (H), Vertical (V) or Parallel to a wall (E)."}{" "}
            {"points" in dirFor ? "Enter = the closer of horizontal / vertical" : "Enter = keep the current direction"} · Esc = cancel.
          </span>
        ) : tool === "autocount" ? (
          <span>
            <strong className="font-medium text-slate-800">Auto-count{active ? ` · ${active.name}` : ""}:</strong> drag a box around one symbol. Found ones show as dashed rings —
            click a ring to leave it out, then Add. Esc = cancel.
          </span>
        ) : tool === "ruler" ? (
          <span>
            <strong className="font-medium text-slate-800">Ruler:</strong> click two points to read the distance — nothing is saved. Click again to start a new one · Shift =
            straight · Esc = clear.
            {!unitsPerFoot ? <strong className="ml-1 text-amber-700">Set the scale first.</strong> : null}
          </span>
        ) : tool === "calibrate" ? (
          <span>
            <strong className="font-medium text-slate-800">Calibrate:</strong>{" "}
            {calib.length === 0
              ? "Step 1 of 3 — click one end of a dimension you know (the longer the better). Shift keeps it straight."
              : calib.length === 1
                ? "Step 2 of 3 — click the other end."
                : "Step 3 of 3 — type how long that line is in the box on the plan, then Set scale."}
          </span>
        ) : tool === "measure" && active ? (
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: active.color }} />
            <strong className="font-medium text-slate-800">{active.name}</strong>
            {deduct && (active.type === "AREA" || active.type === "LINEAR") ? <strong className="ml-1 text-rose-700">(deduction)</strong> : null} —{" "}
            {isUnitType(active.type)
              ? `click each ${unitKind(active.type)} — it goes in as the one in the panel. Select a marker to change which ${unitKind(active.type)} it is.`
              : active.type === "COUNT"
                ? "click each item."
                : active.type === "WALL"
                  ? "click each corner along the wall; right-click, double-click or Enter to finish the run (end on the first corner to close the building)."
                  : active.type === "OPENING"
                    ? "click one side of the opening, then the other. Each line is one opening; its length is the width."
                    : active.type === "HIP_VALLEY"
                      ? "click the wall corner, then the ridge end; right-click, double-click or Enter to finish. Each line is one piece."
                      : active.type === "BEAM"
                        ? "click one bearing end, then the other; right-click, double-click or Enter to finish. Each line is one beam — the bearing is added at both ends."
                        : active.type === "LINEAR"
                          ? "click points along the line; right-click, double-click or Enter to finish."
                          : "click the corners; click the first point, right-click, double-click or Enter to close."}{" "}
            {arcNext ? (
              <strong className="mr-1 text-amber-700">Arc: click a point on the curve, then where it ends.</strong>
            ) : draftArcs.includes(draft.length - 1) && draft.length > 0 ? (
              <strong className="mr-1 text-amber-700">Arc: click where the curve ends.</strong>
            ) : null}
            {!isCountType(active.type) ? `Shift = straight${canArc(active.type) ? " · A = arc" : ""} · Backspace = undo point · Esc = cancel.` : null}
            {active.type === "FRAMING" ? " After closing the outline you'll choose horizontal, vertical or parallel to a wall." : null}
            {!unitsPerFoot && !isCountType(active.type) ? <strong className="ml-1 text-amber-700">Set the scale first.</strong> : null}
            {hasShapePitch(active.type) ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200">
                Pitch for next {active.type === "HIP_VALLEY" ? "line" : "outline"}:
                <input
                  aria-label="Pitch for next shape"
                  type="number"
                  min="0"
                  step="0.25"
                  value={nextPitch.p1}
                  placeholder={String(active.pitch)}
                  onChange={(e) =>
                    setNextPitch({
                      forId: active.id,
                      p1: e.target.value,
                      p2: nextPitch.p2,
                    })
                  }
                  className="w-12 rounded border border-slate-300 px-1 py-0.5 text-xs"
                />
                {active.type === "HIP_VALLEY" ? (
                  <>
                    &amp;
                    <input
                      aria-label="Side 2 pitch for next line"
                      type="number"
                      min="0"
                      step="0.25"
                      value={nextPitch.p2}
                      placeholder={nextPitch.p1 || String(active.pitch2 ?? active.pitch)}
                      onChange={(e) =>
                        setNextPitch({
                          forId: active.id,
                          p1: nextPitch.p1,
                          p2: e.target.value,
                        })
                      }
                      className="w-12 rounded border border-slate-300 px-1 py-0.5 text-xs"
                    />
                  </>
                ) : null}
                /12
                {nextPitch.p1 || nextPitch.p2 ? (
                  <button type="button" className="ml-1 text-blue-700 underline" onClick={() => setNextPitch({ forId: active.id, p1: "", p2: "" })}>
                    use condition&apos;s
                  </button>
                ) : (
                  <span className="text-slate-400">(blank = takeoff&apos;s)</span>
                )}
              </span>
            ) : null}
            {active.type === "LINEAR" ? (
              <span className="ml-2 inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200">
                Wall height for next line:
                <input
                  aria-label="Wall height for next line"
                  type="number"
                  min="0"
                  step="0.25"
                  value={nextHeight[active.id] ?? ""}
                  placeholder={active.height ? num(active.height, 2) : "8"}
                  onChange={(e) => setNextHeight((cur) => ({ ...cur, [active.id]: e.target.value }))}
                  className="w-14 rounded border border-slate-300 px-1 py-0.5 text-xs"
                />
                ft
                {nextHeight[active.id] ? (
                  <button type="button" className="ml-1 text-blue-700 underline" onClick={() => setNextHeight((cur) => ({ ...cur, [active.id]: "" }))}>
                    use takeoff&apos;s
                  </button>
                ) : (
                  <span className="text-slate-400">(blank = takeoff&apos;s{active.height ? ` ${num(active.height, 2)}'` : ""})</span>
                )}
              </span>
            ) : null}
          </span>
        ) : (
          <span>
            {unitsPerFoot ? null : <strong className="mr-2 text-amber-700">This sheet has no scale — pick one or calibrate.</strong>}
            {tool === "select" && selected
              ? "Drag a point or the shape to move it · double-click an edge to add a point · double-click a point to curve or straighten it · right-click a point to remove it · Ctrl+C / Ctrl+V / Ctrl+D copy, paste, duplicate · Ctrl+Z undo."
              : "Pick a takeoff on the left, then Measure. Scroll to zoom; right-drag (or hold Space) to pan. Right-click finishes a shape. Ctrl+Z undoes."}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Conditions panel ------------------------------------------------------------------- */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200">
          {/* Quick add sits at the top, so it's always in reach */}
          <form
            className="space-y-2 border-b border-slate-200 bg-slate-50/60 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newCondName.trim();
              if (!name) return;
              startTransition(async () => {
                try {
                  const { id } = await quickCreateCondition({
                    projectId,
                    name,
                    type: newCondType,
                  });
                  setNewCondName("");
                  setActiveId(id);
                  setTool("measure");
                  // Walls and openings need their options set: open the new condition's settings.
                  if (["WALL", "OPENING", "DOOR", "WINDOW"].includes(newCondType)) router.push(editHref(id), { scroll: false });
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not add the takeoff");
                }
              });
            }}
          >
            <div className="flex items-center justify-between">
              <p className="label !mb-0">Quick add</p>
              <Link href={editHref("new")} scroll={false} className="text-xs text-blue-700 hover:underline">
                More options
              </Link>
            </div>
            <input
              value={newCondName}
              onChange={(e) => setNewCondName(e.target.value)}
              placeholder="Takeoff name"
              className="input !py-1.5 text-xs"
              aria-label="New takeoff name"
            />
            <div className="flex gap-2">
              <select value={newCondType} onChange={(e) => setNewCondType(e.target.value as ConditionType)} className="input !py-1.5 text-xs" aria-label="New takeoff type">
                {CONDITION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {CONDITION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" disabled={!newCondName.trim()}>
                <Plus className="h-3.5 w-3.5" /> Add
              </Button>
            </div>
          </form>
          <div className="flex items-center gap-2 py-2 pl-3 pr-2">
            <p className="label !mb-0 flex-1">Takeoffs</p>
            {conditions.length ? (
              // One click for a clean plan: hide every condition (or show them all again).
              <button
                type="button"
                aria-label={allHidden ? "Show all takeoffs" : "Hide all takeoffs"}
                title={allHidden ? "Show all takeoffs" : "Hide all takeoffs — a clean plan"}
                className={cn("rounded p-1 hover:bg-slate-100", allHidden ? "text-blue-700" : "text-slate-400 hover:text-slate-700")}
                onClick={() => {
                  if (allHidden) setHidden(new Set());
                  else {
                    setHidden(new Set(conditions.map((c) => c.id)));
                    setSelectedId(null);
                  }
                }}
              >
                {allHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            ) : null}
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {conditions.length === 0 ? <li className="px-3 py-2 text-xs text-slate-500">No takeoffs yet — add one above.</li> : null}
            {listed.map((c) => {
              const isActive = c.id === activeId;
              const isHidden = hidden.has(c.id);
              const info = infoOpen.has(c.id) ? totalsPanel.conditions.find((t) => t.id === c.id) : undefined;
              return (
                <li
                  key={c.id}
                  className={cn("relative", dragId === c.id && "opacity-40")}
                  onDragOver={(e) => {
                    if (!dragId || dragId === c.id) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const r = e.currentTarget.getBoundingClientRect();
                    const after = e.clientY > r.top + r.height / 2;
                    if (dropAt?.id !== c.id || dropAt.after !== after) setDropAt({ id: c.id, after });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!dragId || !dropAt) return;
                    const ids = listed.map((x) => x.id).filter((id) => id !== dragId);
                    const at = ids.indexOf(dropAt.id) + (dropAt.after ? 1 : 0);
                    ids.splice(at, 0, dragId);
                    setDragId(null);
                    setDropAt(null);
                    reorder(ids);
                  }}
                >
                  {dropAt?.id === c.id ? (
                    <span className={cn("pointer-events-none absolute inset-x-1 z-10 h-0.5 rounded bg-blue-600", dropAt.after ? "-bottom-px" : "-top-px")} />
                  ) : null}
                  {/* Drag handle — in the row's left padding, so nothing shifts when it shows. */}
                  <span
                    draggable
                    title="Drag to reorder (or Alt + ↑ / ↓)"
                    aria-hidden
                    onDragStart={(e) => {
                      setDragId(c.id);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", c.id);
                      const row = e.currentTarget.parentElement;
                      if (row) e.dataTransfer.setDragImage(row, 24, 18);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setDropAt(null);
                    }}
                    className="absolute left-0.5 top-2 z-10 flex h-6 w-3 cursor-grab items-center justify-center text-slate-400 opacity-0 transition-opacity hover:text-slate-700 active:cursor-grabbing [li:hover>&]:opacity-100"
                  >
                    <GripVertical className="h-3.5 w-3.5" />
                  </span>
                  <div
                    role="button"
                    tabIndex={0}
                    data-cond-row={c.id}
                    onClick={() => {
                      setActiveId(c.id);
                      setTool("measure");
                      resetDraft();
                      // Measuring a takeoff shows it, so you can see what's already measured.
                      showTakeoff(c.id);
                      if (c.type !== "AREA" && c.type !== "LINEAR") setDeduct(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                        e.preventDefault();
                        const ids = listed.map((x) => x.id);
                        const i = ids.indexOf(c.id);
                        const j = i + (e.key === "ArrowUp" ? -1 : 1);
                        if (j < 0 || j >= ids.length) return;
                        [ids[i], ids[j]] = [ids[j], ids[i]];
                        reorder(ids);
                        requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-cond-row="${c.id}"]`)?.focus());
                        return;
                      }
                      if (e.key === "Enter") {
                        setActiveId(c.id);
                        setTool("measure");
                        showTakeoff(c.id);
                      }
                    }}
                    className={cn("flex cursor-pointer items-start gap-2 border-l-4 px-3 py-2 hover:bg-slate-50", isActive ? "bg-blue-50/60" : "border-transparent")}
                    style={isActive ? { borderLeftColor: c.color } : undefined}
                  >
                    <span
                      className="mt-1 h-3 w-3 shrink-0 rounded-sm"
                      style={{
                        background: c.color,
                        opacity: isHidden ? 0.3 : 1,
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-sm font-medium text-slate-900">{c.name}</span>
                        {c.referenceOnly ? (
                          <span
                            className="shrink-0 rounded bg-slate-100 px-1 text-[10px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200"
                            title="Reference only — not on the estimate"
                          >
                            Reference
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-slate-500">
                        {CONDITION_TYPE_LABELS[c.type as ConditionType] ?? c.type}
                        {c.pitch > 0 ? ` · ${num(c.pitch, 2)}/12` : ""}
                        {c.type === "BEAM"
                          ? (() => {
                              const b = beamOptions(c.options);
                              return `${c.memberSize ? ` · ${c.memberSize}` : ""}${b.plies > 1 ? ` ×${b.plies}` : ""} · ${num(b.bearingIn, 2)}" bearing`;
                            })()
                          : null}
                        {c.type === "HIP_VALLEY"
                          ? !(c.pitch > 0) || c.pitch2 === 0
                            ? " · level"
                            : c.pitch2 != null && c.pitch2 !== c.pitch
                              ? ` & ${num(c.pitch2, 2)}/12`
                              : ""
                          : ""}
                      </span>
                      <span className="block text-xs tabular-nums text-slate-700">
                        Sheet {num(c.sheetTotal)} · All {num(c.total)} {c.unit}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={infoOpen.has(c.id) ? `Hide details of ${c.name}` : `Show details of ${c.name}`}
                      aria-expanded={infoOpen.has(c.id)}
                      title="Details — totals, price and what it orders"
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        setInfoOpen((cur) => {
                          const n = new Set(cur);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        });
                      }}
                    >
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", infoOpen.has(c.id) && "rotate-180")} />
                    </button>
                    <Link
                      href={editHref(c.id)}
                      scroll={false}
                      aria-label={`Edit ${c.name}`}
                      title="Edit takeoff"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      type="button"
                      aria-label={isHidden ? `Show ${c.name}` : `Hide ${c.name}`}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      onClick={(e) => {
                        e.stopPropagation();
                        setHidden((h) => {
                          const n = new Set(h);
                          if (n.has(c.id)) n.delete(c.id);
                          else n.add(c.id);
                          return n;
                        });
                      }}
                    >
                      {isHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  {info ? (
                    <div className="space-y-1.5 border-b border-slate-100 bg-slate-50/70 px-3 py-2 pl-8 text-xs text-slate-600">
                      <p>
                        This sheet{" "}
                        <strong className="tabular-nums text-slate-900">
                          {num(info.sheet)} {info.unit}
                        </strong>{" "}
                        · Job{" "}
                        <strong className="tabular-nums text-slate-900">
                          {num(info.job)} {info.unit}
                        </strong>
                        {info.wastePct > 0 ? (
                          <span className="block">
                            With {num(info.wastePct, 1)}% waste: {num(info.withWaste)} {info.unit}
                          </span>
                        ) : null}
                      </p>
                      <p>
                        Price <strong className="tabular-nums text-slate-900">{money(info.price)}</strong> <span className="text-slate-400">incl. markup</span>
                        {info.unscaled ? <span className="block text-amber-700">{info.unscaled} shape(s) on sheets with no scale aren&apos;t counted</span> : null}
                      </p>
                      {info.lines.length ? (
                        <ul className="space-y-0.5 border-t border-slate-200 pt-1.5">
                          {info.lines.map((l, i) => (
                            <li key={i} className="flex gap-2">
                              <span className="min-w-0 flex-1 truncate" title={l.name}>
                                {l.name}
                              </span>
                              <span className="shrink-0 tabular-nums text-slate-800">
                                {num(l.quantity)} {l.unit}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-400">Orders nothing yet — add items with the pencil.</p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Plan ----------------------------------------------------------------------------- */}
        <div className="relative min-w-0 flex-1">
          {/* Calibrating: the length goes in a card on the plan itself, right where you're looking. */}
          {tool === "calibrate" && calib.length === 2 ? (
            <form
              className="absolute left-1/2 top-3 z-30 w-[min(92%,24rem)] -translate-x-1/2 rounded-xl border border-red-200 bg-white p-4 shadow-xl"
              onSubmit={(e) => {
                e.preventDefault();
                if (calibLength > 0) applyScale(dist(calib[0], calib[1]) / calibLength, "Calibrated");
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setCalib([]);
                }
              }}
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-red-600" /> How long is that red line?
              </p>
              <p className="mt-0.5 text-xs text-slate-500">The real distance, from the dimension on the plan.</p>
              <div className="mt-3 flex items-end gap-2">
                <label className="flex-1">
                  <span className="label">Feet</span>
                  <input
                    autoFocus
                    aria-label="Feet"
                    inputMode="decimal"
                    value={calibFeet}
                    onChange={(e) => setCalibFeet(e.target.value)}
                    className="input text-lg tabular-nums"
                    placeholder="24"
                  />
                </label>
                <label className="w-24">
                  <span className="label">Inches</span>
                  <input
                    aria-label="Inches"
                    inputMode="decimal"
                    value={calibInches}
                    onChange={(e) => setCalibInches(e.target.value)}
                    className="input text-lg tabular-nums"
                    placeholder="0"
                  />
                </label>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button type="submit" disabled={calibLength <= 0}>
                  Set scale
                </Button>
                <Button type="button" variant="ghost" onClick={() => setCalib([])}>
                  Redo the line
                </Button>
                <span className="ml-auto text-[11px] text-slate-400">Enter = set · Esc = redo</span>
              </div>
            </form>
          ) : null}
          {/* Live readout floats over the plan so the canvas never shifts under the cursor */}
          {flash ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 text-xs">
              <span className="rounded bg-emerald-600 px-2.5 py-1 font-medium text-white shadow">{flash}</span>
            </div>
          ) : null}
          {readout && !dirFor ? (
            <span
              className={cn(
                "pointer-events-none absolute top-3 z-30",
                panel && !editor ? "left-3" : "right-3",
                "rounded bg-slate-900 px-2 py-0.5 text-xs font-medium tabular-nums text-white shadow",
              )}
            >
              {readout}
            </span>
          ) : null}
          <div ref={scrollRef} className="absolute inset-0 overflow-auto bg-slate-200/70 p-4">
            <div className="relative inline-block shadow-md" style={size ? { width: (sideways ? size.h : size.w) * zoom, height: (sideways ? size.w : size.h) * zoom } : undefined}>
              {/* The sheet and its takeoff, turned together (rotation is view-only). */}
              <div
                className="absolute left-0 top-0 origin-top-left"
                style={
                  size
                    ? {
                        width: size.w * zoom,
                        height: size.h * zoom,
                        transform:
                          rotation === 90
                            ? `translate(${size.h * zoom}px, 0) rotate(90deg)`
                            : rotation === 180
                              ? `translate(${size.w * zoom}px, ${size.h * zoom}px) rotate(180deg)`
                              : rotation === 270
                                ? `translate(0, ${size.w * zoom}px) rotate(270deg)`
                                : undefined,
                      }
                    : undefined
                }
              >
                <PlanCanvas
                  url={plan.fileUrl}
                  kind={plan.kind}
                  pageNumber={pageNumber}
                  zoom={zoom}
                  onSize={onSize}
                  onPageCount={plan.kind === "PDF" ? onPageCount : undefined}
                  onVectors={setVectors}
                />
                {compare && prevRev && pairSheet && size ? (
                  <RevisionOverlay
                    oldSrc={{ url: prevRev.fileUrl, kind: prevRev.kind, page: pairSheet.pageNumber }}
                    newSrc={{ url: plan.fileUrl, kind: plan.kind, page: pageNumber }}
                    align={sheetAlign}
                    zoom={zoom}
                    size={size}
                    fade={compare.fade}
                    onDiff={setDiff}
                  />
                ) : null}
                {size ? (
                  <svg
                    ref={svgRef}
                    className={cn("absolute inset-0 touch-none select-none", cursorClass)}
                    width={size.w * zoom}
                    height={size.h * zoom}
                    viewBox={`0 0 ${size.w} ${size.h}`}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerLeave={() => {
                      setCursor(null);
                      if (!drag) setSnapHit(null);
                    }}
                    onClick={onClick}
                    onContextMenu={(e) => {
                      if (suppressContext.current) {
                        suppressContext.current = false;
                        e.preventDefault();
                        return;
                      }
                      if (draft.length) {
                        e.preventDefault();
                        finishDraft(draft);
                      }
                    }}
                  >
                    {shapes.map(renderShape)}
                    {changedShapes.map(({ m, box }) => (
                      <rect
                        key={`chg-${m.id}`}
                        x={box.x}
                        y={box.y}
                        width={box.w}
                        height={box.h}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={2.5 / zoom}
                        strokeDasharray={`${6 / zoom} ${4 / zoom}`}
                        pointerEvents="none"
                      />
                    ))}
                    {aligning
                      ? [...aligning.old.map((q, i) => ({ q, c: "#dc2626", n: i + 1 })), ...aligning.now.map((q, i) => ({ q, c: "#1d4ed8", n: i + 1 }))].map(({ q, c, n }) => (
                          <g key={`${c}${n}`} pointerEvents="none">
                            <circle cx={q[0]} cy={q[1]} r={7 / zoom} fill="none" stroke={c} strokeWidth={2 / zoom} />
                            <path d={`M${q[0] - 11 / zoom} ${q[1]} H${q[0] + 11 / zoom} M${q[0]} ${q[1] - 11 / zoom} V${q[1] + 11 / zoom}`} stroke={c} strokeWidth={1.5 / zoom} />
                            <text x={q[0] + 10 / zoom} y={q[1] - 10 / zoom} fontSize={12 / zoom} fontWeight={700} fill={c}>
                              {n}
                            </text>
                          </g>
                        ))
                      : null}
                    {autoOn && autoPlan ? (
                      <FoundMarkers
                        rows={autoPlan.pages.find((pg) => pg.page === pageNumber)?.rows ?? []}
                        color={active!.color}
                        zoom={zoom}
                        onToggle={(key) => setAuto((a) => a && { ...a, rejected: a.rejected.includes(key) ? a.rejected.filter((k) => k !== key) : [...a.rejected, key] })}
                      />
                    ) : null}
                    {autoOn && auto.sample && auto.sample.pageNumber === pageNumber ? (
                      <rect
                        x={auto.sample.box.x}
                        y={auto.sample.box.y}
                        width={auto.sample.box.w}
                        height={auto.sample.box.h}
                        fill="none"
                        stroke="#1d4ed8"
                        strokeWidth={1.5 / zoom}
                        pointerEvents="none"
                      />
                    ) : null}
                    {autoBox ? (
                      <rect
                        x={Math.min(autoBox.a[0], autoBox.b[0])}
                        y={Math.min(autoBox.a[1], autoBox.b[1])}
                        width={Math.abs(autoBox.a[0] - autoBox.b[0])}
                        height={Math.abs(autoBox.a[1] - autoBox.b[1])}
                        fill="#3b82f6"
                        fillOpacity={0.08}
                        stroke="#1d4ed8"
                        strokeWidth={1.5 / zoom}
                        strokeDasharray={`${4 / zoom} ${3 / zoom}`}
                        pointerEvents="none"
                      />
                    ) : null}

                    {/* Point handles on the selected shape: drag to move, double-click to curve / straighten, right-click to remove. Arc points are round. */}
                    {tool === "select" && selected && !selected.pending && !dirFor
                      ? selected.points.map((p, i) => (
                          <rect
                            key={`h${i}`}
                            data-handle={i}
                            x={p[0] - px(5)}
                            y={p[1] - px(5)}
                            width={px(10)}
                            height={px(10)}
                            rx={selected.arcs?.includes(i) ? px(5) : 0}
                            fill={selected.arcs?.includes(i) ? "#fde68a" : "white"}
                            stroke="#0f172a"
                            strokeWidth={1.5}
                            style={{ cursor: "grab" }}
                            onDoubleClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const c = condById.get(selected.conditionId);
                              if (!c || !canArc(c.type)) return;
                              const arcs = selected.arcs ?? [];
                              if (arcs.includes(i)) return patchShape(selected.id, { points: selected.points, arcs: arcs.filter((j) => j !== i) });
                              const closed = !isLineType(c.type);
                              const n = selected.points.length;
                              if (i === 0 || (!closed && i === n - 1)) return setFlash("An end point can't be an arc point — pick a point between two others");
                              if (arcs.includes(i - 1) || arcs.includes(closed ? (i + 1) % n : i + 1))
                                return setFlash("The points on each side of an arc point have to be corners");
                              patchShape(selected.id, { points: selected.points, arcs: [...arcs, i].sort((a, b) => a - b) });
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const c = condById.get(selected.conditionId);
                              if (!c || selected.points.length <= minPoints(c.type)) return setFlash("A shape needs at least " + (c ? minPoints(c.type) : 2) + " points");
                              patchShape(selected.id, {
                                points: selected.points.filter((_, j) => j !== i),
                                arcs: (selected.arcs ?? []).filter((j) => j !== i).map((j) => (j > i ? j - 1 : j)),
                              });
                            }}
                            {...stroke}
                          />
                        ))
                      : null}

                    {/* Snap marker: square = line end, diamond = on a line, circle = takeoff point */}
                    {snapHit && (tool === "measure" || tool === "calibrate" || tool === "ruler" || drag?.mode === "vertex") ? (
                      <g pointerEvents="none">
                        {snapHit.kind === "end" ? (
                          <rect x={snapHit.point[0] - px(6)} y={snapHit.point[1] - px(6)} width={px(12)} height={px(12)} fill="none" stroke="#f97316" strokeWidth={2} {...stroke} />
                        ) : snapHit.kind === "line" ? (
                          <polygon
                            points={[
                              [snapHit.point[0], snapHit.point[1] - px(7)],
                              [snapHit.point[0] + px(7), snapHit.point[1]],
                              [snapHit.point[0], snapHit.point[1] + px(7)],
                              [snapHit.point[0] - px(7), snapHit.point[1]],
                            ]
                              .map((q) => q.join(","))
                              .join(" ")}
                            fill="none"
                            stroke="#f97316"
                            strokeWidth={2}
                            {...stroke}
                          />
                        ) : (
                          <circle cx={snapHit.point[0]} cy={snapHit.point[1]} r={px(7)} fill="none" stroke="#f97316" strokeWidth={2} {...stroke} />
                        )}
                      </g>
                    ) : null}

                    {/* Shape being drawn */}
                    {tool === "measure" && active && preview.length > 0 ? (
                      <g pointerEvents="none">
                        {isLineType(active.type) ? (
                          <polyline
                            points={previewPath.map((p) => p.join(",")).join(" ")}
                            fill="none"
                            stroke={active.color}
                            strokeWidth={active.type === "HIP_VALLEY" || active.type === "BEAM" ? 4 : 3}
                            strokeDasharray={deduct ? "6 4" : undefined}
                            {...stroke}
                          />
                        ) : (
                          <polygon
                            points={previewPath.map((p) => p.join(",")).join(" ")}
                            fill={active.color}
                            fillOpacity={0.15}
                            stroke={active.color}
                            strokeWidth={2}
                            strokeDasharray="6 4"
                            {...stroke}
                          />
                        )}
                        {draft.map((p, i) => (
                          <circle
                            key={i}
                            cx={p[0]}
                            cy={p[1]}
                            r={px(i === 0 ? 5 : 3.5)}
                            fill={draftArcs.includes(i) ? active.color : "white"}
                            stroke={active.color}
                            strokeWidth={2}
                            {...stroke}
                          />
                        ))}
                      </g>
                    ) : null}

                    {/* Framing direction being picked */}
                    {dirShape && dirCond ? (
                      <g pointerEvents="none">
                        <polygon
                          points={arcPath(dirShape.points, dirShape.arcs, true)
                            .map((p) => p.join(","))
                            .join(" ")}
                          fill={dirCond.color}
                          fillOpacity={0.12}
                          stroke={dirCond.color}
                          strokeWidth={2}
                          strokeDasharray="6 4"
                          {...stroke}
                        />
                        {unitsPerFoot
                          ? framingMembers(
                              dirShape.points,
                              dirAngle,
                              (dirCond.spacing / 12) * unitsPerFoot,
                              memberThickness(dirCond.memberSize, unitsPerFoot, dirCond.memberWidthIn),
                            ).map(([a, b], i) => (
                              <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={dirCond.color} strokeWidth={1.25} strokeDasharray="4 3" {...stroke} />
                            ))
                          : null}
                        {hoverEdge !== null
                          ? (() => {
                              const a = dirShape.points[hoverEdge];
                              const b = dirShape.points[(hoverEdge + 1) % dirShape.points.length];
                              return <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#0f172a" strokeWidth={5} strokeLinecap="round" {...stroke} />;
                            })()
                          : null}
                        {directionArrow(centroid(dirShape.points), dirAngle, dirCond.color)}
                      </g>
                    ) : null}

                    {/* Ruler */}
                    {tool === "ruler" && ruler.length > 0 && unitsPerFoot
                      ? (() => {
                          const a = ruler[0];
                          const b = ruler[1] ?? (cursor ? snap(cursor, a) : null);
                          if (!b) return <circle cx={a[0]} cy={a[1]} r={px(4)} fill="#0f172a" stroke="white" strokeWidth={2} pointerEvents="none" {...stroke} />;
                          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
                          const nx = -Math.sin(ang) * px(7);
                          const ny = Math.cos(ang) * px(7);
                          const deg = readable((ang * 180) / Math.PI);
                          const mx = (a[0] + b[0]) / 2;
                          const my = (a[1] + b[1]) / 2;
                          return (
                            <g pointerEvents="none">
                              <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#0f172a" strokeWidth={2} strokeDasharray={ruler[1] ? undefined : "6 4"} {...stroke} />
                              {[a, b].map((p, i) => (
                                <line key={i} x1={p[0] - nx} y1={p[1] - ny} x2={p[0] + nx} y2={p[1] + ny} stroke="#0f172a" strokeWidth={2} {...stroke} />
                              ))}
                              <text
                                x={mx}
                                y={my}
                                dy={-px(9)}
                                transform={`rotate(${deg} ${mx} ${my})`}
                                textAnchor="middle"
                                fontSize={px(13)}
                                fontWeight={700}
                                fill="#0f172a"
                                stroke="white"
                                strokeWidth={px(4)}
                                paintOrder="stroke"
                              >
                                {feetInches(dist(a, b) / unitsPerFoot)}
                              </text>
                            </g>
                          );
                        })()
                      : null}

                    {/* Calibration line */}
                    {tool === "calibrate" && calib.length > 0 ? (
                      <g pointerEvents="none">
                        {(() => {
                          const end = calib[1] ?? (cursor ? snap(cursor, calib[0]) : null);
                          return end ? <line x1={calib[0][0]} y1={calib[0][1]} x2={end[0]} y2={end[1]} stroke="#dc2626" strokeWidth={2} strokeDasharray="8 4" {...stroke} /> : null;
                        })()}
                        {calib.map((p, i) => (
                          <circle key={i} cx={p[0]} cy={p[1]} r={px(5)} fill="#dc2626" stroke="white" strokeWidth={2} {...stroke} />
                        ))}
                      </g>
                    ) : null}

                    {/* Selected shape label */}
                    {sel?.q && sel.c && sel.m.points.length ? (
                      <g pointerEvents="none">
                        {(() => {
                          const [x, y] = sel.c.type === "LINEAR" || isCountType(sel.c.type) ? sel.m.points[0] : centroid(sel.m.points);
                          const text = `${sel.m.isDeduction ? "−" : ""}${num(Math.abs(sel.q.value))} ${sel.q.unit}`;
                          return (
                            <text
                              x={x}
                              y={y}
                              dy={px(-12)}
                              transform={rotation ? `rotate(${-rotation} ${x} ${y})` : undefined}
                              textAnchor="middle"
                              fontSize={px(13)}
                              fontWeight={600}
                              fill="#0f172a"
                              stroke="white"
                              strokeWidth={px(4)}
                              paintOrder="stroke"
                            >
                              {text}
                            </text>
                          );
                        })()}
                      </g>
                    ) : null}
                  </svg>
                ) : null}
              </div>
            </div>
          </div>

          {editor ? (
            <ConditionDrawer
              key={editor.condition ? JSON.stringify(editor.condition.items) : "new"}
              projectId={projectId}
              condition={editor.condition}
              costCodes={editor.costCodes}
              codeRules={editor.codeRules}
              memberSizes={editor.memberSizes}
              items={editor.items}
              defaultMarkup={editor.defaultMarkup}
              pricesLocked={editor.pricesLocked}
              nextColor={editor.nextColor}
              toolbox={editor.toolbox}
              closeHref={viewerHref}
              stayHref={editor.condition ? editHref(editor.condition.id) : editHref("new")}
            />
          ) : null}

          {/* "2 items need a cost code" — floats in the corner so the toolbar never shifts */}
          {codeAlert ? <div className="absolute bottom-3 left-3 z-30">{codeAlert}</div> : null}

          {compare && prevRev && !autoOn && !forward ? (
            <ComparePanel
              prevRevision={prevRev.revision}
              prevSheets={prevRev.sheets}
              pairId={pairId}
              onPair={(id) => {
                setAligning(null);
                saveAlign(id, null);
              }}
              fade={compare.fade}
              onFade={(v) => setCompare({ fade: v })}
              aligning={aligning ? { old: aligning.old.length, now: aligning.now.length } : null}
              aligned={sheetAlign !== NO_ALIGN}
              onAlign={() => {
                setAligning({ old: [], now: [] });
                setTool("select");
              }}
              onAlignDone={() => finishAlign()}
              onAlignCancel={() => setAligning(null)}
              onAlignReset={() => saveAlign(pairId, null)}
              changed={changedShapes.map(({ m, c }) => ({ id: m.id, label: c.name, color: c.color }))}
              onJump={(id) => {
                setTool("select");
                setSelectedId(id);
              }}
              onClose={() => {
                setCompare(null);
                setAligning(null);
              }}
            />
          ) : null}
          {forward && prevRev ? (
            <BringForwardPanel
              prevRevision={prevRev.revision}
              revision={revision.revision}
              prevSheets={prevRev.sheets}
              sheets={sheets.map((x) => ({ id: x.id, name: x.name }))}
              defaults={new Map(prevRev.sheets.map((o) => [o.id, sheets.find((x) => x.prevSheetId === o.id)?.id ?? defaultPairs.get(o.id) ?? ""]))}
              onMove={async (pairs, copyScale) => {
                try {
                  const { moved } = await bringTakeoffsForward({ projectId, planId: plan.id, pairs, copyScale });
                  setForward(false);
                  setFlash(`Moved ${moved} measurement${moved === 1 ? "" : "s"} to Rev ${revision.revision}`);
                  router.refresh();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not move the takeoffs");
                }
              }}
              onClose={() => setForward(false)}
            />
          ) : null}
          {autoOn && autoPlan && active ? (
            <AutoCountPanel
              auto={auto}
              conditionName={active.name}
              pageNumber={pageNumber}
              sheetCount={sheets.length}
              plan={autoPlan}
              assigns={isUnitType(active.type) ? { noun: unitKind(active.type), name: doorById.get(doorPick[active.id] ?? "")?.name ?? null } : undefined}
              onThreshold={(t) => setAuto((a) => a && { ...a, threshold: t })}
              onAllSheets={(on) => {
                if (auto.sample && auto.status !== "pick") void runAuto(auto.conditionId, auto.sample.box, on, auto.sample.pageNumber);
                else setAuto((a) => a && { ...a, allSheets: on });
              }}
              onAdd={addAuto}
              onRestart={() => setAuto((a) => a && { ...newAutoCount(a.conditionId, a.allSheets), threshold: a.threshold })}
              onClose={() => {
                stopAuto();
                setTool("measure");
              }}
            />
          ) : null}

          {/* Doors / windows: the one to place stays up over the plan the whole time you're counting */}
          {active && isUnitType(active.type) && tool === "measure" && !editor ? (
            doorPanelMin ? (
              <button
                type="button"
                onClick={() => setDoorPanelMin(false)}
                className="absolute left-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-lg hover:bg-slate-50"
              >
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: active.color }} />
                {doorById.get(doorPick[active.id] ?? "")?.name ?? `Pick a ${unitKind(active.type)}`}
              </button>
            ) : (
              <div className="absolute left-3 top-3 z-10 w-72 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: active.color }} />
                  <p className="flex-1 text-sm font-semibold text-slate-900">{active.type === "WINDOW" ? "Window" : "Door"} to place</p>
                  <button type="button" aria-label="Shrink the door panel" title="Shrink" className="text-slate-400 hover:text-slate-700" onClick={() => setDoorPanelMin(true)}>
                    <Minus className="h-4 w-4" />
                  </button>
                </div>
                <DoorPicker
                  key={active.id}
                  kind={unitKind(active.type)}
                  doors={unitsFor(active.type)}
                  value={doorPick[active.id] ?? null}
                  onChange={(id) => setDoorPick((cur) => ({ ...cur, [active.id]: id }))}
                  onCreate={addUnit(unitKind(active.type))}
                  codes={codes}
                />
                {active.type === "WINDOW" ? <CasedSwitch value={casedPick[active.id] ?? true} onChange={(v) => setCasedPick((cur) => ({ ...cur, [active.id]: v }))} /> : null}
                <p className="mt-2 text-[11px] text-slate-500">Each click places this {unitKind(active.type)} — change it any time between clicks.</p>
                {active.unassignedDoors ? (
                  <p className="mt-1 text-[11px] text-rose-700">
                    {active.unassignedDoors === 1 ? `1 ${unitKind(active.type)} still needs` : `${active.unassignedDoors} ${unitKind(active.type)}s still need`} one picked (red ?).
                  </p>
                ) : null}
              </div>
            )
          ) : null}

          {/* Totals / Material list (hidden while a condition is being edited) */}
          {panel && !editor ? (
            <TotalsPanel data={totalsPanel} view={panel} onView={(v) => writePanel(v)} onClose={() => writePanel("")} materialsHref={`/projects/${projectId}/materials`} />
          ) : null}

          {/* Framing direction chooser */}
          {dirFor && dirCond ? (
            <div className="absolute left-1/2 top-3 z-10 w-[min(92%,30rem)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
              <p className="text-sm font-medium text-slate-900">Which way do the {dirCond.name.toLowerCase().includes("rafter") ? "rafters" : "members"} run?</p>
              <div className="mt-2 flex flex-wrap gap-1.5" onMouseLeave={() => setDirPreview(null)}>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onMouseEnter={() => setDirPreview(sideways ? Math.PI / 2 : 0)}
                  onFocus={() => setDirPreview(sideways ? Math.PI / 2 : 0)}
                  onClick={() => finishDirection(sideways ? Math.PI / 2 : 0)}
                >
                  <MoveHorizontal className="h-3.5 w-3.5" /> Horizontal <kbd className="ml-1 text-[10px] text-slate-400">H</kbd>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onMouseEnter={() => setDirPreview(sideways ? 0 : Math.PI / 2)}
                  onFocus={() => setDirPreview(sideways ? 0 : Math.PI / 2)}
                  onClick={() => finishDirection(sideways ? 0 : Math.PI / 2)}
                >
                  <MoveVertical className="h-3.5 w-3.5" /> Vertical <kbd className="ml-1 text-[10px] text-slate-400">V</kbd>
                </Button>
                <Button type="button" size="sm" variant={edgePick ? "primary" : "secondary"} onClick={() => setEdgePick((v) => !v)}>
                  <Spline className="h-3.5 w-3.5" /> Parallel to a wall <kbd className={cn("ml-1 text-[10px]", edgePick ? "text-blue-200" : "text-slate-400")}>E</kbd>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setDirFor(null);
                    setDirPreview(null);
                    setEdgePick(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {edgePick ? "Point at a wall of the outline — it highlights — and click it." : "Hover a choice to preview it on the plan."}
                {readout ? <span className="ml-1 font-medium text-slate-700">{readout}</span> : null}
              </p>
            </div>
          ) : null}

          {/* Selected shape panel */}
          {sel?.c ? (
            <div className="absolute bottom-4 right-4 z-10 w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
              {isUnitType(sel.c.type) && !sel.m.pending ? (
                <div className="mb-2 border-b border-slate-100 pb-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Which {unitKind(sel.c.type)} is this?</p>
                  <DoorPicker
                    key={sel.m.id}
                    kind={unitKind(sel.c.type)}
                    doors={unitsFor(sel.c.type)}
                    value={sel.m.materialItemId ?? null}
                    onChange={(id) => {
                      patchShape(sel.m.id, { materialItemId: id });
                      // The next door placed on this takeoff follows the last one picked.
                      if (id) setDoorPick((cur) => ({ ...cur, [sel.c!.id]: id }));
                    }}
                    onCreate={addUnit(unitKind(sel.c.type))}
                    codes={codes}
                    compact
                  />
                  {sel.c.type === "WINDOW" ? <CasedSwitch value={sel.m.cased !== false} onChange={(v) => patchShape(sel.m.id, { cased: v })} /> : null}
                </div>
              ) : null}
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ background: sel.c.color }} />
                <span className="flex-1 truncate font-medium text-slate-900">{sel.c.name}</span>
                <button type="button" className="text-xs text-slate-500 hover:text-slate-800" onClick={() => setSelectedId(null)}>
                  Close
                </button>
              </div>
              {sel.q ? (
                <p className="mt-1 tabular-nums text-slate-700">
                  {sel.m.isDeduction ? "Deduction: " : ""}
                  {num(Math.abs(sel.q.value))} {sel.q.unit}
                  {sel.c.type === "FRAMING" ? ` · ${num(sel.q.metrics.member_lf)} lf of members` : ""}
                  {sel.c.type === "HIP_VALLEY" ? ` · ${feetInches(sel.q.metrics.member_lf)} true length` : ""}
                  {sel.c.type === "BEAM" && sel.q.metrics.members
                    ? ` · ${feetInches(sel.q.metrics.member_lf / sel.q.metrics.members)} beam with bearing${sel.q.metrics.members > 1 ? ` · ×${sel.q.metrics.members} plies` : ""}`
                    : ""}
                </p>
              ) : null}
              {hasShapePitch(sel.c.type) && !sel.m.pending ? renderPitchEditor(sel.m, sel.c) : null}
              {sel.c.type === "LINEAR" && !sel.m.pending ? renderHeightEditor(sel.m, sel.c) : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {sel.c.type === "FRAMING" ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => patchShape(sel.m.id, { angle: sel.m.angle + Math.PI / 2 })} disabled={!!sel.m.pending}>
                    <RotateCw className="h-3.5 w-3.5" /> Rotate 90°
                  </Button>
                ) : null}
                {sel.c.type === "FRAMING" ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!!sel.m.pending}
                    onClick={() => {
                      setDirFor({ id: sel.m.id });
                      setDirPreview(null);
                      setEdgePick(false);
                    }}
                  >
                    <MoveHorizontal className="h-3.5 w-3.5" /> Set direction
                  </Button>
                ) : null}
                {sel.c.type === "AREA" || sel.c.type === "LINEAR" ? (
                  <Button type="button" size="sm" variant="secondary" onClick={() => patchShape(sel.m.id, { isDeduction: !sel.m.isDeduction })} disabled={!!sel.m.pending}>
                    <Minus className="h-3.5 w-3.5" /> {sel.m.isDeduction ? "Make addition" : "Make deduction"}
                  </Button>
                ) : null}
                <Button type="button" size="sm" variant="secondary" onClick={duplicateSelected} disabled={!!sel.m.pending} title="Duplicate (Ctrl+D)">
                  <Copy className="h-3.5 w-3.5" /> Duplicate
                </Button>
                <Button type="button" size="sm" variant="danger" onClick={() => removeShape(sel.m.id)} disabled={!!sel.m.pending}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
              {conditions.filter((c) => c.type === sel.c!.type && c.id !== sel.c!.id).length ? (
                <select
                  aria-label="Move to takeoff"
                  className="input mt-2 !py-1 text-xs"
                  value=""
                  onChange={(e) => e.target.value && patchShape(sel.m.id, { conditionId: e.target.value })}
                >
                  <option value="">Move to takeoff…</option>
                  {conditions
                    .filter((c) => c.type === sel.c!.type && c.id !== sel.c!.id)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ToolButton({ active, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors disabled:opacity-40",
        active ? "bg-blue-700 text-white" : "text-slate-700 hover:bg-slate-100",
      )}
      {...props}
    >
      {children}
    </button>
  );
}

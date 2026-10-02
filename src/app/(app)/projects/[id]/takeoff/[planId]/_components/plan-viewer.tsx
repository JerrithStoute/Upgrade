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
  Undo2,
  Redo2,
  Copy,
} from "lucide-react";
import { Button, buttonClasses } from "@/components/ui";
import { cn, num } from "@/lib/utils";
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
  isMemberType,
  inchesText,
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
import { PlanCanvas } from "./plan-canvas";
import { buildSnapIndex, findSnap, type SnapHit } from "./snap";
import { ConditionDrawer, type DrawerCondition } from "./condition-drawer";
import type { MemberSizeOption } from "../../_components/condition-form";
import type { ItemOption } from "../../_components/assembly-form";
import {
  createMeasurement,
  deleteMeasurement,
  initPlanPages,
  quickCreateCondition,
  renameSheet,
  setSheetScale,
  updateMeasurement,
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
  memberWidthIn: number | null;
  boardFeetPerLf: number | null;
  soldAs: string | null;
  total: number;
  sheetTotal: number;
};

type ViewerMeasurement = {
  id: string;
  conditionId: string;
  points: Pt[];
  isDeduction: boolean;
  angle: number;
  pitch?: number | null; // this shape's own pitch (null = the condition's)
  pitch2?: number | null;
  arcs?: number[]; // indexes of arc points (the curve passes through them)
  pending?: boolean;
};

type Tool = "select" | "measure" | "calibrate" | "pan" | "ruler";

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
  arcs?: number[];
};
type ShapePatch = {
  angle?: number;
  isDeduction?: boolean;
  conditionId?: string;
  pitch?: number | null;
  pitch2?: number | null;
  points?: Pt[];
  arcs?: number[]; // sent with points
};
type HistoryEntry =
  | { kind: "create"; id: string; data: ShapeData }
  | { kind: "delete"; id: string; data: ShapeData }
  | { kind: "update"; id: string; before: ShapePatch; after: ShapePatch };

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
  return type === "COUNT" ? 1 : isLineType(type) ? 2 : 3;
}

/** Shapes that can have curved (arc) segments. */
function canArc(type: string) {
  return type !== "COUNT" && type !== "OPENING";
}

/** Shapes drawn as lines (not closed outlines). */
function isLineType(type: string) {
  return type === "LINEAR" || type === "HIP_VALLEY" || type === "WALL" || type === "OPENING";
}

/** "6" → 6, "" → null (use the condition's pitch). */
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
}: {
  projectId: string;
  plan: {
    id: string;
    name: string;
    kind: string;
    pageCount: number | null;
    fileUrl: string;
  };
  plans: { id: string; name: string }[];
  pageNumber: number;
  sheet: {
    id: string;
    name: string;
    unitsPerFoot: number | null;
    scaleLabel: string | null;
  } | null;
  sheets: {
    pageNumber: number;
    name: string;
    scaled: boolean;
    count: number;
  }[];
  conditions: ViewerCondition[];
  measurements: ViewerMeasurement[];
  /** The condition edit panel, when open (?cond=<id> or ?cond=new). */
  editor: {
    condition: DrawerCondition | null;
    costCodes: { id: string; code: string | null; name: string }[];
    memberSizes: MemberSizeOption[];
    items: ItemOption[];
    defaultMarkup: number;
    nextColor: string;
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
  // Pitch for the next joist/rafter outline or hip/valley line; blank = the condition's.
  const [nextPitch, setNextPitch] = useState({
    forId: activeId,
    p1: "",
    p2: "",
  });
  if (nextPitch.forId !== activeId) setNextPitch({ forId: activeId, p1: "", p2: "" });
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
  const [flash, setFlash] = useState<string | null>(null);

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
  const active = activeId ? (condById.get(activeId) ?? null) : null;
  const unitsPerFoot = sheet?.unitsPerFoot ?? null;
  const pageCount = plan.pageCount ?? sheets.length;

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
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (el.clientWidth - 32) / size.w)));
  }, [size]);

  /** Page size reported by the canvas; each newly shown sheet starts fitted to the width. */
  const onSize = (w: number, h: number) => {
    setSize((s) => (s && s.w === w && s.h === h ? s : { w, h }));
    if (!fitted && scrollRef.current) {
      setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (scrollRef.current.clientWidth - 32) / w)));
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
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
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
      return [(clientX - r.left) / zoom, (clientY - r.top) / zoom];
    },
    [zoom],
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
          arcs: m.arcs ?? [],
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
      const pitch = isMemberType(cond.type) && nextPitch.forId === cond.id ? pitchOrNull(nextPitch.p1) : null;
      const pitch2 = cond.type === "HIP_VALLEY" && nextPitch.forId === cond.id ? pitchOrNull(nextPitch.p2) : null;
      createShape({
        sheetId: sheet.id,
        conditionId: cond.id,
        points,
        arcs,
        isDeduction,
        angle,
        pitch,
        pitch2,
      });
    },
    // createShape is recreated each render; save only needs its latest version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deduct, projectId, sheet, nextPitch],
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
        if (k === "pitch" || k === "pitch2") prev[k] = shape[k] ?? null;
        else if (k === "points") prev.points = shape.points;
        else if (k === "arcs") prev.arcs = shape.arcs ?? [];
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

  const runHistory = (direction: "undo" | "redo") => {
    const from = direction === "undo" ? history.current.undo : history.current.redo;
    const entry = from.pop();
    if (!entry) return;
    syncHistory();
    setSelectedId(null);
    startTransition(async () => {
      try {
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
        setFlash(
          `${direction === "undo" ? "Undid" : "Redid"} ${
            entry.kind === "create"
              ? "adding a shape"
              : entry.kind === "delete"
                ? "a delete"
                : "an edit"
          }`,
        );
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
    if (!condById.has(c.conditionId)) return setError("The copied shape's condition no longer exists");
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
        if (k === "h") finishDirection(0);
        else if (k === "v") finishDirection(Math.PI / 2);
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
  } | null>(null);
  const suppressClick = useRef(false);
  const panning = tool === "pan" || spaceHeld;

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
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
    const wantsPan = e.button === 1 || panning || (tool === "select" && e.button === 0 && e.target === svgRef.current);
    if (!wantsPan) return;
    e.preventDefault();
    panRef.current = {
      x: e.clientX,
      y: e.clientY,
      left: el.scrollLeft,
      top: el.scrollTop,
      moved: false,
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
    if (panRef.current?.moved) suppressClick.current = true;
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
    if (!c || c.type === "COUNT") return;
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
    if (active.type === "COUNT") {
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
  if (tool === "measure" && active && active.type !== "COUNT" && unitsPerFoot && preview.length >= 2) {
    if (preview.length >= minPoints(active.type)) {
      const shape = {
        points: preview,
        arcs: draftArcs,
        isDeduction: false,
        angle: firstEdgeAngle(preview),
        pitch: isMemberType(active.type) ? pitchOrNull(nextPitch.p1) : null,
        pitch2: active.type === "HIP_VALLEY" ? pitchOrNull(nextPitch.p2) : null,
      };
      const m = measurementMetrics(active, shape, unitsPerFoot);
      readout =
        active.type === "WALL"
          ? `${feetInches(m.length)} · ${num(m.wall_area)} sf of wall`
          : active.type === "OPENING"
            ? `${inchesText(m.length * 12)} opening`
            : active.type === "HIP_VALLEY"
            ? `${feetInches(m.member_lf)} true length`
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
        : tool === "measure" || tool === "calibrate" || tool === "ruler"
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
    let deg = (m.angle * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    if (deg > 90 && deg <= 270) deg -= 180;
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
    let deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    if (deg < -90) deg += 180;
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
    // Middle of the longest segment, text running along it.
    let best = 0;
    for (let i = 1; i < m.points.length; i++) if (dist(m.points[i - 1], m.points[i]) > dist(m.points[best], m.points[best + 1] ?? m.points[best])) best = i - 1;
    const a = m.points[best];
    const b = m.points[best + 1] ?? a;
    const x = (a[0] + b[0]) / 2;
    const y = (a[1] + b[1]) / 2;
    let deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
    if (deg > 90) deg -= 180;
    if (deg < -90) deg += 180;
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
    const d = shapePath(c.type, m)
      .map((p) => p.join(","))
      .join(" ");
    if (c.type === "WALL") {
      return (
        <g key={m.id} {...common}>
          <polyline points={d} fill="none" stroke="transparent" strokeWidth={16} {...stroke} />
          <polyline points={d} fill="none" stroke={color} strokeOpacity={0.85} strokeWidth={isSel ? 9 : 7} strokeLinejoin="miter" strokeLinecap="square" {...stroke} />
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
      let deg = (ang * 180) / Math.PI;
      if (deg > 90) deg -= 180;
      if (deg < -90) deg += 180;
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
    if (c.type === "HIP_VALLEY") {
      return (
        <g key={m.id} {...common}>
          <polyline points={d} fill="none" stroke="transparent" strokeWidth={14} {...stroke} />
          <polyline points={d} fill="none" stroke={color} strokeWidth={isSel ? 6 : 4} strokeLinejoin="round" strokeLinecap="round" {...stroke} />
          {m.points.map((p, i) =>
            i === 0 || i === m.points.length - 1 ? <circle key={i} cx={p[0]} cy={p[1]} r={px(3.5)} fill="white" stroke={color} strokeWidth={2} {...stroke} /> : null,
          )}
          {showLabels && unitsPerFoot && m.points.length >= 2 ? hipLabel(c, m, unitsPerFoot) : null}
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
        </g>
      );
    }
    const members =
      c.type === "FRAMING" && unitsPerFoot ? framingMembers(shapePath(c.type, m), m.angle, (c.spacing / 12) * unitsPerFoot, memberThickness(c.memberSize, unitsPerFoot, c.memberWidthIn)) : [];
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
          <span className="text-slate-400">(condition&apos;s)</span>
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
    <div className="-mt-2 flex h-[calc(100vh-11rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Toolbar ---------------------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
        <Link href={base} className={buttonClasses("ghost", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Takeoff
        </Link>
        <select aria-label="Plan" className="input !h-8 !w-auto !py-0 text-xs" value={plan.id} onChange={(e) => router.push(`${base}/${e.target.value}`)}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="flex items-center">
          <Link
            aria-label="Previous sheet"
            href={`${base}/${plan.id}?page=${Math.max(1, pageNumber - 1)}`}
            className={cn(buttonClasses("ghost", "sm"), pageNumber <= 1 && "pointer-events-none opacity-40")}
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <select aria-label="Sheet" className="input !h-8 !w-auto !py-0 text-xs" value={pageNumber} onChange={(e) => router.push(`${base}/${plan.id}?page=${e.target.value}`)}>
            {(sheets.length ? sheets : [{ pageNumber: 1, name: "Page 1", scaled: false, count: 0 }]).map((s) => (
              <option key={s.pageNumber} value={s.pageNumber}>
                {s.pageNumber}. {s.name}
                {s.scaled ? "" : " (no scale)"}
                {s.count ? ` · ${s.count}` : ""}
              </option>
            ))}
          </select>
          <Link
            aria-label="Next sheet"
            href={`${base}/${plan.id}?page=${Math.min(pageCount || 1, pageNumber + 1)}`}
            className={cn(buttonClasses("ghost", "sm"), pageNumber >= pageCount && "pointer-events-none opacity-40")}
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
            disabled={!active}
            onClick={() => {
              setTool("measure");
              setCalib([]);
            }}
            title="Measure (M) with the selected condition"
          >
            <Ruler className="h-3.5 w-3.5" /> Measure
          </ToolButton>
          {active && tool === "measure" && canArc(active.type) ? (
            <ToolButton active={arcNext} onClick={() => setArcNext((v) => !v)} title="Arc (A) — the next click is a point on the curve, the click after is where it ends">
              <Spline className="h-3.5 w-3.5" /> Arc
            </ToolButton>
          ) : null}
          {active && (active.type === "AREA" || active.type === "LINEAR") ? (
            <ToolButton active={deduct} onClick={() => setDeduct((d) => !d)} title="Deduction (D) — subtracts from the condition">
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
        ) : tool === "ruler" ? (
          <span>
            <strong className="font-medium text-slate-800">Ruler:</strong> click two points to read the distance — nothing is saved. Click again to start a new one · Shift = straight
            · Esc = clear.
            {!unitsPerFoot ? <strong className="ml-1 text-amber-700">Set the scale first.</strong> : null}
          </span>
        ) : tool === "calibrate" ? (
          calib.length < 2 ? (
            <span>Calibrate: click both ends of a dimension you know (Shift keeps it straight).</span>
          ) : (
            <form
              className="flex flex-wrap items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (calibLength > 0) applyScale(dist(calib[0], calib[1]) / calibLength, "Calibrated");
              }}
            >
              <span>That distance is</span>
              <input
                autoFocus
                aria-label="Feet"
                type="number"
                min="0"
                step="any"
                value={calibFeet}
                onChange={(e) => setCalibFeet(e.target.value)}
                className="w-20 rounded border border-slate-300 px-2 py-0.5"
              />
              <span>ft</span>
              <input
                aria-label="Inches"
                type="number"
                min="0"
                step="any"
                value={calibInches}
                onChange={(e) => setCalibInches(e.target.value)}
                className="w-16 rounded border border-slate-300 px-2 py-0.5"
              />
              <span>in</span>
              <Button type="submit" size="sm" disabled={calibLength <= 0}>
                Set scale
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCalib([])}>
                Redo
              </Button>
            </form>
          )
        ) : tool === "measure" && active ? (
          <span>
            <span className="mr-1 inline-block h-2.5 w-2.5 rounded-sm align-middle" style={{ background: active.color }} />
            <strong className="font-medium text-slate-800">{active.name}</strong>
            {deduct && (active.type === "AREA" || active.type === "LINEAR") ? <strong className="ml-1 text-rose-700">(deduction)</strong> : null} —{" "}
            {active.type === "COUNT"
              ? "click each item."
              : active.type === "WALL"
                ? "click each corner along the wall; double-click or Enter to finish the run (end on the first corner to close the building)."
                : active.type === "OPENING"
                  ? "click one side of the opening, then the other. Each line is one opening; its length is the width."
                : active.type === "HIP_VALLEY"
                  ? "click the wall corner, then the ridge end; double-click or Enter to finish. Each line is one piece."
                  : active.type === "LINEAR"
                    ? "click points along the line; double-click or Enter to finish."
                    : "click the corners; click the first point, double-click or Enter to close."}{" "}
            {arcNext ? (
              <strong className="mr-1 text-amber-700">Arc: click a point on the curve, then where it ends.</strong>
            ) : draftArcs.includes(draft.length - 1) && draft.length > 0 ? (
              <strong className="mr-1 text-amber-700">Arc: click where the curve ends.</strong>
            ) : null}
            {active.type !== "COUNT" ? `Shift = straight${canArc(active.type) ? " · A = arc" : ""} · Backspace = undo point · Esc = cancel.` : null}
            {active.type === "FRAMING" ? " After closing the outline you'll choose horizontal, vertical or parallel to a wall." : null}
            {!unitsPerFoot && active.type !== "COUNT" ? <strong className="ml-1 text-amber-700">Set the scale first.</strong> : null}
            {isMemberType(active.type) ? (
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
                  <span className="text-slate-400">(blank = condition&apos;s)</span>
                )}
              </span>
            ) : null}
          </span>
        ) : (
          <span>
            {unitsPerFoot ? null : <strong className="mr-2 text-amber-700">This sheet has no scale — pick one or calibrate.</strong>}
            {tool === "select" && selected
              ? "Drag a point or the shape to move it · double-click an edge to add a point · double-click a point to curve or straighten it · right-click a point to remove it · Ctrl+C / Ctrl+V / Ctrl+D copy, paste, duplicate · Ctrl+Z undo."
              : "Pick a condition on the left, then Measure. Ctrl + scroll to zoom; drag or hold Space to pan. Ctrl+Z undoes."}
          </span>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Conditions panel ------------------------------------------------------------------- */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200">
          <div className="flex items-center gap-2 py-2 pl-3 pr-2">
            <p className="label !mb-0 flex-1">Conditions</p>
            <Link href={`${base}?tab=conditions`} className="text-xs text-blue-700 hover:underline">
              All conditions
            </Link>
            {conditions.length ? (
              // One click for a clean plan: hide every condition (or show them all again).
              <button
                type="button"
                aria-label={allHidden ? "Show all conditions" : "Hide all conditions"}
                title={allHidden ? "Show all conditions" : "Hide all conditions — a clean plan"}
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
            {conditions.length === 0 ? <li className="px-3 py-2 text-xs text-slate-500">No conditions yet — add one below.</li> : null}
            {conditions.map((c) => {
              const isActive = c.id === activeId;
              const isHidden = hidden.has(c.id);
              return (
                <li key={c.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setActiveId(c.id);
                      setTool("measure");
                      resetDraft();
                      if (c.type !== "AREA" && c.type !== "LINEAR") setDeduct(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setActiveId(c.id);
                        setTool("measure");
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
                      <span className="block truncate text-sm font-medium text-slate-900">{c.name}</span>
                      <span className="block text-xs text-slate-500">
                        {CONDITION_TYPE_LABELS[c.type as ConditionType] ?? c.type}
                        {c.pitch > 0 ? ` · ${num(c.pitch, 2)}/12` : ""}
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
                    <Link
                      href={editHref(c.id)}
                      scroll={false}
                      aria-label={`Edit ${c.name}`}
                      title="Edit condition"
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
                </li>
              );
            })}
          </ul>
          <form
            className="space-y-2 border-t border-slate-200 p-3"
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
                  if (newCondType === "WALL" || newCondType === "OPENING") router.push(editHref(id), { scroll: false });
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not add the condition");
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
              placeholder="Condition name"
              className="input !py-1.5 text-xs"
              aria-label="New condition name"
            />
            <div className="flex gap-2">
              <select value={newCondType} onChange={(e) => setNewCondType(e.target.value as ConditionType)} className="input !py-1.5 text-xs" aria-label="New condition type">
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
        </aside>

        {/* Plan ----------------------------------------------------------------------------- */}
        <div className="relative min-w-0 flex-1">
          {/* Live readout floats over the plan so the canvas never shifts under the cursor */}
          {flash ? (
            <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 text-xs">
              <span className="rounded bg-emerald-600 px-2.5 py-1 font-medium text-white shadow">{flash}</span>
            </div>
          ) : null}
          {readout && !dirFor ? (
            <span className="pointer-events-none absolute right-3 top-3 z-20 rounded bg-slate-900 px-2 py-0.5 text-xs font-medium tabular-nums text-white shadow">{readout}</span>
          ) : null}
          <div ref={scrollRef} className="absolute inset-0 overflow-auto bg-slate-200/70 p-4">
            <div className="relative inline-block shadow-md" style={size ? { width: size.w * zoom, height: size.h * zoom } : undefined}>
              <PlanCanvas
                url={plan.fileUrl}
                kind={plan.kind}
                pageNumber={pageNumber}
                zoom={zoom}
                onSize={onSize}
                onPageCount={plan.kind === "PDF" ? onPageCount : undefined}
                onVectors={setVectors}
              />
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
                    if (draft.length) {
                      e.preventDefault();
                      finishDraft(draft);
                    }
                  }}
                >
                  {shapes.map(renderShape)}

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
                            if (arcs.includes(i - 1) || arcs.includes(closed ? (i + 1) % n : i + 1)) return setFlash("The points on each side of an arc point have to be corners");
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
                          strokeWidth={active.type === "HIP_VALLEY" ? 4 : 3}
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
                          ).map(([a, b], i) => <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={dirCond.color} strokeWidth={1.25} strokeDasharray="4 3" {...stroke} />)
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
                        let deg = (ang * 180) / Math.PI;
                        if (deg > 90) deg -= 180;
                        if (deg < -90) deg += 180;
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
                        const [x, y] = sel.c.type === "LINEAR" || sel.c.type === "COUNT" ? sel.m.points[0] : centroid(sel.m.points);
                        const text = `${sel.m.isDeduction ? "−" : ""}${num(Math.abs(sel.q.value))} ${sel.q.unit}`;
                        return (
                          <text
                            x={x}
                            y={y}
                            dy={px(-12)}
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

          {editor ? (
            <ConditionDrawer
              key={editor.condition ? JSON.stringify(editor.condition.items) : "new"}
              projectId={projectId}
              condition={editor.condition}
              costCodes={editor.costCodes}
              memberSizes={editor.memberSizes}
              items={editor.items}
              defaultMarkup={editor.defaultMarkup}
              nextColor={editor.nextColor}
              closeHref={viewerHref}
              stayHref={editor.condition ? editHref(editor.condition.id) : editHref("new")}
            />
          ) : null}

          {/* Framing direction chooser */}
          {dirFor && dirCond ? (
            <div className="absolute left-1/2 top-3 z-10 w-[min(92%,30rem)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
              <p className="text-sm font-medium text-slate-900">Which way do the {dirCond.name.toLowerCase().includes("rafter") ? "rafters" : "members"} run?</p>
              <div className="mt-2 flex flex-wrap gap-1.5" onMouseLeave={() => setDirPreview(null)}>
                <Button type="button" size="sm" variant="secondary" onMouseEnter={() => setDirPreview(0)} onFocus={() => setDirPreview(0)} onClick={() => finishDirection(0)}>
                  <MoveHorizontal className="h-3.5 w-3.5" /> Horizontal <kbd className="ml-1 text-[10px] text-slate-400">H</kbd>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onMouseEnter={() => setDirPreview(Math.PI / 2)}
                  onFocus={() => setDirPreview(Math.PI / 2)}
                  onClick={() => finishDirection(Math.PI / 2)}
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
            <div className="absolute bottom-4 right-4 w-72 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
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
                </p>
              ) : null}
              {isMemberType(sel.c.type) && !sel.m.pending ? renderPitchEditor(sel.m, sel.c) : null}
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
                  aria-label="Move to condition"
                  className="input mt-2 !py-1 text-xs"
                  value=""
                  onChange={(e) => e.target.value && patchShape(sel.m.id, { conditionId: e.target.value })}
                >
                  <option value="">Move to condition…</option>
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

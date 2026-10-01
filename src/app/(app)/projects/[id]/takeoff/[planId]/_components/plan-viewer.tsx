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
  Scaling,
  Trash2,
  ZoomIn,
  ZoomOut,
  Tag,
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

type ViewerMeasurement = { id: string; conditionId: string; points: Pt[]; isDeduction: boolean; angle: number; pending?: boolean };

type Tool = "select" | "measure" | "calibrate" | "pan";

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
  return type === "COUNT" ? 1 : type === "LINEAR" ? 2 : 3;
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
}: {
  projectId: string;
  plan: { id: string; name: string; kind: string; pageCount: number | null; fileUrl: string };
  plans: { id: string; name: string }[];
  pageNumber: number;
  sheet: { id: string; name: string; unitsPerFoot: number | null; scaleLabel: string | null } | null;
  sheets: { pageNumber: number; name: string; scaled: boolean; count: number }[];
  conditions: ViewerCondition[];
  measurements: ViewerMeasurement[];
}) {
  const router = useRouter();
  const base = `/projects/${projectId}/takeoff`;
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
  const [cursor, setCursor] = useState<Pt | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<ViewerMeasurement[]>([]);
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [calib, setCalib] = useState<Pt[]>([]);
  const [calibFeet, setCalibFeet] = useState("");
  const [calibInches, setCalibInches] = useState("");
  const [applyToPlan, setApplyToPlan] = useState(false);
  const [sheetName, setSheetName] = useState(sheet?.name ?? "");
  const [newCondName, setNewCondName] = useState("");
  const [newCondType, setNewCondType] = useState<ConditionType>("AREA");
  const [shiftHeld, setShiftHeld] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  // Framing direction: a new outline waiting for its member direction, or an existing shape being re-aimed.
  const [dirFor, setDirFor] = useState<{ points: Pt[]; conditionId: string } | { id: string } | null>(null);
  // Direction hovered in the chooser (preview), and "parallel to a wall" edge picking.
  const [dirPreview, setDirPreview] = useState<number | null>(null);
  const [edgePick, setEdgePick] = useState(false);
  const showLabels = useSyncExternalStore(subscribeLabels, readLabels, () => true);

  // Reset per-sheet state when moving between pages (the canvas and loaded PDF stay mounted).
  const [shownPage, setShownPage] = useState(pageNumber);
  if (shownPage !== pageNumber) {
    setShownPage(pageNumber);
    setDraft([]);
    setCalib([]);
    setSelectedId(null);
    setDirFor(null);
    setDirPreview(null);
    setEdgePick(false);
    setFitted(false);
    setSheetName(sheet?.name ?? "");
  }

  const condById = useMemo(() => new Map(conditions.map((c) => [c.id, c])), [conditions]);
  const active = activeId ? condById.get(activeId) ?? null : null;
  const unitsPerFoot = sheet?.unitsPerFoot ?? null;
  const pageCount = plan.pageCount ?? sheets.length;

  const shapes = useMemo(
    () => [...measurements.filter((m) => !removing.has(m.id)), ...pending],
    [measurements, pending, removing],
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

  // --- Saving ---------------------------------------------------------------------------
  const save = useCallback(
    (cond: ViewerCondition, points: Pt[], framingAngle?: number) => {
      if (!sheet) return;
      const tempId = `pending-${Math.random().toString(36).slice(2)}`;
      const isDeduction = deduct && (cond.type === "AREA" || cond.type === "LINEAR");
      const angle = cond.type === "FRAMING" ? (framingAngle ?? firstEdgeAngle(points)) : 0;
      setPending((p) => [...p, { id: tempId, conditionId: cond.id, points, isDeduction, angle, pending: true }]);
      startTransition(async () => {
        try {
          await createMeasurement({ projectId, sheetId: sheet.id, conditionId: cond.id, points, isDeduction, angle });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Could not save the measurement");
        } finally {
          setPending((p) => p.filter((m) => m.id !== tempId));
        }
      });
    },
    [deduct, projectId, sheet],
  );

  const finishDraft = useCallback(
    (points: Pt[]) => {
      if (!active) return;
      // Drop accidental duplicate points (double-clicks).
      const clean = points.filter((p, i) => i === 0 || dist(p, points[i - 1]) * zoom > 2);
      setDraft([]);
      if (clean.length < minPoints(active.type)) return;
      if (active.type === "FRAMING") {
        // Ask which way the members run before saving.
        setDirFor({ points: clean, conditionId: active.id });
        setDirPreview(null);
        setEdgePick(false);
        return;
      }
      save(active, clean);
    },
    [active, save, zoom],
  );

  const removeShape = useCallback(
    (id: string) => {
      if (id.startsWith("pending-")) return;
      setRemoving((s) => new Set(s).add(id));
      setSelectedId(null);
      startTransition(async () => {
        try {
          await deleteMeasurement({ projectId, id });
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
    [projectId],
  );

  const patchShape = (id: string, patch: { angle?: number; isDeduction?: boolean; conditionId?: string }) => {
    startTransition(async () => {
      try {
        await updateMeasurement({ projectId, id, ...patch });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update the measurement");
      }
    });
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
        if (cond) save(cond, dirFor.points, angle ?? nearestAxis(firstEdgeAngle(dirFor.points)));
      } else if (dirFor && angle !== null) {
        const id = dirFor.id;
        startTransition(async () => {
          try {
            await updateMeasurement({ projectId, id, angle });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not update the measurement");
          }
        });
      }
      setDirFor(null);
      setDirPreview(null);
      setEdgePick(false);
    },
    [dirFor, condById, save, projectId],
  );

  // --- Keyboard ------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(e.type === "keydown");
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
      if (e.key === "Escape") {
        setDraft([]);
        setCalib([]);
        setSelectedId(null);
      } else if (e.key === "Enter" && draft.length) {
        finishDraft(draft);
      } else if ((e.key === "Backspace" || e.key === "Delete") && draft.length) {
        e.preventDefault();
        setDraft((d) => d.slice(0, -1));
      } else if ((e.key === "Backspace" || e.key === "Delete") && selectedId) {
        e.preventDefault();
        removeShape(selectedId);
      } else if (e.key === "v" || e.key === "V") {
        setTool("select");
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
  }, [draft, selectedId, finishDraft, removeShape, active, zoom, zoomAt, dirFor, finishDirection]);

  // --- Framing direction chooser ---------------------------------------------------------
  // The outline being aimed, its default direction, and what the preview shows right now.
  const dirShape = dirFor
    ? "points" in dirFor
      ? { points: dirFor.points, conditionId: dirFor.conditionId, angle: nearestAxis(firstEdgeAngle(dirFor.points)) }
      : (shapes.find((m) => m.id === dirFor.id) ?? null)
    : null;
  const dirCond = dirShape ? (condById.get(dirShape.conditionId) ?? null) : null;
  const hoverEdge = dirFor && edgePick && dirShape && cursor ? nearestEdge(dirShape.points, cursor, EDGE_PICK_PX / zoom) : null;
  const dirAngle = dirShape ? (hoverEdge !== null ? edgeAngle(dirShape.points, hoverEdge) : (dirPreview ?? dirShape.angle)) : 0;

  // --- Mouse ---------------------------------------------------------------------------
  const panRef = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const panning = tool === "pan" || spaceHeld;

  const onPointerDown = (e: React.PointerEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    const wantsPan = e.button === 1 || panning || (tool === "select" && e.button === 0 && e.target === svgRef.current);
    if (!wantsPan) return;
    e.preventDefault();
    panRef.current = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: el.scrollTop, moved: false };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
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
    if (tool === "measure" || tool === "calibrate" || dirFor) setCursor(toPage(e.clientX, e.clientY));
  };

  const onPointerUp = () => {
    if (panRef.current?.moved) suppressClick.current = true;
    panRef.current = null;
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
    const raw = toPage(e.clientX, e.clientY);

    if (tool === "calibrate") {
      if (calib.length >= 2) setCalib([raw]);
      else setCalib((c) => [...c, snap(raw, c[c.length - 1])]);
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
    const closes = active.type !== "LINEAR" && draft.length >= 3 && dist(raw, draft[0]) * zoom <= CLOSE_PX;
    if (closes) {
      finishDraft(draft);
      return;
    }
    setDraft((d) => [...d, snap(raw, d[d.length - 1])]);
  };

  // --- Scale ------------------------------------------------------------------------------
  const applyScale = (upf: number, label: string) => {
    if (!sheet) return;
    startTransition(async () => {
      try {
        await setSheetScale({ projectId, sheetId: sheet.id, unitsPerFoot: upf, scaleLabel: label, applyToPlan });
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
  const preview = draft.length && cursor ? [...draft, snap(cursor, draft[draft.length - 1])] : draft;
  let readout: string | null = null;
  if (tool === "measure" && active && active.type !== "COUNT" && unitsPerFoot && preview.length >= 2) {
    if (preview.length >= minPoints(active.type)) {
      const m = measurementMetrics(active, { points: preview, isDeduction: false, angle: firstEdgeAngle(preview) }, unitsPerFoot);
      readout = `${num(m[active.metric as MetricKey] ?? 0)} ${metricUnit(active.metric)}`;
    } else {
      readout = feetInches(polylineLength(preview) / unitsPerFoot);
    }
  } else if (tool === "calibrate" && calib.length === 1 && cursor) {
    readout = unitsPerFoot ? feetInches(dist(calib[0], cursor) / unitsPerFoot) : `${num(dist(calib[0], cursor), 0)} units`;
  }

  const shapeQuantity = (m: ViewerMeasurement) => {
    const c = condById.get(m.conditionId);
    if (!c) return null;
    const metrics = measurementMetrics(c, m, unitsPerFoot);
    return { value: metrics[c.metric as MetricKey] ?? 0, unit: metricUnit(c.metric), metrics };
  };

  // --- Rendering helpers --------------------------------------------------------------------
  const px = (n: number) => n / zoom; // screen px → page units
  const stroke = { vectorEffect: "non-scaling-stroke" as const };
  const cursorClass = panning
    ? "cursor-grab"
    : dirFor
      ? edgePick && hoverEdge !== null
        ? "cursor-pointer"
        : "cursor-default"
      : tool === "measure" || tool === "calibrate"
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
      [
        [p[0] - s * dx * head + dy * head * 0.6, p[1] - s * dy * head - dx * head * 0.6],
        p,
        [p[0] - s * dx * head - dy * head * 0.6, p[1] - s * dy * head + dx * head * 0.6],
      ]
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
    const stock = parseStockLengths(c.stockLengths);
    const counts = new Map<number, number>();
    for (const l of framingLengths(c, m, upf)) for (const piece of stockPieces(l, stock, c.soldAs)) counts.set(piece, (counts.get(piece) ?? 0) + 1);
    const pieces = Array.from(counts.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([len, n]) => `(${n}) ${c.soldAs === "EXACT_LF" ? feetInches(len) : `${num(len)}'`}`)
      .join("  ");
    let deg = (m.angle * 180) / Math.PI;
    deg = ((deg % 360) + 360) % 360;
    if (deg > 90 && deg <= 270) deg -= 180;
    const [x, y] = centroid(m.points);
    const fs = px(12);
    const line1 = `${name} @ ${num(c.spacing, 2)}" o.c.`;
    // A light plate behind each line keeps the callout readable over members and plan text.
    const plate = (text: string, baseline: number) => {
      const w = text.length * fs * 0.6 + px(10);
      return <rect x={x - w / 2} y={baseline - fs * 0.95} width={w} height={fs * 1.35} rx={px(3)} fill="white" fillOpacity={0.88} stroke={c.color} strokeOpacity={0.5} strokeWidth={1} {...stroke} />;
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

  if (dirShape && dirCond && unitsPerFoot) {
    const dm = measurementMetrics(dirCond, { points: dirShape.points, isDeduction: false, angle: dirAngle }, unitsPerFoot);
    readout = `${num(dm.members, 0)} members · ${num(dm.member_lf)} lf`;
  }

  const renderShape = (m: ViewerMeasurement) => {
    const c = condById.get(m.conditionId);
    if (!c || hidden.has(c.id)) return null;
    const isSel = m.id === selectedId;
    const color = c.color;
    const common = {
      onClick: (e: React.MouseEvent) => {
        if (tool !== "select" || panning || dirFor) return;
        e.stopPropagation();
        setSelectedId(m.id);
      },
      style: { cursor: tool === "select" ? "pointer" : undefined },
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
    const d = m.points.map((p) => p.join(",")).join(" ");
    if (c.type === "LINEAR") {
      return (
        <g key={m.id} {...common}>
          <polyline points={d} fill="none" stroke="transparent" strokeWidth={12} {...stroke} />
          <polyline points={d} fill="none" stroke={color} strokeWidth={isSel ? 5 : 3} strokeDasharray={m.isDeduction ? "6 4" : undefined} strokeLinejoin="round" strokeLinecap="round" {...stroke} />
        </g>
      );
    }
    const members =
      c.type === "FRAMING" && unitsPerFoot ? framingMembers(m.points, m.angle, (c.spacing / 12) * unitsPerFoot, memberThickness(c.memberSize, unitsPerFoot, c.memberWidthIn)) : [];
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

  const sel = selected ? { m: selected, c: condById.get(selected.conditionId), q: shapeQuantity(selected) } : null;

  return (
    <div className="-mt-2 flex h-[calc(100vh-11rem)] min-h-[560px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Toolbar ---------------------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-3 py-2">
        <Link href={base} className={buttonClasses("ghost", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Takeoff
        </Link>
        <select
          aria-label="Plan"
          className="input !h-8 !w-auto !py-0 text-xs"
          value={plan.id}
          onChange={(e) => router.push(`${base}/${e.target.value}`)}
        >
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
          <select
            aria-label="Sheet"
            className="input !h-8 !w-auto !py-0 text-xs"
            value={pageNumber}
            onChange={(e) => router.push(`${base}/${plan.id}?page=${e.target.value}`)}
          >
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
              <option value="">{unitsPerFoot ? sheet?.scaleLabel ?? "Custom" : "Set scale…"}</option>
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
              setDraft([]);
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
              <input autoFocus aria-label="Feet" type="number" min="0" step="any" value={calibFeet} onChange={(e) => setCalibFeet(e.target.value)} className="w-20 rounded border border-slate-300 px-2 py-0.5" />
              <span>ft</span>
              <input aria-label="Inches" type="number" min="0" step="any" value={calibInches} onChange={(e) => setCalibInches(e.target.value)} className="w-16 rounded border border-slate-300 px-2 py-0.5" />
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
              : active.type === "LINEAR"
                ? "click points along the line; double-click or Enter to finish."
                : "click the corners; click the first point, double-click or Enter to close."}{" "}
            {active.type !== "COUNT" ? "Shift = straight · Backspace = undo point · Esc = cancel." : null}
            {active.type === "FRAMING" ? " After closing the outline you'll choose horizontal, vertical or parallel to a wall." : null}
            {!unitsPerFoot && active.type !== "COUNT" ? <strong className="ml-1 text-amber-700">Set the scale first.</strong> : null}
          </span>
        ) : (
          <span>
            {unitsPerFoot ? null : <strong className="mr-2 text-amber-700">This sheet has no scale — pick one or calibrate.</strong>}
            Pick a condition on the left, then Measure. Ctrl + scroll to zoom; drag or hold Space to pan.
          </span>
        )}
        {readout ? <span className="ml-auto rounded bg-slate-900 px-2 py-0.5 font-medium tabular-nums text-white">{readout}</span> : null}
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Conditions panel ------------------------------------------------------------------- */}
        <aside className="flex w-72 shrink-0 flex-col border-r border-slate-200">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="label !mb-0">Conditions</p>
            <Link href={base} className="text-xs text-blue-700 hover:underline">
              Edit / pricing
            </Link>
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
                      setDraft([]);
                      if (c.type !== "AREA" && c.type !== "LINEAR") setDeduct(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        setActiveId(c.id);
                        setTool("measure");
                      }
                    }}
                    className={cn(
                      "flex cursor-pointer items-start gap-2 border-l-4 px-3 py-2 hover:bg-slate-50",
                      isActive ? "bg-blue-50/60" : "border-transparent",
                    )}
                    style={isActive ? { borderLeftColor: c.color } : undefined}
                  >
                    <span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: c.color, opacity: isHidden ? 0.3 : 1 }} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-900">{c.name}</span>
                      <span className="block text-xs text-slate-500">
                        {CONDITION_TYPE_LABELS[c.type as ConditionType] ?? c.type}
                        {c.pitch > 0 ? ` · ${num(c.pitch, 2)}/12` : ""}
                      </span>
                      <span className="block text-xs tabular-nums text-slate-700">
                        Sheet {num(c.sheetTotal)} · All {num(c.total)} {c.unit}
                      </span>
                    </span>
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
                  const { id } = await quickCreateCondition({ projectId, name, type: newCondType });
                  setNewCondName("");
                  setActiveId(id);
                  setTool("measure");
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Could not add the condition");
                }
              });
            }}
          >
            <p className="label !mb-0">Quick add</p>
            <input value={newCondName} onChange={(e) => setNewCondName(e.target.value)} placeholder="Condition name" className="input !py-1.5 text-xs" aria-label="New condition name" />
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
          <div ref={scrollRef} className="absolute inset-0 overflow-auto bg-slate-200/70 p-4">
            <div className="relative inline-block shadow-md" style={size ? { width: size.w * zoom, height: size.h * zoom } : undefined}>
              <PlanCanvas
                url={plan.fileUrl}
                kind={plan.kind}
                pageNumber={pageNumber}
                zoom={zoom}
                onSize={onSize}
                onPageCount={plan.kind === "PDF" ? onPageCount : undefined}
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
                  onPointerLeave={() => setCursor(null)}
                  onClick={onClick}
                  onContextMenu={(e) => {
                    if (draft.length) {
                      e.preventDefault();
                      finishDraft(draft);
                    }
                  }}
                >
                  {shapes.map(renderShape)}

                  {/* Shape being drawn */}
                  {tool === "measure" && active && preview.length > 0 ? (
                    <g pointerEvents="none">
                      {active.type === "LINEAR" ? (
                        <polyline points={preview.map((p) => p.join(",")).join(" ")} fill="none" stroke={active.color} strokeWidth={3} strokeDasharray={deduct ? "6 4" : undefined} {...stroke} />
                      ) : (
                        <polygon points={preview.map((p) => p.join(",")).join(" ")} fill={active.color} fillOpacity={0.15} stroke={active.color} strokeWidth={2} strokeDasharray="6 4" {...stroke} />
                      )}
                      {draft.map((p, i) => (
                        <circle key={i} cx={p[0]} cy={p[1]} r={px(i === 0 ? 5 : 3.5)} fill="white" stroke={active.color} strokeWidth={2} {...stroke} />
                      ))}
                    </g>
                  ) : null}

                  {/* Framing direction being picked */}
                  {dirShape && dirCond ? (
                    <g pointerEvents="none">
                      <polygon points={dirShape.points.map((p) => p.join(",")).join(" ")} fill={dirCond.color} fillOpacity={0.12} stroke={dirCond.color} strokeWidth={2} strokeDasharray="6 4" {...stroke} />
                      {unitsPerFoot
                        ? framingMembers(dirShape.points, dirAngle, (dirCond.spacing / 12) * unitsPerFoot, memberThickness(dirCond.memberSize, unitsPerFoot, dirCond.memberWidthIn)).map(([a, b], i) => (
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
                          <text x={x} y={y} dy={px(-12)} textAnchor="middle" fontSize={px(13)} fontWeight={600} fill="#0f172a" stroke="white" strokeWidth={px(4)} paintOrder="stroke">
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

          {/* Framing direction chooser */}
          {dirFor && dirCond ? (
            <div className="absolute left-1/2 top-3 z-10 w-[min(92%,30rem)] -translate-x-1/2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
              <p className="text-sm font-medium text-slate-900">Which way do the {dirCond.name.toLowerCase().includes("rafter") ? "rafters" : "members"} run?</p>
              <div className="mt-2 flex flex-wrap gap-1.5" onMouseLeave={() => setDirPreview(null)}>
                <Button type="button" size="sm" variant="secondary" onMouseEnter={() => setDirPreview(0)} onFocus={() => setDirPreview(0)} onClick={() => finishDirection(0)}>
                  <MoveHorizontal className="h-3.5 w-3.5" /> Horizontal <kbd className="ml-1 text-[10px] text-slate-400">H</kbd>
                </Button>
                <Button type="button" size="sm" variant="secondary" onMouseEnter={() => setDirPreview(Math.PI / 2)} onFocus={() => setDirPreview(Math.PI / 2)} onClick={() => finishDirection(Math.PI / 2)}>
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
                {edgePick
                  ? "Point at a wall of the outline — it highlights — and click it."
                  : "Hover a choice to preview it on the plan."}
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
                </p>
              ) : null}
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

function ToolButton({
  active,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
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

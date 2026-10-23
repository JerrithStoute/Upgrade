"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { flushSync } from "react-dom";
import Link from "@/components/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui";
import { cn, fmtDate, num } from "@/lib/utils";
import {
  centroid,
  feetInches,
  framingMembers,
  hipLength,
  beamLabel,
  measurementMetrics,
  memberThickness,
  metricUnit,
  inchesText,
  shapePath,
  polylineLength,
  type ConditionCalc,
  type MetricKey,
  type Pt,
} from "@/lib/takeoff";
import { PlanCanvas } from "../_components/plan-canvas";
import { areaJoists, joistGroupText, pieceLine } from "../_components/joist-labels";
import type { MemberPiece } from "@/lib/joist-pieces";
import type { TextBox } from "../_components/pdf-vectors";
import { placeLabels } from "./label-placement";

/** A label waiting for its spot: what it says, where it'd like to be, and how far it may move. */
type Tag = { x: number; y: number; t: string; deg: number; color: string; filled: boolean; region?: Pt[]; maxShift?: number; first: boolean };

type PrintCondition = ConditionCalc & { id: string; name: string; color: string; metric: string };
type PrintShape = {
  id: string;
  conditionId: string;
  points: Pt[];
  arcs: number[];
  isDeduction: boolean;
  angle: number;
  pitch: number | null;
  pitch2: number | null;
  height?: number | null;
  /** Joists broken at walls / split by size: each joist's pieces and the takeoff each is ordered under (joist-pieces.ts). */
  memberPieces?: MemberPiece[][];
};

export type PrintSheet = {
  id: string;
  pageNumber: number;
  name: string;
  scaleLabel: string | null;
  unitsPerFoot: number | null;
  shapes: PrintShape[];
  legend: { conditionId: string; name: string; color: string; type: string; quantity: number; unit: string; shapes: number; joists: number }[];
};

/**
 * Print CSS for full-size (to scale) sheets. The first sheet's paper size is the default page —
 * a named page there would make the browser start with a blank page before it. Other sheets of a
 * different size get a named page of their own. (The letter pages print as a job of their own.)
 * PDF points: 72 to the inch.
 */
function scaleCss(sheets: { n: number; size?: { w: number; h: number } }[]) {
  const sized = sheets.filter((s): s is { n: number; size: { w: number; h: number } } => !!s.size);
  if (!sized.length) return "";
  const inch = (pt: number) => `${Math.round((pt / 72) * 1000) / 1000}in`;
  const first = sized[0].size;
  const rules = [`@page { size: ${inch(first.w)} ${inch(first.h)}; margin: 0; }`];
  for (const { n, size } of sized) {
    const same = Math.abs(size.w - first.w) < 1 && Math.abs(size.h - first.h) < 1;
    if (!same) rules.push(`@page sheet${n} { size: ${inch(size.w)} ${inch(size.h)}; margin: 0; }`);
    rules.push(`.scale-sheet-${n} { ${same ? "" : `page: sheet${n}; `}width: ${inch(size.w)}; height: ${inch(size.h)}; }`);
  }
  return `@media print { ${rules.join(" ")} }`;
}

/** Text along the joists, turned so it reads left to right (or bottom to top). */
function joistDeg(angle: number) {
  let deg = (angle * 180) / Math.PI;
  while (deg > 90) deg -= 180;
  while (deg <= -90) deg += 180;
  return deg;
}

/** Resolution the sheets render at for print (page units × this); a bit finer for full-size (to scale) sheets. */
const PRINT_ZOOM = 1.5;
const SCALE_ZOOM = 2;

export function PrintSheets({
  projectId,
  project,
  plan,
  sheets,
  conditions,
  initialPages,
  onPlan,
  hidden: hiddenIds,
  materials,
}: {
  projectId: string;
  project: { number: number; name: string; address: string };
  plan: { id: string; name: string; kind: string; fileUrl: string };
  sheets: PrintSheet[];
  conditions: PrintCondition[];
  initialPages: number[];
  /** Takeoffs on this plan, and the ones left off the print (hidden on the plan, or here). */
  onPlan: { id: string; name: string; color: string; type: string }[];
  hidden: string[];
  /** The Material list and cut sheet for the takeoffs printed (made on the server). */
  materials: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [withMaterials, setWithMaterials] = useState(true);
  // The plan drawn faded under the takeoff: its own dark fills (elevations, cabinets) print light
  // gray instead of solid black on a black-and-white printer. The takeoff stays full strength.
  const [fadePlan, setFadePlan] = useState(true);
  const hidden = new Set(hiddenIds);
  // Turning a takeoff on or off: back to the server, so the Material list follows.
  const toggleTakeoff = (id: string) => {
    const next = new Set(hidden);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    const q = new URLSearchParams(params.toString());
    q.set("pages", [...chosen].join(","));
    if (next.size) q.set("hide", [...next].join(","));
    else q.delete("hide");
    startTransition(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
  };
  const [chosen, setChosen] = useState<Set<number>>(new Set(initialPages));
  // Labels: "joists" — what each joist area uses (the default); "all" — every takeoff's lengths too; "none".
  const [labelMode, setLabelMode] = useState<"joists" | "all" | "none">("joists");
  const labels = labelMode === "all";
  const joistLabels = labelMode !== "none";
  // The list of takeoffs used: beside the plan, or (to scale) on a page of its own.
  const [withLegend, setWithLegend] = useState(true);
  // Full size for a large-format printer: each sheet at its real paper size, nothing else on its page.
  const [toScale, setToScale] = useState(false);
  // To scale, the full-size sheets and the letter pages print separately: one print job can't mix
  // paper sizes reliably (the browser lays every page out at the first one's size).
  const [printPart, setPrintPart] = useState<"all" | "sheets" | "lists">("all");
  const printOnly = (part: "sheets" | "lists") => {
    flushSync(() => setPrintPart(part));
    // Back to showing everything once the print dialog closes.
    window.addEventListener("afterprint", () => setPrintPart("all"), { once: true });
    window.print();
  };
  const canScale = plan.kind === "PDF";
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>({});
  // The same, right away (the plan's lines can arrive before the state above updates).
  const sizeNow = useRef<Record<number, { w: number; h: number }>>({});
  const [rendered, setRendered] = useState<Set<number>>(new Set());
  // Where each sheet's own text is (dimensions, room names): labels stay off it.
  const [planText, setPlanText] = useState<Record<number, TextBox[]>>({});
  // Label boxes fit their words: measured in the font they print in.
  const measure = useMemo(() => {
    if (typeof document === "undefined") return null;
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return null;
    ctx.font = `600 100px ${getComputedStyle(document.body).fontFamily}`;
    return (t: string, size: number) => (ctx.measureText(t).width * size) / 100;
  }, []);
  const condById = new Map(conditions.map((c) => [c.id, c]));
  const shown = sheets.filter((s) => chosen.has(s.pageNumber));
  const ready = shown.every((s) => rendered.has(s.pageNumber));
  const today = fmtDate(new Date());

  const toggle = (n: number) =>
    setChosen((cur) => {
      const next = new Set(cur);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <div className="space-y-6">
      {/* One string: a <style> with several children doesn't match between server and browser. The letter
          pages printed on their own (to scale) force no orientation — portrait unless you pick landscape in
          the print dialog; everything else prints landscape. */}
      <style>
        {`@media print { @page { ${printPart === "lists" ? "margin: 0.5in;" : "size: landscape; margin: 0.35in;"} } .print-sheet { break-after: page; margin: 0 !important; } .print-sheet:last-child, .print-sheet.last-printed { break-after: auto; } } ${
          toScale && printPart !== "lists" ? scaleCss(shown.map((s) => ({ n: s.pageNumber, size: sizes[s.pageNumber] }))) : ""
        }`}
      </style>

      {/* Controls (not printed) */}
      <div className="no-print space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/projects/${projectId}/takeoff/${plan.id}?page=${shown[0]?.pageNumber ?? 1}`} className={buttonClasses("ghost", "sm")}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to the plan
          </Link>
          <p className="font-medium text-slate-900">Print marked-up plans · {plan.name}</p>
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              Labels
              <select className="input !w-auto !py-1 text-sm" value={labelMode} onChange={(e) => setLabelMode(e.target.value as typeof labelMode)}>
                <option value="joists">Joists</option>
                <option value="all">All takeoffs</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-700" title="The plan prints light under the takeoff — its dark fills don't come out solid black">
              <input type="checkbox" checked={fadePlan} onChange={(e) => setFadePlan(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Fade the plan
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={withLegend} onChange={(e) => setWithLegend(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Takeoffs used
            </label>
            <label
              className={cn("flex items-center gap-1.5 text-sm", canScale ? "text-slate-700" : "text-slate-400")}
              title={canScale ? undefined : "Only plans uploaded as PDFs have a real paper size"}
            >
              <input
                type="checkbox"
                checked={toScale}
                disabled={!canScale}
                onChange={(e) => {
                  setToScale(e.target.checked);
                  setRendered(new Set());
                }}
                className="h-4 w-4 rounded border-slate-300"
              />
              Print to scale (large format)
            </label>
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={withMaterials} onChange={(e) => setWithMaterials(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Material list &amp; cut sheet
            </label>
            {toScale ? (
              <>
                <Button type="button" onClick={() => printOnly("sheets")} disabled={!shown.length || !ready} title="Just the plan sheets, full size — for the plotter, at 100%">
                  <Printer className="h-4 w-4" /> {ready ? "Print plan sheets (to scale)" : `Preparing ${rendered.size}/${shown.length}…`}
                </Button>
                {withLegend || withMaterials ? (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => printOnly("lists")}
                    disabled={!shown.length}
                    title="The takeoffs used and the Material list & cut sheet, on letter paper"
                  >
                    <Printer className="h-4 w-4" /> Print {withLegend && withMaterials ? "takeoffs & materials" : withLegend ? "takeoffs used" : "materials"} (letter)
                  </Button>
                ) : null}
              </>
            ) : (
              <Button type="button" onClick={() => window.print()} disabled={!shown.length || !ready}>
                <Printer className="h-4 w-4" /> {ready ? "Print / Save PDF" : `Preparing ${rendered.size}/${shown.length}…`}
              </Button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Sheets:</span>
          {sheets.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => toggle(s.pageNumber)}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                chosen.has(s.pageNumber) ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {s.pageNumber}. {s.name}
              {s.shapes.length ? ` · ${s.shapes.length}` : ""}
            </button>
          ))}
          <button type="button" className="text-xs text-blue-700 underline" onClick={() => setChosen(new Set(sheets.filter((s) => s.shapes.length).map((s) => s.pageNumber)))}>
            all measured sheets
          </button>
        </div>
        {onPlan.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-slate-500">Takeoffs:</span>
            {onPlan.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => toggleTakeoff(c.id)}
                disabled={pending}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                  hidden.has(c.id) ? "bg-white text-slate-400 line-through ring-slate-200" : "bg-white text-slate-800 ring-slate-300",
                )}
                title={hidden.has(c.id) ? "Left off the print — click to print it" : "Printed — click to leave it off"}
              >
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: hidden.has(c.id) ? "#cbd5e1" : c.color }} />
                {c.name}
              </button>
            ))}
            <button
              type="button"
              disabled={pending}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-200 hover:bg-blue-50"
              title="Print only the joist and rafter takeoffs — everything else left off"
              onClick={() => {
                const q = new URLSearchParams(params.toString());
                q.set("pages", [...chosen].join(","));
                const off = onPlan.filter((c) => c.type !== "FRAMING").map((c) => c.id);
                if (off.length) q.set("hide", off.join(","));
                else q.delete("hide");
                startTransition(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
              }}
            >
              Just joists &amp; rafters
            </button>
            <button
              type="button"
              disabled={pending || !hidden.size}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 disabled:opacity-40"
              onClick={() => {
                const q = new URLSearchParams(params.toString());
                q.set("pages", [...chosen].join(","));
                q.delete("hide");
                startTransition(() => router.replace(`${pathname}?${q.toString()}`, { scroll: false }));
              }}
            >
              All
            </button>
            <span className="text-xs text-slate-500">— the ones hidden on the plan start off; the Material list follows.</span>
          </div>
        ) : null}
        <p className="text-xs text-slate-500">
          {toScale ? (
            <>
              <b>To scale:</b> each sheet prints at its full paper size (e.g. 24×36) with only the plan on it — print at <b>100% / Actual size</b>, not &ldquo;Fit&rdquo;, on a
              large-format printer or plotter, so 1/4&quot; = 1&apos; measures true. The takeoffs used and the Material list print on their own letter pages after.
            </>
          ) : (
            <>Prints landscape, one sheet per page. In the print dialog choose &ldquo;Save as PDF&rdquo; to send it to a supplier or sub.</>
          )}
        </p>
      </div>

      {shown.map((s, si) => {
        const size = sizes[s.pageNumber];
        const upf = s.unitsPerFoot;
        const sw = size ? size.w / 900 : 1; // line weight in page units
        const fs = size ? size.w / 150 : 8; // label size in page units
        return (
          <section
            key={s.id}
            className={cn(
              "print-sheet rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none",
              toScale && `scale-sheet-${s.pageNumber} print:overflow-hidden`,
              printPart === "lists" && "print:hidden",
              // Printing only the sheets: no page break after the last one (it'd add a blank sheet).
              (printPart === "sheets" || (toScale && printPart !== "lists")) && si === shown.length - 1 && "last-printed",
            )}
          >
            {/* Title block (to scale: the plan's own title block is on the sheet) */}
            <div className={cn("mb-2 flex flex-wrap items-end justify-between gap-2 border-b-2 border-slate-900 pb-1.5", toScale && "print:hidden")}>
              <div>
                <p className="text-base font-bold text-slate-900">
                  #{project.number} {project.name}
                </p>
                <p className="text-xs text-slate-600">{project.address}</p>
              </div>
              <div className="text-right text-xs text-slate-700">
                <p className="font-semibold text-slate-900">
                  {plan.name} · {s.name}
                </p>
                <p>
                  Scale {s.scaleLabel ?? "not set"} · Takeoff printed {today}
                </p>
              </div>
            </div>

            <div className={cn("flex flex-col gap-3 lg:flex-row print:flex-row", toScale && "print:h-full")}>
              {/* Plan with takeoff */}
              <div
                className={cn("relative min-h-40 min-w-0 flex-1 self-start border border-slate-300 bg-white", toScale && "print:h-full print:w-full print:border-0")}
                style={size ? { aspectRatio: `${size.w} / ${size.h}` } : undefined}
              >
                <div className="absolute inset-0" style={fadePlan ? { opacity: 0.4 } : undefined}>
                <PlanCanvas
                  key={toScale ? "scale" : "fit"}
                  url={plan.fileUrl}
                  kind={plan.kind}
                  pageNumber={s.pageNumber}
                  zoom={toScale ? SCALE_ZOOM : PRINT_ZOOM}
                  fill
                  onSize={(w, h) => {
                    sizeNow.current[s.pageNumber] = { w, h };
                    setSizes((cur) => (cur[s.pageNumber]?.w === w && cur[s.pageNumber]?.h === h ? cur : { ...cur, [s.pageNumber]: { w, h } }));
                  }}
                  onRendered={() => setRendered((cur) => (cur.has(s.pageNumber) ? cur : new Set(cur).add(s.pageNumber)))}
                  onText={(boxes) => setPlanText((cur) => ({ ...cur, [s.pageNumber]: [...boxes, ...(cur[s.pageNumber] ?? [])] }))}
                  // CAD plans often draw their lettering (dimensions, pitches, room names) as short strokes
                  // rather than text: those count as text to stay off too.
                  onVectors={(segs) => {
                    const page = sizeNow.current[s.pageNumber];
                    const stroke = (page ? page.w / 150 : 8) * 1.2;
                    const pad = stroke * 0.12;
                    const boxes: TextBox[] = [];
                    for (let i = 0; i + 3 < segs.length; i += 4) {
                      const [x1, y1, x2, y2] = [segs[i], segs[i + 1], segs[i + 2], segs[i + 3]];
                      const len = Math.hypot(x2 - x1, y2 - y1);
                      if (len > 0 && len <= stroke) boxes.push([Math.min(x1, x2) - pad, Math.min(y1, y2) - pad, Math.max(x1, x2) + pad, Math.max(y1, y2) + pad]);
                    }
                    setPlanText((cur) => ({ ...cur, [s.pageNumber]: [...(cur[s.pageNumber] ?? []), ...boxes] }));
                  }}
                />
                </div>
                {size ? (() => {
                  // Labels are gathered while the shapes draw, then placed and drawn last — on top of
                  // everything, each clear of the others and of the plan's own text.
                  const tags: Tag[] = [];
                  const shapes = s.shapes.map((m) => {
                      const c = condById.get(m.conditionId);
                      if (!c) return null;
                      const ownShown = !hidden.has(c.id);
                      if (!ownShown && !m.memberPieces?.some((row) => row.some((p) => !hidden.has(p.owner)))) return null;
                      const path = shapePath(c.type, m);
                      const d = path.map((p) => p.join(",")).join(" ");
                      // A label: dark text on a small white tag edged in the takeoff's color. An area's label
                      // stays inside its area (`region`); a line's stays near the line (`maxShift`).
                      const text = (
                        x: number,
                        y: number,
                        t: string,
                        rotate = 0,
                        color = c.color,
                        filled = false,
                        on = labels,
                        place: { region?: Pt[]; maxShift?: number; first?: boolean } = {},
                      ) => {
                        if (on) tags.push({ x, y, t, deg: rotate, color, filled, region: place.region, maxShift: place.region ? undefined : (place.maxShift ?? fs * 6), first: !!place.first });
                        return null;
                      };
                      if (c.type === "COUNT" || c.type === "DOOR" || c.type === "WINDOW") {
                        return (
                          <g key={m.id}>
                            {m.points.map((p, i) => (
                              <circle key={i} cx={p[0]} cy={p[1]} r={fs * 0.45} fill={c.color} stroke="white" strokeWidth={sw} />
                            ))}
                          </g>
                        );
                      }
                      if (c.type === "WALL") {
                        // Straight run: along its first wall; curved: at the middle of the curve.
                        const mi = m.arcs.length ? Math.floor((path.length - 2) / 2) : 0;
                        const a = path[mi];
                        const b = path[mi + 1] ?? a;
                        let deg = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
                        if (deg > 90) deg -= 180;
                        if (deg < -90) deg += 180;
                        return (
                          <g key={m.id}>
                            <polyline points={d} fill="none" stroke={c.color} strokeWidth={sw * 3} strokeLinejoin="miter" strokeLinecap="square" />
                            {upf ? text((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + fs * 1.2, feetInches(polylineLength(path) / upf), deg, c.color, false, labels, { maxShift: fs * 5 }) : null}
                          </g>
                        );
                      }
                      if (c.type === "LINEAR" || c.type === "HIP_VALLEY" || c.type === "BEAM" || c.type === "OPENING") {
                        const mid = m.points[Math.floor((m.points.length - 1) / 2)];
                        const next = m.points[Math.floor((m.points.length - 1) / 2) + 1] ?? mid;
                        const x = (mid[0] + next[0]) / 2;
                        const y = (mid[1] + next[1]) / 2;
                        let deg = (Math.atan2(next[1] - mid[1], next[0] - mid[0]) * 180) / Math.PI;
                        if (deg > 90) deg -= 180;
                        if (deg < -90) deg += 180;
                        const t = upf
                          ? c.type === "HIP_VALLEY"
                            ? `${c.memberSize ?? c.name} · ${feetInches(hipLength(c, m, upf).length)}`
                            : c.type === "BEAM"
                              ? beamLabel(c, m, upf)
                              : c.type === "OPENING"
                                ? inchesText((polylineLength(path) / upf) * 12)
                                : `${num(measurementMetrics(c, m, upf)[c.metric as MetricKey] ?? polylineLength(path) / upf)} ${metricUnit(c.metric)}`
                          : "";
                        return (
                          <g key={m.id}>
                            <polyline
                              points={d}
                              fill="none"
                              stroke={c.color}
                              strokeWidth={sw * (c.type === "HIP_VALLEY" || c.type === "BEAM" ? 4 : 3)}
                              strokeDasharray={m.isDeduction ? `${sw * 6} ${sw * 4}` : undefined}
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            {t ? text(x, y - fs * 0.5, t, deg, c.color, false, labels, { maxShift: fs * 5 }) : null}
                          </g>
                        );
                      }
                      const [cx, cy] = centroid(m.points);
                      const members = c.type === "FRAMING" && upf ? framingMembers(path, m.angle, (c.spacing / 12) * upf, memberThickness(c.memberSize, upf, c.memberWidthIn)) : [];
                      let label = "";
                      // Joist areas: what they use, one line per size — "2x8: (10) 14' (3) 18'".
                      const joistTags =
                        upf && c.type === "FRAMING" && joistLabels && (ownShown || m.memberPieces)
                          ? areaJoists(c, m, upf, condById)
                              .filter((g) => !hidden.has(g.conditionId))
                              .map((g, i) => <g key={i}>{text(g.at[0], g.at[1], joistGroupText(g), joistDeg(m.angle), g.color, false, true, { region: path, first: true })}</g>)
                          : null;
                      if (upf && c.type !== "FRAMING") {
                        const q = measurementMetrics(c, m, upf)[c.metric as MetricKey] ?? 0;
                        label = `${m.isDeduction ? "−" : ""}${num(Math.abs(q))} ${metricUnit(c.metric)}`;
                      }
                      // Each piece in the color of the size takeoff it's ordered under (hidden with it), a hair
                      // apart where two meet over a wall so the break shows.
                      const split = m.memberPieces && m.memberPieces.length === members.length ? m.memberPieces : null;
                      const shownOwner = (id: string) => {
                        const o = condById.get(id) ?? c;
                        return o && !hidden.has(o.id) ? o : null;
                      };
                      const gap = upf ? upf / 8 : 0;
                      return (
                        <g key={m.id}>
                          {/* Joists and rafters print as the area's outline and its joists — no shading. */}
                          {c.type === "FRAMING" && !m.isDeduction ? (
                            <polygon
                              points={d}
                              fill="none"
                              stroke={c.color}
                              strokeOpacity={ownShown ? 1 : 0.5}
                              strokeWidth={sw * 2}
                              strokeDasharray={ownShown ? undefined : `${sw * 4} ${sw * 4}`}
                            />
                          ) : ownShown ? (
                            <polygon
                              points={d}
                              // No shading on paper (it prints dark, black-and-white most of all): outlines only.
                              fill="none"
                              stroke={c.color}
                              strokeWidth={sw * 2}
                              strokeDasharray={m.isDeduction ? `${sw * 6} ${sw * 4}` : undefined}
                            />
                          ) : (
                            <polygon points={d} fill="none" stroke={c.color} strokeOpacity={0.4} strokeWidth={sw} strokeDasharray={`${sw * 4} ${sw * 4}`} />
                          )}
                          {members.flatMap((mem, i) =>
                            (split?.[i] ?? [{ a: 0, b: 1, owner: c.id, length: 0 }]).map((p, j, row) => {
                              const owner = shownOwner(p.owner);
                              if (!owner) return null;
                              const [a, b] = pieceLine(mem, p);
                              const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
                              const [ux, uy] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
                              const s0 = j > 0 ? gap / 2 : 0;
                              const s1 = j < row.length - 1 ? gap / 2 : 0;
                              return (
                                <line key={`${i}.${j}`} x1={a[0] + ux * s0} y1={a[1] + uy * s0} x2={b[0] - ux * s1} y2={b[1] - uy * s1} stroke={owner.color} strokeWidth={sw * 0.8} />
                              );
                            }),
                          )}
                          {label && ownShown ? text(cx, cy, label, 0, c.color, false, labels, { region: path }) : null}
                          {joistTags}
                        </g>
                      );
                    });
                  // Joist labels pick their spots first; then the rest, in drawing order.
                  const order = tags.map((_, i) => i).sort((i, j) => Number(tags[j].first) - Number(tags[i].first) || i - j);
                  const boxW = (t: string) => (measure ? measure(t, fs) : t.length * fs * 0.56) + fs * 0.6;
                  const boxH = fs * 1.25;
                  const spots = placeLabels(
                    order.map((i) => ({ x: tags[i].x, y: tags[i].y, w: boxW(tags[i].t), h: boxH, deg: tags[i].deg, region: tags[i].region, maxShift: tags[i].maxShift })),
                    planText[s.pageNumber] ?? [],
                  );
                  return (
                    <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
                      {shapes}
                      <g>
                        {order.map((i, k) => {
                          const g = tags[i];
                          const [x, y] = spots[k];
                          const w = boxW(g.t);
                          return (
                            <g key={i} transform={g.deg ? `rotate(${g.deg} ${x} ${y})` : undefined}>
                              <rect
                                x={x - w / 2}
                                y={y - boxH / 2}
                                width={w}
                                height={boxH}
                                rx={fs * 0.2}
                                fill={g.filled ? g.color : "white"}
                                fillOpacity={0.96}
                                stroke={g.color}
                                strokeWidth={sw}
                              />
                              <text x={x} y={y} dy="0.35em" fontSize={fs} fontWeight={600} fill={g.filled ? "white" : "#0f172a"} textAnchor="middle">
                                {g.t}
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    </svg>
                  );
                })() : null}
              </div>

              {/* Legend */}
              {withLegend && !toScale ? (
                <div className="w-full shrink-0 lg:w-56 print:w-56">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Takeoff on this sheet</p>
                  {s.legend.length === 0 ? (
                    <p className="text-xs text-slate-500">Nothing measured on this sheet.</p>
                  ) : (
                    <table className="w-full text-xs print:text-[8px] print:leading-tight">
                      <tbody>
                        {s.legend
                          .filter((l) => !hidden.has(l.conditionId))
                          .map((l) => (
                            <tr key={l.conditionId} className="border-b border-slate-100 align-top">
                              <td className="py-1 pr-1.5 print:py-px">
                                <span className="mt-0.5 inline-block h-3 w-3 rounded-sm" style={{ background: l.color }} />
                              </td>
                              <td className="py-1 pr-1 print:py-px">
                                <span className="font-medium text-slate-900">{l.name}</span>
                                <span className="block text-[10px] text-slate-500 print:hidden">
                                  {l.type}
                                  {l.shapes ? ` · ${l.shapes} shape${l.shapes === 1 ? "" : "s"}` : ""}
                                  {l.joists ? ` · ${l.joists} joist${l.joists === 1 ? "" : "s"} from other areas` : ""}
                                </span>
                              </td>
                              <td className="whitespace-nowrap py-1 text-right tabular-nums text-slate-900 print:py-px">
                                {num(l.quantity)} {l.unit}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </div>
          </section>
        );
      })}

      {/* To scale: the takeoffs used, on a letter page of their own. */}
      {toScale && withLegend && shown.length ? (
        <section
          className={cn(
            "print-sheet space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none",
            (printPart === "sheets" || toScale) && printPart !== "lists" && "print:hidden",
          )}
        >
          <div className="border-b-2 border-slate-900 pb-1.5">
            <p className="text-base font-bold text-slate-900">
              #{project.number} {project.name}
            </p>
            <p className="text-xs text-slate-600">
              Takeoffs used · {plan.name} · printed {today}
            </p>
          </div>
          {shown.map((s) => (
            <div key={s.id}>
              <p className="mb-1 text-sm font-semibold text-slate-900">
                {s.name} <span className="font-normal text-slate-500">· scale {s.scaleLabel ?? "not set"}</span>
              </p>
              <table className="w-full max-w-xl text-xs">
                <tbody>
                  {s.legend
                    .filter((l) => !hidden.has(l.conditionId))
                    .map((l) => (
                      <tr key={l.conditionId} className="border-b border-slate-100 align-top">
                        <td className="w-5 py-1">
                          <span className="mt-0.5 inline-block h-3 w-3 rounded-sm" style={{ background: l.color }} />
                        </td>
                        <td className="py-1 pr-2 font-medium text-slate-900">{l.name}</td>
                        <td className="py-1 pr-2 text-slate-500">{l.type}</td>
                        <td className="whitespace-nowrap py-1 text-right tabular-nums text-slate-900">
                          {num(l.quantity)} {l.unit}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      ) : null}

      {withMaterials && shown.length ? <div className={cn((printPart === "sheets" || toScale) && printPart !== "lists" && "print:hidden")}>{materials}</div> : null}
    </div>
  );
}

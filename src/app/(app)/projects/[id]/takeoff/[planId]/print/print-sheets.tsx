"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui";
import { cn, fmtDate, num } from "@/lib/utils";
import {
  centroid,
  feetInches,
  framingLengths,
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
};

export type PrintSheet = {
  id: string;
  pageNumber: number;
  name: string;
  scaleLabel: string | null;
  unitsPerFoot: number | null;
  shapes: PrintShape[];
  legend: { conditionId: string; name: string; color: string; type: string; quantity: number; unit: string; shapes: number }[];
};

/** Resolution the sheets render at for print (page units × this). */
const PRINT_ZOOM = 1.5;

export function PrintSheets({
  projectId,
  project,
  plan,
  sheets,
  conditions,
  initialPages,
}: {
  projectId: string;
  project: { number: number; name: string; address: string };
  plan: { id: string; name: string; kind: string; fileUrl: string };
  sheets: PrintSheet[];
  conditions: PrintCondition[];
  initialPages: number[];
}) {
  const [chosen, setChosen] = useState<Set<number>>(new Set(initialPages));
  const [labels, setLabels] = useState(true);
  const [sizes, setSizes] = useState<Record<number, { w: number; h: number }>>({});
  const [rendered, setRendered] = useState<Set<number>>(new Set());
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
      <style>{`@media print { @page { size: landscape; margin: 0.35in; } .print-sheet { break-after: page; } .print-sheet:last-child { break-after: auto; } }`}</style>

      {/* Controls (not printed) */}
      <div className="no-print space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/projects/${projectId}/takeoff/${plan.id}?page=${shown[0]?.pageNumber ?? 1}`} className={buttonClasses("ghost", "sm")}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to the plan
          </Link>
          <p className="font-medium text-slate-900">Print marked-up plans · {plan.name}</p>
          <div className="ml-auto flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
              Labels on the plan
            </label>
            <Button type="button" onClick={() => window.print()} disabled={!shown.length || !ready}>
              <Printer className="h-4 w-4" /> {ready ? "Print / Save PDF" : `Preparing ${rendered.size}/${shown.length}…`}
            </Button>
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
        <p className="text-xs text-slate-500">Prints landscape, one sheet per page. In the print dialog choose &ldquo;Save as PDF&rdquo; to send it to a supplier or sub.</p>
      </div>

      {shown.map((s) => {
        const size = sizes[s.pageNumber];
        const upf = s.unitsPerFoot;
        const sw = size ? size.w / 900 : 1; // line weight in page units
        const fs = size ? size.w / 95 : 10; // label size in page units
        return (
          <section key={s.id} className="print-sheet rounded-xl border border-slate-200 bg-white p-4 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
            {/* Title block */}
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2 border-b-2 border-slate-900 pb-1.5">
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

            <div className="flex flex-col gap-3 lg:flex-row print:flex-row">
              {/* Plan with takeoff */}
              <div className="relative min-h-40 min-w-0 flex-1 self-start border border-slate-300 bg-white" style={size ? { aspectRatio: `${size.w} / ${size.h}` } : undefined}>
                <PlanCanvas
                  url={plan.fileUrl}
                  kind={plan.kind}
                  pageNumber={s.pageNumber}
                  zoom={PRINT_ZOOM}
                  fill
                  onSize={(w, h) => setSizes((cur) => (cur[s.pageNumber]?.w === w && cur[s.pageNumber]?.h === h ? cur : { ...cur, [s.pageNumber]: { w, h } }))}
                  onRendered={() => setRendered((cur) => (cur.has(s.pageNumber) ? cur : new Set(cur).add(s.pageNumber)))}
                />
                {size ? (
                  <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${size.w} ${size.h}`} preserveAspectRatio="none">
                    {s.shapes.map((m) => {
                      const c = condById.get(m.conditionId);
                      if (!c) return null;
                      const path = shapePath(c.type, m);
                      const d = path.map((p) => p.join(",")).join(" ");
                      const halo = { stroke: "white", strokeWidth: fs * 0.3, paintOrder: "stroke" as const, strokeLinejoin: "round" as const };
                      const text = (x: number, y: number, t: string, rotate = 0) =>
                        labels ? (
                          <text
                            x={x}
                            y={y}
                            fontSize={fs}
                            fontWeight={700}
                            fill={c.color}
                            textAnchor="middle"
                            transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
                            {...halo}
                          >
                            {t}
                          </text>
                        ) : null;
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
                            {upf ? text((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + fs * 1.4, `${c.name} · ${feetInches(polylineLength(path) / upf)}`, deg) : null}
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
                            {t ? text(x, y - fs * 0.5, t, deg) : null}
                          </g>
                        );
                      }
                      const [cx, cy] = centroid(m.points);
                      const members = c.type === "FRAMING" && upf ? framingMembers(path, m.angle, (c.spacing / 12) * upf, memberThickness(c.memberSize, upf, c.memberWidthIn)) : [];
                      let label = "";
                      if (upf && c.type === "FRAMING") {
                        const lengths = framingLengths(c, m, upf);
                        const lo = Math.min(...lengths);
                        const hi = Math.max(...lengths);
                        const pitch = m.pitch ?? c.pitch;
                        label = `${c.memberSize ?? c.name} @ ${num(c.spacing, 2)}" o.c.${pitch ? ` · ${num(pitch, 2)}/12` : ""} · (${lengths.length}) ${
                          lengths.length ? (hi - lo < 1 / 12 ? feetInches(hi) : `${feetInches(lo)}–${feetInches(hi)}`) : ""
                        }`;
                      } else if (upf) {
                        const q = measurementMetrics(c, m, upf)[c.metric as MetricKey] ?? 0;
                        label = `${m.isDeduction ? "−" : ""}${num(Math.abs(q))} ${metricUnit(c.metric)}`;
                      }
                      return (
                        <g key={m.id}>
                          <polygon
                            points={d}
                            fill={m.isDeduction ? "white" : c.color}
                            fillOpacity={m.isDeduction ? 0.6 : c.type === "FRAMING" ? 0.1 : 0.22}
                            stroke={c.color}
                            strokeWidth={sw * 2}
                            strokeDasharray={m.isDeduction ? `${sw * 6} ${sw * 4}` : undefined}
                          />
                          {members.map(([a, b], i) => (
                            <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={c.color} strokeWidth={sw} />
                          ))}
                          {label ? text(cx, cy, label) : null}
                        </g>
                      );
                    })}
                  </svg>
                ) : null}
              </div>

              {/* Legend */}
              <div className="w-full shrink-0 lg:w-56 print:w-56">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Takeoff on this sheet</p>
                {s.legend.length === 0 ? (
                  <p className="text-xs text-slate-500">Nothing measured on this sheet.</p>
                ) : (
                  <table className="w-full text-xs">
                    <tbody>
                      {s.legend.map((l) => (
                        <tr key={l.conditionId} className="border-b border-slate-100 align-top">
                          <td className="py-1 pr-1.5">
                            <span className="mt-0.5 inline-block h-3 w-3 rounded-sm" style={{ background: l.color }} />
                          </td>
                          <td className="py-1 pr-1">
                            <span className="font-medium text-slate-900">{l.name}</span>
                            <span className="block text-[10px] text-slate-500">
                              {l.type} · {l.shapes} shape{l.shapes === 1 ? "" : "s"}
                            </span>
                          </td>
                          <td className="whitespace-nowrap py-1 text-right tabular-nums text-slate-900">
                            {num(l.quantity)} {l.unit}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { Layers, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Pt } from "@/lib/revisions";

/** The floor above, drawn on this sheet: its walls dashed in violet, with its name in the middle. A picture only. */
export function UpperFloorLayer({ walls, zoom, placing, snapped }: { walls: Pt[][]; zoom: number; placing?: boolean; snapped?: Pt | null }) {
  if (!walls.length) return null;
  const pts = walls.flat();
  const mid: Pt = [(Math.min(...pts.map((p) => p[0])) + Math.max(...pts.map((p) => p[0]))) / 2, (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2];
  return (
    <g pointerEvents="none" opacity={placing ? 0.95 : 0.8}>
      {walls.map((w, i) => (
        <polyline
          key={i}
          points={w.map((p) => p.join(",")).join(" ")}
          fill="none"
          stroke="#7c3aed"
          strokeWidth={(placing ? 3 : 2.25) / zoom}
          strokeDasharray={`${8 / zoom} ${5 / zoom}`}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      <text x={mid[0]} y={mid[1]} textAnchor="middle" dominantBaseline="middle" fontSize={13 / zoom} fontWeight={700} fill="#6d28d9" stroke="#fff" strokeWidth={3 / zoom} paintOrder="stroke">
        Floor above
      </text>
      {snapped ? <circle cx={snapped[0]} cy={snapped[1]} r={7 / zoom} fill="none" stroke="#ea580c" strokeWidth={2.5 / zoom} /> : null}
    </g>
  );
}

/**
 * The toolbar's "Floor above" button. Set up: show / hide it, move it, take it off. Not yet: pick
 * where it's drawn — on this sheet (click one of its walls) or another sheet of this plan.
 */
export function UpperFloorButton({
  placed,
  shown,
  busy,
  sheets,
  onToggle,
  onPickHere,
  onPickSheet,
  onMove,
  onRemove,
}: {
  placed: boolean;
  shown: boolean;
  busy: boolean;
  /** Other sheets of this plan, with how many measurements each has. */
  sheets: { id: string; label: string; count: number }[];
  onToggle: () => void;
  onPickHere: () => void;
  onPickSheet: (sheetId: string) => void;
  onMove: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);
  const item = "block w-full rounded px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100";
  return (
    <div ref={box} className="relative">
      <div className="flex">
        {placed ? (
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={shown}
            title={shown ? "The floor above is showing — click to hide it" : "Show the floor above over this sheet"}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-l-md border px-2.5 text-xs font-medium transition-colors",
              shown ? "border-violet-200 bg-violet-50 text-violet-800" : "border-slate-300 bg-white text-slate-500 hover:bg-slate-50",
            )}
          >
            <Layers className="h-3.5 w-3.5" /> Floor above {shown ? "on" : "off"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen((o) => !o)}
          title="Lay the floor above (2nd floor) over this sheet, to draw its floor joists here"
          className={cn(
            "inline-flex h-8 items-center gap-1.5 border px-2.5 text-xs font-medium text-slate-600 hover:bg-slate-50",
            placed ? "rounded-r-md border-l-0 border-slate-300 bg-white px-1.5" : "rounded-md border-slate-300 bg-white",
          )}
        >
          {placed ? "▾" : (
            <>
              <Layers className="h-3.5 w-3.5" /> Floor above
            </>
          )}
        </button>
      </div>
      {open ? (
        <div className="absolute right-0 z-40 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
          {placed ? (
            <>
              <button type="button" className={item} onClick={() => (setOpen(false), onMove())}>
                Move it
              </button>
              <button type="button" className={cn(item, "text-rose-700")} onClick={() => (setOpen(false), onRemove())}>
                Take it off this sheet
              </button>
              <p className="mt-1 border-t border-slate-100 px-2.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Or pick it again</p>
            </>
          ) : (
            <p className="px-2.5 pb-1 pt-0.5 text-xs text-slate-500">Where is the floor above drawn? Its walls need to be traced (Find walls does it in a click).</p>
          )}
          <button type="button" className={item} onClick={() => (setOpen(false), onPickHere())}>
            <span className="font-medium">On this sheet</span>
            <span className="block text-[11px] text-slate-500">Then click one of its walls</span>
          </button>
          {sheets.map((s) => (
            <button key={s.id} type="button" className={item} onClick={() => (setOpen(false), onPickSheet(s.id))}>
              <span className="font-medium">{s.label}</span>
              {s.count ? null : <span className="block text-[11px] text-slate-500">Nothing traced there yet</span>}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** While placing: what to do, turn it, done or cancel. */
export function UpperFloorPlacing({ onTurn, onCancel }: { onTurn: () => void; onCancel: () => void }) {
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs text-white shadow-lg">
      <span>
        <b>Move the floor above into place</b> — it snaps to this floor&apos;s walls. <b>Double-click</b> to set it.
      </span>
      <button type="button" onClick={onTurn} className="inline-flex items-center gap-1 rounded bg-white/15 px-2 py-1 font-semibold hover:bg-white/25" title="Turn it a quarter turn (R)">
        <RotateCw className="h-3.5 w-3.5" /> Turn
      </button>
      <button type="button" onClick={onCancel} className="rounded bg-white/15 px-2 py-1 font-semibold hover:bg-white/25">
        Cancel
      </button>
    </div>
  );
}

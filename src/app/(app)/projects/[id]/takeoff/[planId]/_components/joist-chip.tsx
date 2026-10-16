"use client";

import { ChevronDown, ChevronUp, RotateCcw, Scissors } from "lucide-react";
import { feetInches } from "@/lib/takeoff";

/**
 * The little controls right on the plan, where you clicked a joist area (joist-sections.ts):
 * - a bay: ▼ size ▲ — down or up a size (↺ back to the span table);
 * - a break (joists lapped over a wall): Run through — one board over it;
 * - a wall the joists run through: Break here.
 * Placed at the click, turned back upright when the plan is turned.
 */
export type ChipState =
  | { kind: "size"; at: [number, number] }
  | { kind: "break"; at: [number, number]; wall: string; tooLong: { needs: number; max: number } | null }
  | { kind: "through"; at: [number, number]; wall: string };

export function JoistChip({
  chip,
  zoom,
  rotation,
  busy,
  size,
  picked,
  canDown,
  canUp,
  onDown,
  onUp,
  onReset,
  onRunThrough,
  onBreak,
  onSplit,
}: {
  chip: ChipState;
  zoom: number;
  rotation: number;
  busy: boolean;
  /** The bay's size now ("Mixed" for bays of different sizes). */
  size: string;
  picked: boolean;
  canDown: boolean;
  canUp: boolean;
  onDown: () => void;
  onUp: () => void;
  onReset: () => void;
  onRunThrough: () => void;
  onBreak: () => void;
  /** The bay's joists run through a wall (one board over it): break them there again. */
  onSplit?: () => void;
}) {
  const btn = "flex h-6 items-center justify-center rounded px-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30";
  return (
    <div
      className="absolute z-20"
      style={{ left: chip.at[0] * zoom, top: chip.at[1] * zoom, transform: `rotate(${-rotation}deg) translate(-50%, calc(-100% - 10px))`, transformOrigin: "0 0" }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-0.5 whitespace-nowrap rounded-md border border-slate-200 bg-white px-1 py-0.5 text-xs shadow-lg">
        {chip.kind === "size" ? (
          <>
            <button type="button" className={btn} disabled={busy || !canDown} onClick={onDown} title="Down a size">
              <ChevronDown className="h-4 w-4" />
            </button>
            <span className={`px-1 font-semibold ${picked ? "text-blue-700" : "text-slate-900"}`}>
              {size}
              {picked ? " ✎" : ""}
            </span>
            <button type="button" className={btn} disabled={busy || !canUp} onClick={onUp} title="Up a size">
              <ChevronUp className="h-4 w-4" />
            </button>
            {picked ? (
              <button type="button" className={btn} disabled={busy} onClick={onReset} title="Back to the span table's size">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {onSplit ? (
              <button type="button" className={`${btn} gap-0.5 border-l border-slate-200 pl-1.5`} disabled={busy} onClick={onSplit} title="These joists run through a wall as one board — break them on it again">
                <Scissors className="h-3.5 w-3.5" /> Break
              </button>
            ) : null}
          </>
        ) : chip.kind === "break" ? (
          chip.tooLong ? (
            <span className="px-1 text-slate-500" title={`One board over this wall would be ${feetInches(chip.tooLong.needs)} — longer than the ${chip.tooLong.max}' you buy`}>
              Can&apos;t run through — needs {feetInches(chip.tooLong.needs)}
            </span>
          ) : (
            <button type="button" className={`${btn} px-1.5 font-medium text-slate-800`} disabled={busy} onClick={onRunThrough} title="One board over this wall instead of two lapped pieces">
              Run through
            </button>
          )
        ) : (
          <button type="button" className={`${btn} px-1.5 font-medium text-slate-800`} disabled={busy} onClick={onBreak} title="Break the joists on this wall again (or double-click the wall)">
            Break here
          </button>
        )}
      </div>
    </div>
  );
}

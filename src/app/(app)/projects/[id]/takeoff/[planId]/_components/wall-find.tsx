"use client";

import { Check, X } from "lucide-react";
import { Button } from "@/components/ui";
import { inchesText } from "@/lib/takeoff";
import { num } from "@/lib/utils";
import type { Pt, WallKind } from "@/lib/wall-detect";

/** What "Find walls" found for a takeoff, and the runs you've left out. */
export type WallFind = { conditionId: string; thicknessIn: number; kind: WallKind; openings: number; runs: Pt[][]; lengthsFt: number[]; off: number[] };

/** The found walls on the plan: highlighted, click one to leave it out (or back in). */
export function FoundWalls({ find, color, zoom, onToggle }: { find: WallFind; color: string; zoom: number; onToggle: (i: number) => void }) {
  return (
    <g>
      {find.runs.map((run, i) => {
        const off = find.off.includes(i);
        const d = run.map((p) => p.join(",")).join(" ");
        return (
          <g
            key={i}
            data-found
            style={{ cursor: "pointer" }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggle(i);
            }}
          >
            <polyline points={d} fill="none" stroke="transparent" strokeWidth={16 / zoom} />
            <polyline
              points={d}
              fill="none"
              stroke={off ? "#94a3b8" : color}
              strokeOpacity={off ? 0.6 : 0.85}
              strokeWidth={(off ? 3 : 6) / zoom}
              strokeDasharray={off ? `${6 / zoom} ${5 / zoom}` : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        );
      })}
    </g>
  );
}

/**
 * The stud a drawn stud space looks like. Plans draw it a little under the real depth
 * (3½" studs drawn 2⅞"–3¼"), so it's the nearest of 2x4 / 2x6 / 2x8 / 2x10 / 2x12 by range.
 */
export function drawnStud(studSpaceIn: number): string | null {
  if (studSpaceIn < 2.5) return null;
  const sizes: [number, string][] = [
    [4.5, "2x4"],
    [6.5, "2x6"],
    [8.5, "2x8"],
    [10.5, "2x10"],
  ];
  return sizes.find(([upTo]) => studSpaceIn < upTo)?.[1] ?? "2x12";
}

/** The review card: what was found, Add walls / Clear. */
export function WallFindPanel({
  find,
  conditionName,
  studSize,
  onAdd,
  onClear,
}: {
  find: WallFind | null;
  conditionName: string;
  studSize: string | null;
  onAdd: () => void;
  onClear: () => void;
}) {
  const drawnAs = find ? drawnStud(find.thicknessIn) : null;
  const takeoffStud = studSize?.match(/2\s*x\s*(4|6|8|10|12)/i)?.[1];
  const mismatch = drawnAs && takeoffStud && drawnAs !== `2x${takeoffStud}` ? drawnAs : null;
  const kept = find ? find.runs.map((_, i) => i).filter((i) => !find.off.includes(i)) : [];
  const lf = find ? kept.reduce((s, i) => s + find.lengthsFt[i], 0) : 0;
  return (
    <div className="absolute left-3 top-3 z-10 w-80 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
      <p className="font-semibold text-slate-900">Find walls · {conditionName}</p>
      {find ? (
        <>
          <p className="mt-1 text-slate-700">
            Found <b>{kept.length}</b> {find.kind} wall{kept.length === 1 ? "" : "s"} · <b>{num(lf)} lf</b>
            {find.off.length ? <span className="text-slate-500"> ({find.off.length} left out)</span> : null}
          </p>
          {mismatch ? (
            <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
              These walls are drawn like <b>{mismatch}</b> ({inchesText(find.thicknessIn)} stud space) — this takeoff is <b>{studSize}</b>. Wrong takeoff? Pick the {mismatch} one,
              or add them and change them after.
            </p>
          ) : null}
          <p className="mt-0.5 text-xs text-slate-500">
            {drawnAs ? `Drawn like ${drawnAs} · ` : ""}
            {inchesText(find.thicknessIn)} stud space · across {find.openings} door{find.openings === 1 ? "" : "s"} &amp; opening{find.openings === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {find.kind === "exterior"
              ? "Outside walls only — the ones with siding or brick along them. Brick isn't counted as a wall. Interior walls are left for their own takeoff."
              : "Inside walls only — drywall both sides, nothing along them. Outside walls are left for their own takeoff."}{" "}
            Only walls drawn this thick — a 2x6 wall is never mixed in with 2x4s. Each wall is added on its own, so you can click one later and change just it. Click a highlighted
            wall to leave it out, or click another wall to search again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Button type="button" size="sm" onClick={onAdd} disabled={!kept.length}>
              <Check className="h-3.5 w-3.5" /> Add {kept.length} wall{kept.length === 1 ? "" : "s"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClear}>
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-1 text-xs text-slate-600">
          Click a wall on the plan — on any of its lines. Click an outside wall to get the outside walls (the ones with siding or brick along them), an inside wall to get the
          inside walls; it follows them across doors. Works on plans made in CAD (not scans).
        </p>
      )}
    </div>
  );
}

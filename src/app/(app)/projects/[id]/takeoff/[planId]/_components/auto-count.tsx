"use client";

import { Loader2, X } from "lucide-react";
import { DEFAULT_MATCH, type Box } from "@/lib/symbol-match";
import { cn } from "@/lib/utils";

export type FoundSymbol = Box & { score: number };

/** One auto-count: the sample picked, what was found on each sheet, and what you've left out. */
export type AutoCount = {
  conditionId: string;
  status: "pick" | "searching" | "done" | "error";
  message?: string;
  progress: number; // 0–1 across every sheet searched
  allSheets: boolean;
  sample?: { pageNumber: number; box: Box; thumb: string };
  /** By page number: the sheet and its matches (page units). */
  results: Record<number, { sheetId: string; matches: FoundSymbol[] }>;
  threshold: number;
  /** "page:index" of matches clicked off. */
  rejected: string[];
};

export const newAutoCount = (conditionId: string, allSheets = false): AutoCount => ({
  conditionId,
  status: "pick",
  progress: 0,
  allSheets,
  results: {},
  threshold: DEFAULT_MATCH,
  rejected: [],
});

/** A spot that already has a marker on this takeoff (so it isn't counted twice). */
function counted(m: FoundSymbol, existing: [number, number][]) {
  const cx = m.x + m.w / 2;
  const cy = m.y + m.h / 2;
  const r = Math.max(m.w, m.h) * 0.6;
  return existing.some(([x, y]) => Math.abs(x - cx) <= r && Math.abs(y - cy) <= r);
}

/**
 * What each sheet would add: matches at or above the Match setting, not clicked off,
 * and not already counted. `existing(page)` lists that sheet's markers for the takeoff.
 */
export function autoCountPlan(a: AutoCount, existing: (page: number) => [number, number][]) {
  const pages = Object.entries(a.results).map(([p, r]) => {
    const page = Number(p);
    const have = existing(page);
    const rows = r.matches.map((m, i) => {
      const key = `${page}:${i}`;
      const state: "add" | "off" | "counted" | "weak" = m.score < a.threshold ? "weak" : counted(m, have) ? "counted" : a.rejected.includes(key) ? "off" : "add";
      return { m, key, state };
    });
    return { page, sheetId: r.sheetId, rows };
  });
  const add = pages.flatMap((p) => p.rows.filter((r) => r.state === "add").map((r) => ({ sheetId: p.sheetId, x: r.m.x + r.m.w / 2, y: r.m.y + r.m.h / 2 })));
  return {
    pages,
    add,
    counted: pages.reduce((n, p) => n + p.rows.filter((r) => r.state === "counted").length, 0),
    off: pages.reduce((n, p) => n + p.rows.filter((r) => r.state === "off").length, 0),
  };
}

/** Found symbols on the sheet: dashed rings to keep, gray crosses for ones clicked off. Click toggles. */
export function FoundMarkers({
  rows,
  color,
  zoom,
  onToggle,
}: {
  rows: { m: FoundSymbol; key: string; state: string }[];
  color: string;
  zoom: number;
  onToggle: (key: string) => void;
}) {
  const px = (n: number) => n / zoom;
  return (
    <g>
      {rows
        .filter((r) => r.state === "add" || r.state === "off")
        .map(({ m, key, state }) => {
          const cx = m.x + m.w / 2;
          const cy = m.y + m.h / 2;
          const rad = Math.max(m.w, m.h) / 2 + px(4);
          const off = state === "off";
          return (
            <g
              key={key}
              data-found
              style={{ cursor: "pointer" }}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(key);
              }}
            >
              <title>{off ? "Left out — click to count it" : `Match ${Math.round(m.score * 100)}% — click to leave it out`}</title>
              <circle
                cx={cx}
                cy={cy}
                r={rad}
                fill={off ? "#94a3b8" : color}
                fillOpacity={0.15}
                stroke={off ? "#94a3b8" : color}
                strokeWidth={px(2)}
                strokeDasharray={`${px(4)} ${px(3)}`}
              />
              {off ? (
                <path
                  d={`M${cx - rad * 0.6} ${cy - rad * 0.6} L${cx + rad * 0.6} ${cy + rad * 0.6} M${cx + rad * 0.6} ${cy - rad * 0.6} L${cx - rad * 0.6} ${cy + rad * 0.6}`}
                  stroke="#64748b"
                  strokeWidth={px(2)}
                />
              ) : null}
            </g>
          );
        })}
    </g>
  );
}

/** The floating auto-count panel: pick a symbol → searching → review and add. */
export function AutoCountPanel({
  auto,
  conditionName,
  pageNumber,
  sheetCount,
  plan,
  assigns,
  onThreshold,
  onAllSheets,
  onAdd,
  onRestart,
  onClose,
}: {
  auto: AutoCount;
  conditionName: string;
  pageNumber: number;
  sheetCount: number;
  plan: ReturnType<typeof autoCountPlan>;
  /** Doors / windows: what each found one will be ("3068 Ext door"), or null for none picked. */
  assigns?: { noun: string; name: string | null };
  onThreshold: (t: number) => void;
  onAllSheets: (on: boolean) => void;
  onAdd: () => void;
  onRestart: () => void;
  onClose: () => void;
}) {
  const here = plan.pages.find((p) => p.page === pageNumber)?.rows.filter((r) => r.state === "add").length ?? 0;
  const total = plan.add.length;
  const searched = Object.keys(auto.results).length;
  return (
    <div className="absolute left-3 top-3 z-10 w-80 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg">
      <div className="mb-2 flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-semibold text-slate-900">Auto-count · {conditionName}</p>
        <button type="button" aria-label="Close auto-count" className="text-slate-400 hover:text-slate-700" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>

      {auto.status === "pick" ? (
        <p className="text-slate-700">
          <strong>Drag a box around one symbol</strong> on the plan — an outlet, a light, a door tag. A loose box is fine.
        </p>
      ) : null}

      {auto.status === "searching" ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-slate-700">
            <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
            Searching{auto.allSheets && sheetCount > 1 ? ` sheet ${Math.min(sheetCount, searched + 1)} of ${sheetCount}` : ""}…
          </p>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-blue-600 transition-[width]" style={{ width: `${Math.round(auto.progress * 100)}%` }} />
          </div>
        </div>
      ) : null}

      {auto.status === "error" ? <p className="text-rose-700">{auto.message ?? "The search didn't work."}</p> : null}

      {auto.status === "done" ? (
        <div className="space-y-2.5">
          <div className="flex items-center gap-3">
            {auto.sample ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={auto.sample.thumb} alt="The symbol searched for" className="h-12 w-12 shrink-0 rounded border border-slate-200 bg-white object-contain p-0.5" />
            ) : null}
            <div className="min-w-0">
              <p className="text-slate-900">
                Found <strong className="text-lg">{here}</strong> on this sheet
              </p>
              {auto.allSheets && sheetCount > 1 ? (
                <p className="text-xs text-slate-600">
                  {total} on all {sheetCount} sheets — flip sheets to review them
                </p>
              ) : null}
            </div>
          </div>
          {plan.counted ? <p className="text-xs text-slate-500">{plan.counted} already counted on this takeoff — skipped.</p> : null}
          <label className="block">
            <span className="flex justify-between text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <span>Match</span>
              <span className="font-normal normal-case">{Math.round(auto.threshold * 100)}%</span>
            </span>
            <input
              type="range"
              min={0.45}
              max={0.98}
              step={0.01}
              value={auto.threshold}
              onChange={(e) => onThreshold(Number(e.target.value))}
              className="w-full accent-blue-700"
              aria-label="Match strictness"
            />
            <span className="flex justify-between text-[11px] text-slate-500">
              <span>Looser (more)</span>
              <span>Stricter (fewer)</span>
            </span>
          </label>
          <p className="text-xs text-slate-500">Click a dashed ring to leave it out{plan.off ? ` (${plan.off} left out)` : ""}. Check the plan — similar symbols can sneak in.</p>
          {assigns ? (
            <p className={cn("text-xs", assigns.name ? "text-slate-600" : "text-amber-700")}>
              {assigns.name ? (
                <>
                  Each one is added as <strong>{assigns.name}</strong>.
                </>
              ) : (
                <>
                  No {assigns.noun} picked — they&apos;re added as &ldquo;?&rdquo; and you pick the {assigns.noun} on each later.
                </>
              )}
            </p>
          ) : null}
        </div>
      ) : null}

      {sheetCount > 1 && auto.status !== "searching" ? (
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
          <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={auto.allSheets} onChange={(e) => onAllSheets(e.target.checked)} />
          Search all {sheetCount} sheets
        </label>
      ) : null}

      <div className="mt-3 flex items-center gap-2">
        {auto.status === "done" ? (
          <button
            type="button"
            disabled={!total}
            onClick={onAdd}
            className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
          >
            Add {total} count{total === 1 ? "" : "s"}
          </button>
        ) : null}
        {auto.status === "done" || auto.status === "error" ? (
          <button type="button" onClick={onRestart} className="text-xs font-medium text-slate-600 hover:underline">
            Pick a different symbol
          </button>
        ) : null}
        <button type="button" onClick={onClose} className="ml-auto text-xs text-slate-500 hover:underline">
          {auto.status === "searching" ? "Stop" : "Cancel"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ArrowRight, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type RevSheet = { id: string; pageNumber: number; name: string; count: number };

/** This plan set's place among its revisions (what the viewer's revision bar and panels need). */
export type RevisionInfo = {
  revision: number;
  /** A newer revision took this one's takeoffs. */
  replacedBy: { id: string; revision: number } | null;
  /** The newest revision when one exists but hasn't taken the takeoffs yet. */
  newer: { id: string; revision: number } | null;
  prev: { id: string; revision: number; fileUrl: string; kind: string; replaced: boolean; sheets: RevSheet[] } | null;
};

const panel = "absolute left-3 top-3 z-10 w-80 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-lg";

/** Compare with the previous revision: which old sheet, fade, lining up, and the takeoff shapes that sit on changes. */
export function ComparePanel({
  prevRevision,
  prevSheets,
  pairId,
  onPair,
  fade,
  onFade,
  aligning,
  aligned,
  onAlign,
  onAlignDone,
  onAlignCancel,
  onAlignReset,
  changed,
  onJump,
  onClose,
}: {
  prevRevision: number;
  prevSheets: RevSheet[];
  pairId: string | null;
  onPair: (id: string | null) => void;
  fade: number;
  onFade: (v: number) => void;
  aligning: { old: number; now: number } | null;
  aligned: boolean;
  onAlign: () => void;
  onAlignDone: () => void;
  onAlignCancel: () => void;
  onAlignReset: () => void;
  changed: { id: string; label: string; color: string }[];
  onJump: (id: string) => void;
  onClose: () => void;
}) {
  const step = aligning ? (aligning.old > aligning.now ? "new" : "old") : null;
  const pairsDone = aligning ? Math.min(aligning.old, aligning.now) : 0;
  return (
    <div className={panel}>
      <div className="mb-2 flex items-center gap-2">
        <p className="flex-1 font-semibold text-slate-900">Compare with Rev {prevRevision}</p>
        <button type="button" aria-label="Close compare" className="text-slate-400 hover:text-slate-700" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-600" /> Removed
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-700" /> Added
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-400" /> Same
        </span>
      </div>
      <label className="mb-2 block text-xs text-slate-600">
        Old sheet
        <select className="input mt-0.5 !h-8 !py-1 text-xs" value={pairId ?? ""} onChange={(e) => onPair(e.target.value || null)}>
          <option value="">— none —</option>
          {prevSheets.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.count ? ` (${s.count} measured)` : ""}
            </option>
          ))}
        </select>
      </label>
      {pairId ? (
        <>
          <label className="block text-xs text-slate-600">
            Fade
            <input type="range" min={0.2} max={1} step={0.05} value={fade} onChange={(e) => onFade(Number(e.target.value))} className="w-full accent-blue-700" aria-label="Overlay fade" />
          </label>
          {aligning ? (
            <div className="mt-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
              {step === "old" ? (
                <p>
                  <strong>Click a point on the red (old) drawing</strong> — a wall corner or grid line crossing{pairsDone ? " (a second one, far from the first)" : ""}.
                </p>
              ) : (
                <p>
                  <strong>Now click the same point on the new drawing.</strong>
                </p>
              )}
              <div className="mt-1.5 flex gap-2">
                {pairsDone >= 1 ? (
                  <button type="button" onClick={onAlignDone} className="rounded bg-amber-600 px-2 py-0.5 font-semibold text-white hover:bg-amber-700">
                    Done{pairsDone === 1 ? " (just shift it)" : ""}
                  </button>
                ) : null}
                <button type="button" onClick={onAlignCancel} className="hover:underline">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-slate-600">
              Red and blue doubled lines everywhere? The new sheet is shifted:{" "}
              <button type="button" className="font-medium text-blue-700 hover:underline" onClick={onAlign}>
                Line them up
              </button>
              {aligned ? (
                <>
                  {" · "}
                  <button type="button" className="text-slate-500 hover:underline" onClick={onAlignReset}>
                    reset
                  </button>
                </>
              ) : null}
            </p>
          )}
          <div className="mt-3 border-t border-slate-100 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Takeoff on changes · {changed.length}</p>
            {changed.length ? (
              <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto">
                {changed.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => onJump(c.id)} className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-slate-700 hover:bg-amber-50">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                      <span className="truncate">{c.label}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-slate-500">Nothing measured on this sheet sits on a change.</p>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs text-slate-500">Pick the old sheet this one replaces.</p>
      )}
    </div>
  );
}

/** Move every measurement from the previous revision onto this one, sheet by sheet. */
export function BringForwardPanel({
  prevRevision,
  revision,
  prevSheets,
  sheets,
  defaults,
  onMove,
  onClose,
}: {
  prevRevision: number;
  revision: number;
  prevSheets: RevSheet[];
  sheets: { id: string; name: string }[];
  defaults: Map<string, string>;
  onMove: (pairs: { oldSheetId: string; newSheetId: string }[], copyScale: boolean) => Promise<void>;
  onClose: () => void;
}) {
  const measured = prevSheets.filter((s) => s.count > 0);
  const [to, setTo] = useState<Record<string, string>>(() => Object.fromEntries(measured.map((s) => [s.id, defaults.get(s.id) ?? ""])));
  const [copyScale, setCopyScale] = useState(true);
  const [busy, setBusy] = useState(false);
  const pairs = measured.filter((s) => to[s.id]).map((s) => ({ oldSheetId: s.id, newSheetId: to[s.id] }));
  const moving = measured.filter((s) => to[s.id]).reduce((n, s) => n + s.count, 0);
  const skipped = measured.filter((s) => !to[s.id]).reduce((n, s) => n + s.count, 0);
  return (
    <div className={cn(panel, "w-[26rem]")}>
      <div className="mb-2 flex items-center gap-2">
        <p className="flex-1 font-semibold text-slate-900">
          Bring takeoffs forward: Rev {prevRevision} → Rev {revision}
        </p>
        <button type="button" aria-label="Close" className="text-slate-400 hover:text-slate-700" onClick={onClose}>
          <X className="h-4 w-4" />
        </button>
      </div>
      {measured.length === 0 ? (
        <p className="text-slate-600">Rev {prevRevision} has no measurements to bring forward.</p>
      ) : (
        <>
          <p className="mb-2 text-xs text-slate-600">Each old sheet&apos;s measurements move to the new sheet you pick (lined up, if you lined them up in Compare).</p>
          <ul className="max-h-64 space-y-1.5 overflow-y-auto">
            {measured.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-xs">
                <span className="min-w-0 flex-1 truncate text-slate-800" title={s.name}>
                  {s.name} <span className="text-slate-500">· {s.count}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <select
                  aria-label={`New sheet for ${s.name}`}
                  className={cn("input !h-7 !w-40 !py-0 text-xs", !to[s.id] && "border-amber-400")}
                  value={to[s.id] ?? ""}
                  onChange={(e) => setTo({ ...to, [s.id]: e.target.value })}
                >
                  <option value="">Leave behind</option>
                  {sheets.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" className="h-3.5 w-3.5 rounded border-slate-300" checked={copyScale} onChange={(e) => setCopyScale(e.target.checked)} />
            Copy each sheet&apos;s scale (where the new sheet has none)
          </label>
          {skipped ? <p className="mt-1 text-xs text-amber-700">{skipped} measurement(s) on sheets left behind stay with Rev {prevRevision} and still count.</p> : null}
          <p className="mt-2 text-xs text-slate-500">Afterward Rev {prevRevision} is kept only for comparing.</p>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              disabled={!pairs.length || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onMove(pairs, copyScale);
                } finally {
                  setBusy(false);
                }
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Move {moving} measurement{moving === 1 ? "" : "s"}
            </button>
            <button type="button" onClick={onClose} className="text-xs text-slate-500 hover:underline">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

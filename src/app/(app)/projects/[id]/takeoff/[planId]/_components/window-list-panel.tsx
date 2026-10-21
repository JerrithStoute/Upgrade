"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { actionMessage } from "@/lib/action-message";
import { MAX_LINES, WINDOW_COLORS, WINDOW_TYPES, sizeCode, type WindowColor, type WindowDetail } from "@/lib/window-list";

const OTHER = "__other";
import type { JobWindowLine } from "../../actions";

/**
 * The job's windows, to pick from while counting: a short list (size, type, color, and the company's
 * own details), each line numbered — click it, or press its number, then click the plan. New windows
 * are added right here; the color starts as the last window on the list was, and stays as you leave it.
 */
export function WindowListPanel({
  lines,
  details,
  counts,
  value,
  onPick,
  onAdd,
  onSet,
  onAddDetail,
  onRemoveDetail,
  compact,
}: {
  lines: JobWindowLine[];
  details: WindowDetail[];
  /** How many of each are on the job (every sheet). */
  counts: Record<string, number>;
  value: string | null;
  onPick: (id: string) => void;
  onAdd: (w: {
    size: string;
    type: string;
    color: string;
    values: Record<string, string>;
  }) => Promise<{ ok: true; lines: JobWindowLine[] } | { ok: false; error: string }>;
  onSet: (change: { lines?: string[] }) => Promise<unknown>;
  /** A new detail for every window (the company's list); hands back the list. */
  onAddDetail?: (d: { name: string; kind: string }) => Promise<{ ok: true; details: WindowDetail[] } | { ok: false; error: string }>;
  /** Takes a detail off every window (the company's list). */
  onRemoveDetail?: (name: string) => Promise<unknown>;
  /** The selected window's panel: just the list, to switch it. */
  compact?: boolean;
}) {
  const [size, setSize] = useState("");
  const [type, setType] = useState(WINDOW_TYPES[0]);
  const [otherType, setOtherType] = useState(false);
  const [newDetail, setNewDetail] = useState<{ name: string; kind: string } | null>(null);
  // Types typed in on this job before (Other…), offered in the dropdown too.
  const usedTypes = Array.from(new Set(lines.map((l) => l.style ?? "").filter((t) => t && !WINDOW_TYPES.includes(t))));
  // The next window's color: like the last one on the list until you change it.
  const [lineColor, setLineColor] = useState<WindowColor | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const color: WindowColor = lineColor ?? lines[lines.length - 1]?.color ?? "Standard";

  const add = () =>
    start(async () => {
      setError(null);
      try {
        const r = await onAdd({ size, type, color, values });
        if (!r.ok) return setError(r.error);
        setSize("");
        setValues({});
        setOtherType(false);
        const added = r.lines.find((l) => !lines.some((x) => x.id === l.id)) ?? r.lines[r.lines.length - 1];
        if (added) onPick(added.id);
      } catch (e) {
        setError(actionMessage(e, "The window wasn't added"));
      }
    });

  return (
    <div className="space-y-1.5 text-xs">
      {lines.length ? (
        <div className="space-y-0.5">
          {lines.map((l, i) => {
            const on = l.id === value;
            const extra = details
              .map((d) => (d.kind === "yesno" ? (l.details[d.name] === "Yes" ? d.name : null) : l.details[d.name] ? `${d.name}: ${l.details[d.name]}` : null))
              .filter(Boolean);
            return (
              <div
                key={l.id}
                className={cn(
                  "group flex items-center gap-1.5 rounded-md px-1.5 py-1",
                  on ? "bg-blue-50 text-blue-900 ring-1 ring-inset ring-blue-200" : "hover:bg-slate-50",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => onPick(l.id)}
                  title={`Place ${l.name} (or press ${i + 1})`}
                >
                  <span
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded border text-[11px] font-semibold",
                      on ? "border-blue-400 bg-white" : "border-slate-300 text-slate-600",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="w-10 shrink-0 font-semibold tabular-nums">{sizeCode(l.widthIn, l.heightIn)}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {l.style ?? "Window"}
                    {extra.length ? <span className="text-slate-500"> · {extra.join(" · ")}</span> : null}
                  </span>
                  <span
                    className={cn("shrink-0 rounded-full px-1.5 text-[10px] font-medium", l.color === "Standard" ? "bg-slate-100 text-slate-600" : "bg-slate-900 text-white")}
                  >
                    {l.color}
                  </span>
                  <span className="w-6 shrink-0 text-right tabular-nums text-slate-500">{counts[l.id] ?? 0}</span>
                </button>
                {!compact && !(counts[l.id] ?? 0) ? (
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-slate-300 opacity-0 hover:text-slate-600 group-hover:opacity-100"
                    title="Take it off this job's list (it stays on the Item List)"
                    aria-label={`Take ${l.name} off the list`}
                    onClick={() => void onSet({ lines: lines.filter((x) => x.id !== l.id).map((x) => x.id) })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-slate-500">No windows on this job yet — add the first one below.</p>
      )}
      {!compact && lines.length < MAX_LINES ? (
        <div className="space-y-1.5 rounded-md border border-dashed border-slate-300 p-1.5">
          <div className="flex items-center gap-1.5">
            <input
              className="input !h-7 !w-16 !px-1.5 !py-0 text-xs"
              placeholder="3050"
              aria-label="Window size"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            {/* Every type in the dropdown; Other… to type one that isn't there. */}
            {otherType ? (
              <input
                className="input !h-7 min-w-0 flex-1 !px-1.5 !py-0 text-xs"
                aria-label="Window type"
                placeholder="Type it in"
                autoFocus
                value={type}
                onChange={(e) => setType(e.target.value)}
                onBlur={() => {
                  if (!type.trim()) {
                    setOtherType(false);
                    setType(WINDOW_TYPES[0]);
                  }
                }}
              />
            ) : (
              <select
                className="input !h-7 min-w-0 flex-1 !px-1 !py-0 text-xs"
                aria-label="Window type"
                value={type}
                onChange={(e) => {
                  if (e.target.value === OTHER) {
                    setOtherType(true);
                    setType("");
                  } else setType(e.target.value);
                }}
              >
                {WINDOW_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                {/* Types typed in before, so they're one pick away next time. */}
                {usedTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
                <option value={OTHER}>Other…</option>
              </select>
            )}
            <select
              className="input !h-7 !w-auto shrink-0 !px-1 !py-0 text-xs"
              aria-label="Window color"
              title={WINDOW_COLORS.find((c) => c.value === color)?.label}
              value={color}
              onChange={(e) => setLineColor(e.target.value as WindowColor)}
            >
              {WINDOW_COLORS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {details.map((d) => (
              <span key={d.name} className="group/detail inline-flex items-center gap-0.5">
                {d.kind === "yesno" ? (
                  <label className="flex items-center gap-1 text-slate-700">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-slate-300"
                      checked={values[d.name] === "Yes"}
                      onChange={(e) => setValues((v) => ({ ...v, [d.name]: e.target.checked ? "Yes" : "" }))}
                    />
                    {d.name}
                  </label>
                ) : (
                  <input
                    className="input !h-7 !w-28 !px-1.5 !py-0 text-xs"
                    placeholder={d.name}
                    aria-label={d.name}
                    value={values[d.name] ?? ""}
                    onChange={(e) => setValues((v) => ({ ...v, [d.name]: e.target.value }))}
                  />
                )}
                {onRemoveDetail ? (
                  <button
                    type="button"
                    className="rounded p-0.5 text-slate-300 hover:text-rose-600"
                    title={`Take ${d.name} off every window`}
                    aria-label={`Remove the ${d.name} detail`}
                    onClick={() => {
                      if (!window.confirm(`Take ${d.name} off every window? Windows already added keep it in their name.`)) return;
                      setValues((v) => {
                        const n = { ...v };
                        delete n[d.name];
                        return n;
                      });
                      void onRemoveDetail(d.name);
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            ))}
            {onAddDetail && !newDetail ? (
              <button
                type="button"
                className="text-blue-700 hover:underline"
                onClick={() => setNewDetail({ name: "", kind: "yesno" })}
                title="One more thing every window has (Grids, Glass…)"
              >
                + Add a detail
              </button>
            ) : null}
          </div>
          {newDetail && onAddDetail ? (
            <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 p-1.5">
              <input
                className="input !h-7 min-w-0 flex-1 !px-1.5 !py-0 text-xs"
                placeholder="Grids"
                aria-label="New detail name"
                autoFocus
                value={newDetail.name}
                onChange={(e) => setNewDetail({ ...newDetail, name: e.target.value })}
              />
              <select
                className="input !h-7 !w-auto !px-1 !py-0 text-xs"
                aria-label="Answered with"
                value={newDetail.kind}
                onChange={(e) => setNewDetail({ ...newDetail, kind: e.target.value })}
              >
                <option value="yesno">Yes / no</option>
                <option value="text">Typed in</option>
              </select>
              <button
                type="button"
                disabled={busy || !newDetail.name.trim()}
                className="rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
                onClick={() =>
                  start(async () => {
                    setError(null);
                    try {
                      const r = await onAddDetail(newDetail);
                      if (r.ok) setNewDetail(null);
                      else setError(r.error);
                    } catch (e) {
                      setError(actionMessage(e, "The detail wasn't added"));
                    }
                  })
                }
              >
                Add
              </button>
              <button type="button" className="text-slate-500 hover:text-slate-800" onClick={() => setNewDetail(null)}>
                Cancel
              </button>
              <p className="w-full text-[11px] text-slate-500">For every window from now on (Settings → Windows to change).</p>
            </div>
          ) : null}
          <button
            type="button"
            disabled={busy || !size.trim()}
            className="w-full rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
            onClick={add}
          >
            {busy ? "Adding…" : "Add window"}
          </button>
        </div>
      ) : null}
      {error ? <p className="text-rose-700">{error}</p> : null}
    </div>
  );
}

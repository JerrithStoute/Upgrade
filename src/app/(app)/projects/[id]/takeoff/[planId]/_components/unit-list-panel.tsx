"use client";

import { useState, useTransition } from "react";
import { Pencil, Settings2, X } from "lucide-react";
import Link from "@/components/link";
import { cn } from "@/lib/utils";
import { actionMessage } from "@/lib/action-message";
import { isBadge, lineSummary, sizeCode, usualValues, type UnitKind, type UnitPart } from "@/lib/unit-parts";
import { MAX_LINES } from "@/lib/window-list";
import { MAX_DOOR_LINES } from "@/lib/door-list";
import type { JobUnitLine } from "../../actions";

const ADD = "__add";

/**
 * The job's doors or windows, to pick from while counting: a short list, each line numbered — click it, or
 * press its number, then click the plan. New ones are added right here: the size, and a pick for each part
 * the company asks for (Catalog → Doors / Windows). Each part starts at its usual choice, and stays as you
 * leave it for the next one. "+ Add a choice…" puts a new one on the company's list for every job after.
 */
export function UnitListPanel({
  kind,
  parts,
  lines,
  counts,
  value,
  onPick,
  onAdd,
  onSet,
  onRemove,
  onAddChoice,
  compact,
}: {
  kind: UnitKind;
  parts: UnitPart[];
  lines: JobUnitLine[];
  /** How many of each are on the job (every sheet). */
  counts: Record<string, number>;
  value: string | null;
  onPick: (id: string) => void;
  onAdd: (u: {
    size: string;
    values: Record<string, string>;
    /** Editing a line: the one it was (its placed ones change with it). */
    replace?: string | null;
  }) => Promise<{ ok: true; lines: JobUnitLine[] } | { ok: false; error: string }>;
  onSet: (change: { lines?: string[] }) => Promise<unknown>;
  /** × on a line with some placed: asks, takes them off the plan, and the line off the list. */
  onRemove?: (line: JobUnitLine, placed: number) => void;
  /** A new choice on a part, for every job (the company's list); hands back the one to pick. */
  onAddChoice?: (key: string, value: string) => Promise<{ ok: true; value: string } | { ok: false; error: string }>;
  /** The selected one's panel: just the list, to switch it. */
  compact?: boolean;
}) {
  const noun = kind === "window" ? "window" : "door";
  const asked = parts.filter((p) => p.ask);
  const [size, setSize] = useState("");
  // The next one's picks: each part's usual choice until you change it, then as you left it.
  const [picks, setPicks] = useState<Record<string, string>>(() => usualValues(parts));
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  // ✎ on a line: the form below holds that one, to change (Slab → Prehung) — every one placed follows.
  const [editing, setEditing] = useState<{ line: JobUnitLine; picks: Record<string, string> } | null>(null);
  // "+ Add a choice…" open on a part.
  const [adding, setAdding] = useState<{ key: string; text: string } | null>(null);
  const shown = editing ? editing.picks : picks;
  const pickOf = (p: UnitPart) => shown[p.key] ?? p.usual;
  const setPick = (key: string, v: string) => (editing ? setEditing({ ...editing, picks: { ...editing.picks, [key]: v } }) : setPicks((x) => ({ ...x, [key]: v })));

  const startEdit = (l: JobUnitLine) => {
    setEditing({ line: l, picks: { ...usualValues(parts), ...l.values } });
    setError(null);
    setAdding(null);
    setSize(sizeCode(l.widthIn, l.heightIn));
  };
  const stopEdit = () => {
    setEditing(null);
    setSize("");
  };

  const add = () =>
    start(async () => {
      setError(null);
      try {
        const values = Object.fromEntries(asked.map((p) => [p.key, pickOf(p)]));
        const r = await onAdd({ size, values, replace: editing?.line.id ?? null });
        if (!r.ok) return setError(r.error);
        const was = editing?.line;
        stopEdit();
        // The changed line sits where the old one was.
        const added = was
          ? (r.lines[lines.findIndex((x) => x.id === was.id)] ?? r.lines[r.lines.length - 1])
          : (r.lines.find((l) => !lines.some((x) => x.id === l.id)) ?? r.lines[r.lines.length - 1]);
        if (added) onPick(added.id);
      } catch (e) {
        setError(actionMessage(e, editing ? `The ${noun} wasn't changed` : `The ${noun} wasn't added`));
      }
    });

  const addChoice = () => {
    if (!adding || !onAddChoice || !adding.text.trim()) return;
    const { key, text } = adding;
    start(async () => {
      setError(null);
      try {
        const r = await onAddChoice(key, text);
        if (!r.ok) return setError(r.error);
        setPick(key, r.value);
        setAdding(null);
      } catch (e) {
        setError(actionMessage(e, "The choice wasn't added"));
      }
    });
  };

  const field = "input !h-7 min-w-0 !px-1 !py-0 text-xs";
  const pickBox = (p: UnitPart, className?: string) =>
    adding?.key === p.key ? (
      <span className={cn("flex min-w-0 items-center gap-1", className)}>
        <input
          className="input !h-7 min-w-0 flex-1 !px-1.5 !py-0 text-xs"
          aria-label={`New ${p.name.toLowerCase()} choice`}
          placeholder={`New ${p.name.toLowerCase()}`}
          autoFocus
          maxLength={40}
          value={adding.text}
          onChange={(e) => setAdding({ ...adding, text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addChoice();
            } else if (e.key === "Escape") setAdding(null);
          }}
        />
        <button
          type="button"
          disabled={busy || !adding.text.trim()}
          className="rounded-md bg-slate-900 px-1.5 py-1 text-xs font-medium text-white disabled:opacity-40"
          onClick={addChoice}
        >
          Add
        </button>
        <button type="button" className="text-slate-400 hover:text-slate-700" aria-label="Cancel" onClick={() => setAdding(null)}>
          <X className="h-3.5 w-3.5" />
        </button>
      </span>
    ) : (
      <select
        className={cn(field, className)}
        aria-label={kind === "door" && p.key === "ext" ? "Interior or exterior" : `${kind === "window" ? "Window" : "Door"} ${p.name.toLowerCase()}`}
        value={pickOf(p)}
        onChange={(e) => (e.target.value === ADD ? setAdding({ key: p.key, text: "" }) : setPick(p.key, e.target.value))}
      >
        {p.usual === "" ? <option value="">—</option> : null}
        {p.choices.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        {onAddChoice && p.key !== "ext" ? <option value={ADD}>+ Add a choice…</option> : null}
      </select>
    );

  const ext = asked.find((p) => p.key === "ext");
  const type = asked.find((p) => p.key === "type");
  const others = asked.filter((p) => p !== ext && p !== type && p.kind === "pick");
  const yesNo = asked.filter((p) => p.kind === "yesno");
  const max = kind === "window" ? MAX_LINES : MAX_DOOR_LINES;

  return (
    <div className="space-y-1.5 text-xs">
      {lines.length ? (
        <div className="space-y-0.5">
          {lines.map((l, i) => {
            const on = l.id === value;
            const summary = lineSummary(parts, l.values) || l.name.replace(/^\S+\s*/, "") || (kind === "window" ? "Window" : "Door");
            const badge = asked.find((p) => isBadge(p) && l.values[p.key]);
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
                  <span className="min-w-0 flex-1 truncate">{summary}</span>
                  {badge ? (
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-1.5 text-[10px] font-medium",
                        l.values[badge.key] === badge.usual ? "bg-slate-100 text-slate-600" : "bg-slate-900 text-white",
                      )}
                    >
                      {l.values[badge.key]}
                    </span>
                  ) : null}
                  <span className="w-6 shrink-0 text-right tabular-nums text-slate-500">{counts[l.id] ?? 0}</span>
                </button>
                {!compact ? (
                  <>
                    <button
                      type="button"
                      className={cn("shrink-0 rounded p-0.5 hover:text-slate-700", editing?.line.id === l.id ? "text-blue-700" : "text-slate-400")}
                      title={`Change this ${noun} — every one placed on the job changes with it`}
                      aria-label={`Change ${l.name}`}
                      onClick={() => (editing?.line.id === l.id ? stopEdit() : startEdit(l))}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-600"
                      title={
                        (counts[l.id] ?? 0)
                          ? `Take it off the list — and its ${noun}s off the plan (asks first)`
                          : "Take it off this job's list (it stays on the Item List)"
                      }
                      aria-label={`Take ${l.name} off the list`}
                      onClick={() => {
                        if (editing?.line.id === l.id) stopEdit();
                        const placed = counts[l.id] ?? 0;
                        if (placed && onRemove) onRemove(l, placed);
                        else void onSet({ lines: lines.filter((x) => x.id !== l.id).map((x) => x.id) });
                      }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-slate-500">No {noun}s on this job yet — add the first one below.</p>
      )}
      {!compact && (editing || lines.length < max) ? (
        <div className={cn("space-y-1.5 rounded-md border p-1.5", editing ? "border-blue-300 bg-blue-50/40" : "border-dashed border-slate-300")}>
          {editing ? (
            <p className="text-[11px] font-medium text-blue-900">
              Changing {editing.line.name} — {counts[editing.line.id] ?? 0} placed on this job change with it.
            </p>
          ) : null}
          <div className="flex items-center gap-1.5">
            <input
              className="input !h-7 !w-16 !px-1.5 !py-0 text-xs"
              placeholder={kind === "window" ? "3050" : "2868"}
              aria-label={`${kind === "window" ? "Window" : "Door"} size`}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            {ext ? pickBox(ext, "!w-16") : null}
            {type ? pickBox(type, "flex-1") : null}
          </div>
          {others.length ? (
            <div className="grid grid-cols-2 gap-1.5 text-slate-600">
              {others.map((p) => (
                <label key={p.key} className={cn("flex min-w-0 items-center gap-1", adding?.key === p.key && "col-span-2")}>
                  <span className="shrink-0">{p.name}</span>
                  {pickBox(p, "flex-1")}
                </label>
              ))}
            </div>
          ) : null}
          {yesNo.length ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {yesNo.map((p) => (
                <label key={p.key} className="flex items-center gap-1 text-slate-700">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300"
                    checked={pickOf(p) === "Yes"}
                    onChange={(e) => setPick(p.key, e.target.checked ? "Yes" : "No")}
                  />
                  {p.name}
                </label>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy || !size.trim() || !!adding}
              className="flex-1 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
              onClick={add}
            >
              {busy ? (editing ? "Saving…" : "Adding…") : editing ? "Save changes" : `Add ${noun}`}
            </button>
            {editing ? (
              <button type="button" className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" onClick={stopEdit}>
                Cancel
              </button>
            ) : null}
            <a
              href={`/catalog/${noun}s`}
              target="_blank"
              rel="noreferrer"
              className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title={`What a ${noun} is described by — the parts and their choices (Catalog → ${kind === "window" ? "Windows" : "Doors"}, opens in a new tab)`}
              aria-label={`Set up ${noun}s`}
            >
              <Settings2 className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      ) : null}
      {error ? <p className="text-rose-700">{error}</p> : null}
    </div>
  );
}

/**
 * The job's door or window bid list: how many of each, the way they go out for prices — a column for each
 * part the company asks for. `others`: ones placed that aren't on the job's list (from before it).
 */
export function UnitBidList({
  kind,
  parts,
  lines,
  others,
  counts,
  bidsHref,
}: {
  kind: UnitKind;
  parts: UnitPart[];
  lines: JobUnitLine[];
  others: { id: string; name: string; widthIn: number; heightIn: number; exterior: boolean | null; style: string | null }[];
  counts: Record<string, number>;
  bidsHref: string;
}) {
  const noun = kind === "window" ? "window" : "door";
  const asked = parts.filter((p) => p.ask);
  const rows = [
    ...lines,
    ...others.map((o) => ({
      id: o.id,
      name: o.name,
      widthIn: o.widthIn,
      heightIn: o.heightIn,
      values: { ...(o.exterior == null ? {} : { ext: o.exterior ? "Ext" : "Int" }), type: o.style ?? o.name } as Record<string, string>,
    })),
  ].filter((r) => counts[r.id]);
  const total = rows.reduce((t, r) => t + (counts[r.id] ?? 0), 0);
  if (!rows.length) return <p className="text-xs text-slate-500">No {noun}s placed on this job yet.</p>;
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-1 pr-2 text-right font-medium">Qty</th>
              <th className="py-1 pr-2 font-medium">Size</th>
              {asked.map((p) => (
                <th key={p.key} className="py-1 pr-2 font-medium">
                  {p.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.id} title={r.name}>
                <td className="py-1 pr-2 text-right tabular-nums">{counts[r.id]}</td>
                <td className="py-1 pr-2 font-medium tabular-nums">{sizeCode(r.widthIn, r.heightIn)}</td>
                {asked.map((p) => (
                  <td key={p.key} className="py-1 pr-2">
                    {p.kind === "yesno" ? (r.values[p.key] === "Yes" ? "Yes" : "") : (r.values[p.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">
        {total} {noun}
        {total === 1 ? "" : "s"} on the job (every sheet). They go out like anything else:{" "}
        <Link href={bidsHref} className="font-medium text-blue-700 hover:underline">
          Send to vendors
        </Link>
        , and tick your {noun}s&apos; cost code.
      </p>
    </>
  );
}

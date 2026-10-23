"use client";

import { useState, useTransition } from "react";
import { Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { actionMessage } from "@/lib/action-message";
import { DOOR_CORES, DOOR_JAMBS, DOOR_TYPES, MAX_DOOR_LINES, sizeCode, type DoorCore, type DoorDetail, type DoorJamb } from "@/lib/door-list";
import type { JobDoorLine } from "../../actions";

const OTHER = "__other";

/**
 * The job's doors, to pick from while counting — like the window list: a short list (size, int / ext,
 * type, jamb, core, and the company's own details), each line numbered — click it, or press its number,
 * then click the plan. New doors are added right here; int / ext, jamb and core start as the last door on
 * the list was, and stay as you leave them.
 */
export function DoorListPanel({
  lines,
  details,
  counts,
  value,
  onPick,
  onAdd,
  onSet,
  onRemove,
  onAddDetail,
  onRemoveDetail,
  compact,
}: {
  lines: JobDoorLine[];
  details: DoorDetail[];
  /** How many of each are on the job (every sheet). */
  counts: Record<string, number>;
  value: string | null;
  onPick: (id: string) => void;
  onAdd: (d: {
    size: string;
    exterior: boolean;
    type: string;
    jamb: string;
    core: string;
    values: Record<string, string>;
    /** Editing a line: the door it was (its placed doors change with it). */
    replace?: string | null;
  }) => Promise<{ ok: true; lines: JobDoorLine[] } | { ok: false; error: string }>;
  onSet: (change: { lines?: string[] }) => Promise<unknown>;
  /** × on a line with doors placed: asks, takes them off the plan, and the line off the list. */
  onRemove?: (line: JobDoorLine, placed: number) => void;
  /** A new detail for every door (the company's list); hands back the list. */
  onAddDetail?: (d: { name: string; kind: string }) => Promise<{ ok: true; details: DoorDetail[] } | { ok: false; error: string }>;
  /** Takes a detail off every door (the company's list). */
  onRemoveDetail?: (name: string) => Promise<unknown>;
  /** The selected door's panel: just the list, to switch it. */
  compact?: boolean;
}) {
  const last = lines[lines.length - 1];
  const [size, setSize] = useState("");
  const [type, setType] = useState(DOOR_TYPES[0]);
  const [otherType, setOtherType] = useState(false);
  // The next door's int / ext, jamb and core: like the last one on the list until you change them.
  const [pickExt, setPickExt] = useState<boolean | null>(null);
  const [pickJamb, setPickJamb] = useState<DoorJamb | null>(null);
  const [pickCore, setPickCore] = useState<DoorCore | null>(null);
  const exterior = pickExt ?? last?.exterior ?? false;
  const jamb = pickJamb ?? last?.jamb ?? "2x4";
  const core = pickCore ?? last?.core ?? "Hollow";
  const [newDetail, setNewDetail] = useState<{ name: string; kind: string } | null>(null);
  // Types typed in on this job before (Other…), offered in the dropdown too.
  const usedTypes = Array.from(new Set(lines.map((l) => l.style ?? "").filter((t) => t && !DOOR_TYPES.includes(t))));
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  // ✎ on a line: the form below holds that door, to change (Slab → Prehung) — every one placed follows.
  const [editing, setEditing] = useState<JobDoorLine | null>(null);

  const startEdit = (l: JobDoorLine) => {
    setEditing(l);
    setError(null);
    setSize(sizeCode(l.widthIn, l.heightIn));
    const t = l.style ?? DOOR_TYPES[0];
    setType(t);
    setOtherType(!DOOR_TYPES.includes(t) && !usedTypes.includes(t));
    setPickExt(l.exterior);
    setPickJamb(l.jamb);
    setPickCore(l.core);
    setValues({ ...l.details });
  };
  const stopEdit = () => {
    setEditing(null);
    setSize("");
    setValues({});
    setOtherType(false);
    setType(DOOR_TYPES[0]);
  };

  const add = () =>
    start(async () => {
      setError(null);
      try {
        const r = await onAdd({ size, exterior, type, jamb, core, values, replace: editing?.id ?? null });
        if (!r.ok) return setError(r.error);
        const was = editing;
        stopEdit();
        // The changed line sits where the old one was.
        const added = was
          ? (r.lines[lines.findIndex((x) => x.id === was.id)] ?? r.lines[r.lines.length - 1])
          : (r.lines.find((l) => !lines.some((x) => x.id === l.id)) ?? r.lines[r.lines.length - 1]);
        if (added) onPick(added.id);
      } catch (e) {
        setError(actionMessage(e, editing ? "The door wasn't changed" : "The door wasn't added"));
      }
    });

  const pick = "input !h-7 min-w-0 !px-1 !py-0 text-xs";
  return (
    <div className="space-y-1.5 text-xs">
      {lines.length ? (
        <div className="space-y-0.5">
          {lines.map((l, i) => {
            const on = l.id === value;
            const extra = details
              .map((d) => (d.kind === "yesno" ? (l.details[d.name] === "Yes" ? d.name : null) : l.details[d.name] ? `${d.name} ${l.details[d.name]}` : null))
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
                    {l.style ?? "Door"}
                    <span className="text-slate-500">
                      {" "}
                      · {l.core} · {l.jamb}
                      {extra.length ? ` · ${extra.join(" · ")}` : ""}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 text-[10px] font-medium",
                      l.exterior ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600",
                    )}
                  >
                    {l.exterior ? "Ext" : "Int"}
                  </span>
                  <span className="w-6 shrink-0 text-right tabular-nums text-slate-500">{counts[l.id] ?? 0}</span>
                </button>
                {!compact ? (
                  <>
                    <button
                      type="button"
                      className={cn("shrink-0 rounded p-0.5 hover:text-slate-700", editing?.id === l.id ? "text-blue-700" : "text-slate-400")}
                      title="Change this door — every one placed on the job changes with it"
                      aria-label={`Change ${l.name}`}
                      onClick={() => (editing?.id === l.id ? stopEdit() : startEdit(l))}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-600"
                      title={
                        (counts[l.id] ?? 0)
                          ? "Take it off the list — and its doors off the plan (asks first)"
                          : "Take it off this job's list (it stays on the Item List)"
                      }
                      aria-label={`Take ${l.name} off the list`}
                      onClick={() => {
                        if (editing?.id === l.id) stopEdit();
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
        <p className="text-slate-500">No doors on this job yet — add the first one below.</p>
      )}
      {!compact && (editing || lines.length < MAX_DOOR_LINES) ? (
        <div className={cn("space-y-1.5 rounded-md border p-1.5", editing ? "border-blue-300 bg-blue-50/40" : "border-dashed border-slate-300")}>
          {editing ? (
            <p className="text-[11px] font-medium text-blue-900">
              Changing {editing.name} — {counts[editing.id] ?? 0} placed on this job change with it.
            </p>
          ) : null}
          <div className="flex items-center gap-1.5">
            <input
              className="input !h-7 !w-16 !px-1.5 !py-0 text-xs"
              placeholder="2868"
              aria-label="Door size"
              value={size}
              onChange={(e) => setSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add();
                }
              }}
            />
            <select
              className={cn(pick, "!w-16")}
              aria-label="Interior or exterior"
              value={exterior ? "ext" : "int"}
              onChange={(e) => setPickExt(e.target.value === "ext")}
            >
              <option value="int">Int</option>
              <option value="ext">Ext</option>
            </select>
            {/* Every type in the dropdown; Other… to type one that isn't there. */}
            {otherType ? (
              <input
                className="input !h-7 min-w-0 flex-1 !px-1.5 !py-0 text-xs"
                aria-label="Door type"
                placeholder="Type it in"
                autoFocus
                value={type}
                onChange={(e) => setType(e.target.value)}
                onBlur={() => {
                  if (!type.trim()) {
                    setOtherType(false);
                    setType(DOOR_TYPES[0]);
                  }
                }}
              />
            ) : (
              <select
                className={cn(pick, "flex-1")}
                aria-label="Door type"
                value={type}
                onChange={(e) => {
                  if (e.target.value === OTHER) {
                    setOtherType(true);
                    setType("");
                  } else setType(e.target.value);
                }}
              >
                {DOOR_TYPES.map((t) => (
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
          </div>
          <div className="flex items-center gap-1.5 text-slate-600">
            <label className="flex flex-1 items-center gap-1">
              Jamb
              <select className={cn(pick, "flex-1")} aria-label="Jamb width" value={jamb} onChange={(e) => setPickJamb(e.target.value as DoorJamb)}>
                {DOOR_JAMBS.map((j) => (
                  <option key={j} value={j}>
                    {j}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-1 items-center gap-1">
              Core
              <select className={cn(pick, "flex-1")} aria-label="Hollow or solid core" value={core} onChange={(e) => setPickCore(e.target.value as DoorCore)}>
                {DOOR_CORES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {details.map((d) => (
              <span key={d.name} className="inline-flex items-center gap-0.5">
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
                    title={`Take ${d.name} off every door`}
                    aria-label={`Remove the ${d.name} detail`}
                    onClick={() => {
                      if (!window.confirm(`Take ${d.name} off every door? Doors already added keep it in their name.`)) return;
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
                onClick={() => setNewDetail({ name: "", kind: "text" })}
                title="One more thing every door has (Door Swing…)"
              >
                + Add a detail
              </button>
            ) : null}
          </div>
          {newDetail && onAddDetail ? (
            <div className="flex flex-wrap items-center gap-1.5 rounded-md bg-slate-50 p-1.5">
              <input
                className="input !h-7 min-w-0 flex-1 !px-1.5 !py-0 text-xs"
                placeholder="Door Swing"
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
                <option value="text">Typed in</option>
                <option value="yesno">Yes / no</option>
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
              <p className="w-full text-[11px] text-slate-500">For every door from now on (Settings → Doors to change).</p>
            </div>
          ) : null}
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={busy || !size.trim()}
              className="flex-1 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
              onClick={add}
            >
              {busy ? (editing ? "Saving…" : "Adding…") : editing ? "Save changes" : "Add door"}
            </button>
            {editing ? (
              <button type="button" className="rounded-md px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" onClick={stopEdit}>
                Cancel
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      {error ? <p className="text-rose-700">{error}</p> : null}
    </div>
  );
}

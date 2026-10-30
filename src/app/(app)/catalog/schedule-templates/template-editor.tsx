"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical, Plus, Trash2, X } from "lucide-react";
import { ColorSwatches } from "@/components/ui/color-swatches";
import { PhasePicker } from "@/components/ui/phase-picker";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { saveScheduleTemplate } from "./actions";

export type EditorTask = {
  key: string;
  name: string;
  phase: string;
  duration: number;
  isMilestone: boolean;
  color: string;
  assigneeId: string | null;
  links: { key: string; lag: number }[];
};

let seq = 0;
const newKey = () => `n${Date.now().toString(36)}${++seq}`;

/**
 * A schedule template's tasks, in order: each with its length in workdays and what it waits
 * on (several, each with lag). Saved all at once.
 */
export function TemplateEditor({ id, name: initialName, tasks: initial, staff }: { id: string; name: string; tasks: EditorTask[]; staff: { id: string; name: string }[] }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [tasks, setTasks] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  // Dragging a task to a new place: which one, and where it would land.
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dropAt, setDropAt] = useState<{ key: string; after: boolean } | null>(null);
  const edit = (next: EditorTask[]) => {
    setTasks(next);
    setDirty(true);
  };
  const set = (key: string, patch: Partial<EditorTask>) => edit(tasks.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  /** A new task at `at` (the end by default): in the phase of the one above it, waiting on it — the usual case; change it if not. */
  const add = (at = tasks.length) => {
    const prev = tasks[at - 1] ?? tasks[at];
    const waitsOn = tasks[at - 1];
    const fresh: EditorTask = {
      key: newKey(),
      name: "",
      phase: prev?.phase ?? "Pre-Construction",
      duration: 1,
      isMilestone: false,
      color: prev?.color ?? "#2563eb",
      assigneeId: null,
      links: waitsOn ? [{ key: waitsOn.key, lag: 0 }] : [],
    };
    edit([...tasks.slice(0, at), fresh, ...tasks.slice(at)]);
    // Straight into its name box.
    requestAnimationFrame(() => document.querySelector<HTMLInputElement>(`[data-task-name="${fresh.key}"]`)?.focus());
  };
  // The + in the margin: follows the mouse to the gap between tasks (the row it goes before), and its height.
  const area = useRef<HTMLDivElement>(null);
  const [gap, setGap] = useState<{ at: number; top: number } | null>(null);
  /** Puts `key` just before or after `target`. */
  const place = (key: string, target: string, after: boolean) => {
    if (key === target) return;
    const next = tasks.filter((t) => t.key !== key);
    const at = next.findIndex((t) => t.key === target) + (after ? 1 : 0);
    next.splice(
      at,
      0,
      tasks.find((t) => t.key === key)!,
    );
    edit(next);
  };
  const endDrag = () => {
    setDragKey(null);
    setDropAt(null);
  };
  const remove = (key: string) => edit(tasks.filter((t) => t.key !== key).map((t) => ({ ...t, links: t.links.filter((l) => l.key !== key) })));
  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveScheduleTemplate(id, { name, tasks });
      if (!r.ok) return setError(r.error);
      setDirty(false);
      router.refresh();
    });
  // Your own phases (beyond the standard ones) show in every task's phase list.
  const phases = Array.from(new Set(tasks.map((t) => t.phase)));
  const label = (key: string) => {
    const i = tasks.findIndex((t) => t.key === key);
    return i === -1 ? "?" : `${i + 1}. ${tasks[i].name || "(unnamed)"}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input !w-80 font-semibold"
          value={name}
          aria-label="Template name"
          onChange={(e) => {
            setName(e.target.value);
            setDirty(true);
          }}
        />
        <span className="text-xs text-slate-500">
          {tasks.length} task{tasks.length === 1 ? "" : "s"} · {tasks.reduce((n, t) => n + (t.isMilestone ? 0 : t.duration), 0)} workdays of work (before overlaps)
        </span>
        <span className="ml-auto flex items-center gap-2">
          {error ? <span className="text-sm text-rose-700">{error}</span> : dirty ? <span className="text-xs text-amber-700">Not saved yet</span> : null}
          <Button type="button" onClick={save} disabled={saving || !dirty}>
            {saving ? "Saving…" : "Save template"}
          </Button>
        </span>
      </div>

      {/* The + rides in the left margin, outside the scrolling table, so it isn't cut off. */}
      <div
        ref={area}
        className="relative"
        onMouseMove={(e) => {
          if (dragKey || !area.current) return;
          if (e.target instanceof Element && e.target.closest("[data-insert-plus]")) return;
          const row = e.target instanceof Element ? e.target.closest<HTMLElement>("tr[data-row]") : null;
          if (!row) return setGap(null);
          const r = row.getBoundingClientRect();
          const after = e.clientY > r.top + r.height / 2;
          const at = Number(row.dataset.row) + (after ? 1 : 0);
          const top = (after ? r.bottom : r.top) - area.current.getBoundingClientRect().top;
          if (!gap || gap.at !== at || Math.abs(gap.top - top) > 1) setGap({ at, top });
        }}
        onMouseLeave={() => setGap(null)}
      >
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-12 px-2 py-2" />
                <th className="px-2 py-2 font-medium">Task</th>
                <th className="w-44 px-2 py-2 font-medium">Phase</th>
                <th className="w-24 px-2 py-2 text-right font-medium">Workdays</th>
                <th className="px-2 py-2 font-medium">Waits on (then lag, workdays)</th>
                <th className="w-40 px-2 py-2 font-medium">Default person</th>
                <th className="w-12 px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4 text-center text-slate-500">
                    No tasks yet — add the first one below.
                  </td>
                </tr>
              ) : null}
              {tasks.map((t, i) => (
                <tr
                  key={t.key}
                  data-row={i}
                  className={cn(
                    "align-top",
                    dragKey === t.key && "opacity-40",
                    // Where it lands: a line above or below this row (no layout shift).
                    dropAt?.key === t.key && (dropAt.after ? "shadow-[inset_0_-2px_0_0_#2563eb]" : "shadow-[inset_0_2px_0_0_#2563eb]"),
                  )}
                  onDragOver={(e) => {
                    if (!dragKey || dragKey === t.key) return;
                    e.preventDefault();
                    const r = e.currentTarget.getBoundingClientRect();
                    const after = e.clientY > r.top + r.height / 2;
                    if (dropAt?.key !== t.key || dropAt.after !== after) setDropAt({ key: t.key, after });
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragKey && dropAt) place(dragKey, dropAt.key, dropAt.after);
                    endDrag();
                  }}
                >
                  <td className="px-1 py-2">
                    {/* Drag to move it (or Alt + ↑ / ↓). */}
                    <span
                      draggable
                      tabIndex={0}
                      role="button"
                      aria-label={`Move ${t.name || "task"} — drag, or Alt + up / down`}
                      title="Drag to move (or Alt + ↑ / ↓)"
                      onDragStart={(e) => {
                        setDragKey(t.key);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", t.key);
                        const row = e.currentTarget.closest("tr");
                        if (row) e.dataTransfer.setDragImage(row, 16, 16);
                      }}
                      onDragEnd={endDrag}
                      onKeyDown={(e) => {
                        if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
                        e.preventDefault();
                        const j = i + (e.key === "ArrowUp" ? -1 : 1);
                        if (j < 0 || j >= tasks.length) return;
                        place(t.key, tasks[j].key, e.key === "ArrowDown");
                        const key = t.key;
                        requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-grip="${key}"]`)?.focus());
                      }}
                      data-grip={t.key}
                      className="flex cursor-grab items-center gap-0.5 rounded text-xs tabular-nums text-slate-400 hover:text-slate-700 active:cursor-grabbing"
                    >
                      <GripVertical className="h-3.5 w-3.5" />
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      <ColorSwatches value={t.color} onChange={(c) => set(t.key, { color: c })} label="Bar color" />
                      <input
                        className="input !h-8 !py-0"
                        value={t.name}
                        placeholder="e.g. Pour slab"
                        aria-label="Task name"
                        data-task-name={t.key}
                        onChange={(e) => set(t.key, { name: e.target.value })}
                      />
                    </div>
                    <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={t.isMilestone}
                        onChange={(e) => set(t.key, { isMilestone: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />{" "}
                      Milestone (one day)
                    </label>
                  </td>
                  <td className="px-2 py-1.5">
                    <PhasePicker className="input !h-8 !py-0" value={t.phase} extra={phases} onChange={(phase) => set(t.key, { phase })} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input
                      type="number"
                      min={1}
                      max={999}
                      className="input !h-8 !py-0 text-right"
                      value={t.isMilestone ? 1 : t.duration}
                      disabled={t.isMilestone}
                      aria-label="Workdays"
                      onChange={(e) => set(t.key, { duration: Math.max(1, Math.round(Number(e.target.value) || 1)) })}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="space-y-1">
                      {t.links.map((l, j) => (
                        <div key={j} className="flex items-center gap-1.5">
                          <select
                            className="input !h-8 !py-0 min-w-0 flex-1 text-xs"
                            value={l.key}
                            aria-label="Waits on"
                            onChange={(e) => set(t.key, { links: t.links.map((x, k) => (k === j ? { ...x, key: e.target.value } : x)) })}
                          >
                            {tasks
                              .filter((o) => o.key !== t.key && (o.key === l.key || !t.links.some((x) => x.key === o.key)))
                              .map((o) => (
                                <option key={o.key} value={o.key}>
                                  {label(o.key)}
                                </option>
                              ))}
                          </select>
                          <input
                            type="number"
                            min={0}
                            max={365}
                            className="input !h-8 !w-14 !py-0 text-right text-xs"
                            value={l.lag}
                            aria-label="Lag workdays"
                            onChange={(e) => set(t.key, { links: t.links.map((x, k) => (k === j ? { ...x, lag: Math.max(0, Math.round(Number(e.target.value) || 0)) } : x)) })}
                          />
                          <button
                            type="button"
                            className="rounded p-1 text-slate-400 hover:text-slate-700"
                            aria-label="Remove"
                            onClick={() => set(t.key, { links: t.links.filter((_, k) => k !== j) })}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {tasks.some((o) => o.key !== t.key && !t.links.some((x) => x.key === o.key)) ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                          onClick={() => {
                            const first = tasks.find((o) => o.key !== t.key && !t.links.some((x) => x.key === o.key));
                            if (first) set(t.key, { links: [...t.links, { key: first.key, lag: 0 }] });
                          }}
                        >
                          <Plus className="h-3 w-3" /> {t.links.length ? "Also waits on" : "Waits on"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <select
                      className="input !h-8 !py-0 text-xs"
                      value={t.assigneeId ?? ""}
                      aria-label="Default person"
                      onChange={(e) => set(t.key, { assigneeId: e.target.value || null })}
                    >
                      <option value="">—</option>
                      {staff.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    <span className="inline-flex">
                      <button
                        type="button"
                        onClick={() => remove(t.key)}
                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-700"
                        aria-label={`Remove ${t.name || "task"}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {gap ? (
          <>
            <div className="pointer-events-none absolute inset-x-0 z-10 h-px -translate-y-px border-t border-dashed border-blue-400" style={{ top: gap.top }} />
            <div data-insert-plus className="absolute -left-3.5 z-20 -translate-y-1/2" style={{ top: gap.top }}>
              <button
                type="button"
                onClick={() => {
                  add(gap.at);
                  setGap(null);
                }}
                title={gap.at >= tasks.length ? "Add a task at the end" : `Insert a task above ${tasks[gap.at].name || "this one"}`}
                aria-label={gap.at >= tasks.length ? "Add a task at the end" : `Insert a task above ${tasks[gap.at].name || "this one"}`}
                className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-white shadow-md ring-2 ring-white hover:bg-blue-700"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </>
        ) : null}
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={() => add()}>
        <Plus className="h-3.5 w-3.5" /> Add task
      </Button>
    </div>
  );
}

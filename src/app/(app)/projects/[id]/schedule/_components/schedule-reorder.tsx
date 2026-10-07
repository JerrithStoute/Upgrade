"use client";

import { useRef, useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { moveTask } from "../actions";

/**
 * Drag a task to a new place in the job's schedule (Gantt or list). Rows mark themselves
 * with data-drop-task and their grips with data-drag-task; this listens around them. Dropped
 * beside a task in another phase, it joins that phase. A blue line shows where it lands.
 *
 * A + in the left margin follows the mouse to the gap between tasks: click it to insert a
 * task right there (`insertBase` + insert=<task>&at=above|below + `insertTail` is the link).
 */
export function ScheduleReorder({
  projectId,
  insertBase,
  insertTail = "",
  children,
}: {
  projectId: string;
  /** The schedule's link with "?" — inserting adds insert=<task>&at=above|below. */
  insertBase?: string;
  insertTail?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean; top: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  // The + in the margin: the gap the mouse is nearest (above or below which task) and its height.
  const [gap, setGap] = useState<{ id: string; after: boolean; top: number; name: string } | null>(null);

  const rowOf = (el: EventTarget | null) => (el instanceof Element ? el.closest<HTMLElement>("[data-drop-task]") : null);
  const finish = () => {
    setDrag(null);
    setDrop(null);
  };

  return (
    <div
      ref={box}
      className="relative"
      onMouseMove={(e) => {
        if (!insertBase || drag || !box.current) return;
        // Over the + itself: keep it where it is.
        if (e.target instanceof Element && e.target.closest("[data-insert-plus]")) return;
        const row = rowOf(e.target);
        if (!row) return setGap(null);
        const r = row.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        const top = (after ? r.bottom : r.top) - box.current.getBoundingClientRect().top;
        if (!gap || gap.id !== row.dataset.dropTask || gap.after !== after) setGap({ id: row.dataset.dropTask!, after, top, name: row.dataset.taskName ?? "this task" });
      }}
      onMouseLeave={() => setGap(null)}
      onDragStart={(e) => {
        setGap(null);
        const grip = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-drag-task]") : null;
        if (!grip) return;
        setDrag(grip.dataset.dragTask!);
        setError(null);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", grip.dataset.dragTask!);
        const row = rowOf(grip);
        if (row) e.dataTransfer.setDragImage(row, 16, 16);
      }}
      onDragOver={(e) => {
        const row = rowOf(e.target);
        if (!drag || !row || row.dataset.dropTask === drag || !box.current) return;
        e.preventDefault();
        const r = row.getBoundingClientRect();
        const after = e.clientY > r.top + r.height / 2;
        const top = (after ? r.bottom : r.top) - box.current.getBoundingClientRect().top;
        if (!drop || drop.id !== row.dataset.dropTask || drop.after !== after) setDrop({ id: row.dataset.dropTask!, after, top });
      }}
      onDrop={(e) => {
        e.preventDefault();
        const moving = drag;
        const target = drop;
        finish();
        if (!moving || !target) return;
        start(async () => {
          const r = await moveTask(projectId, moving, target.id, target.after);
          if (!r.ok) setError(r.error);
          router.refresh();
        });
      }}
      onDragEnd={finish}
    >
      {children}
      {gap && insertBase ? (
        // In the margin, on the line between two tasks; the line shows across while you're on it.
        <div data-insert-plus className="group/plus absolute -left-3.5 z-20 flex -translate-y-1/2 items-center" style={{ top: gap.top }}>
          <button
            type="button"
            onClick={() => router.push(`${insertBase}insert=${gap.id}&at=${gap.after ? "below" : "above"}${insertTail}`)}
            title={`Insert a task ${gap.after ? "below" : "above"} ${gap.name}`}
            aria-label={`Insert a task ${gap.after ? "below" : "above"} ${gap.name}`}
            className="grid h-6 w-6 place-items-center rounded-full bg-blue-600 text-white shadow-md ring-2 ring-white hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      {gap && insertBase ? (
        <div className="pointer-events-none absolute inset-x-0 z-10 h-px -translate-y-px border-t border-dashed border-blue-400" style={{ top: gap.top }} />
      ) : null}
      {/* Where it lands — over the rows, so nothing shifts. */}
      {drop ? <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 -translate-y-px rounded bg-blue-600" style={{ top: drop.top }} /> : null}
      {busy ? <div className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-slate-900/80 px-2 py-0.5 text-xs text-white">Moving…</div> : null}
      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}

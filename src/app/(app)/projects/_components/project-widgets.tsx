"use client";

import { useState } from "react";
import Link from "@/components/link";
import { ChevronDown, GripVertical, Hammer, Home, KeyRound, List, Map as MapIcon, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROJECTS_COOKIE } from "@/lib/projects-view";

const ICONS = { spec: KeyRound, custom: Home, remodel: Hammer, all: List, map: MapIcon } as const;

export type Widget = { key: keyof typeof ICONS; title: string; count: number; total: string; newHref?: string; newLabel?: string; body: React.ReactNode };

/** Remembered in this browser: the widgets' order and which are tucked away. */
function remember(order: string[], collapsed: string[]) {
  document.cookie = `${PROJECTS_COOKIE}=${encodeURIComponent(JSON.stringify({ order, collapsed }))}; path=/; max-age=31536000; samesite=lax`;
}

/**
 * The Projects page's widgets — Spec homes, Custom homes, Remodels, All projects — one under
 * another, each the full table. Drag one by its grip to move it; the arrow tucks it away.
 */
export function ProjectWidgets({ widgets, order: initialOrder, collapsed: initialCollapsed }: { widgets: Widget[]; order: string[]; collapsed: string[] }) {
  const [order, setOrder] = useState(initialOrder);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [armed, setArmed] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<{ key: string; after: boolean } | null>(null);
  const byKey = new Map(widgets.map((w) => [w.key as string, w]));
  const shown = order.filter((k) => byKey.has(k));

  const finish = () => {
    setArmed(null);
    setDrag(null);
    setOver(null);
  };
  const drop = () => {
    if (drag && over && drag !== over.key) {
      const rest = shown.filter((k) => k !== drag);
      const at = rest.indexOf(over.key) + (over.after ? 1 : 0);
      rest.splice(at, 0, drag);
      setOrder(rest);
      remember(rest, collapsed);
    }
    finish();
  };
  const toggle = (k: string) => {
    const next = collapsed.includes(k) ? collapsed.filter((x) => x !== k) : [...collapsed, k];
    setCollapsed(next);
    remember(shown, next);
  };

  return (
    <div className="space-y-4" onDragEnd={finish}>
      {shown.map((k) => {
        const w = byKey.get(k)!;
        const Icon = ICONS[w.key];
        const isOpen = !collapsed.includes(k);
        return (
          <section
            key={k}
            draggable={armed === k}
            onDragStart={(e) => {
              setDrag(k);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", k);
            }}
            onDragOver={(e) => {
              if (!drag) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              const after = e.clientY > r.top + r.height / 2;
              if (!over || over.key !== k || over.after !== after) setOver({ key: k, after });
            }}
            onDrop={(e) => {
              e.preventDefault();
              drop();
            }}
            className={cn("relative overflow-visible rounded-xl border border-slate-200 bg-white shadow-sm", drag === k && "opacity-40")}
          >
            {drag && over?.key === k && drag !== k ? (
              <span className={cn("absolute left-0 right-0 h-1 rounded bg-blue-500", over.after ? "-bottom-2.5" : "-top-2.5")} aria-hidden />
            ) : null}
            <header className={cn("flex items-center gap-2 px-3 py-2", isOpen && "border-b border-slate-100")}>
              <button
                type="button"
                onMouseDown={() => setArmed(k)}
                onMouseUp={() => !drag && setArmed(null)}
                className="cursor-grab rounded-md p-1 text-slate-300 hover:bg-slate-100 hover:text-slate-600 active:cursor-grabbing"
                title={`Drag to move ${w.title}`}
                aria-label={`Move ${w.title}`}
              >
                <GripVertical className="h-4 w-4" />
              </button>
              <Icon className="h-4 w-4 shrink-0 text-slate-400" />
              <button type="button" onClick={() => toggle(k)} className="flex min-w-0 flex-1 items-baseline gap-2 text-left" aria-expanded={isOpen}>
                <h2 className="text-sm font-semibold text-slate-900">{w.title}</h2>
                <span className="text-xs text-slate-500">
                  {w.count} · {w.total}
                </span>
              </button>
              {w.newHref ? (
                <Link href={w.newHref} className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50" title={w.newLabel}>
                  <Plus className="h-3.5 w-3.5" /> New
                </Link>
              ) : null}
              <button
                type="button"
                onClick={() => toggle(k)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                aria-label={isOpen ? `Tuck away ${w.title}` : `Open ${w.title}`}
                title={isOpen ? "Tuck away" : "Open"}
              >
                <ChevronDown className={cn("h-4 w-4 transition-transform", !isOpen && "-rotate-90")} />
              </button>
            </header>
            {isOpen ? w.body : null}
          </section>
        );
      })}
    </div>
  );
}

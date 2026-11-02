"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/components/link";
import {
  BrickWall,
  ChevronDown,
  CircleDot,
  DoorOpen,
  Grid2x2,
  Library,
  PanelTop,
  Pentagon,
  Plus,
  RectangleHorizontal,
  Rows3,
  Spline,
  Triangle,
  type LucideIcon,
} from "lucide-react";
import { buttonClasses } from "@/components/ui";
import { CONDITION_TYPE_LABELS, type ConditionType } from "@/lib/takeoff";

/** The menu's types: everyday, walls and openings, then lumber. */
const GROUPS: ConditionType[][] = [
  ["AREA", "LINEAR", "COUNT"],
  ["WALL", "DOOR", "WINDOW", "OPENING"],
  ["FRAMING", "HIP_VALLEY", "BEAM"],
];

/** A small picture for each type. */
const ICONS: Record<ConditionType, LucideIcon> = {
  AREA: Pentagon,
  LINEAR: Spline,
  COUNT: CircleDot,
  WALL: BrickWall,
  DOOR: DoorOpen,
  WINDOW: Grid2x2,
  OPENING: PanelTop,
  FRAMING: Rows3,
  HIP_VALLEY: Triangle,
  BEAM: RectangleHorizontal,
};

/**
 * New takeoff ▾ at the top of the takeoff list: pick its type and the New takeoff
 * panel opens set to it — or pull one from your Library.
 */
export function NewTakeoffMenu({ hrefFor, onLibrary, libraryCount }: { hrefFor: (type: ConditionType) => string; onLibrary: () => void; libraryCount: number }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // A click anywhere else, or Esc, closes it.
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative shrink-0">
      <button type="button" aria-haspopup="menu" aria-expanded={open} className={buttonClasses("primary", "xs")} onClick={() => setOpen((o) => !o)}>
        <Plus className="h-3.5 w-3.5" /> New takeoff <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div role="menu" aria-label="New takeoff" className="absolute right-0 top-full z-40 mt-1 w-52 rounded-lg border border-slate-200 bg-white p-1 text-xs shadow-xl">
          {GROUPS.map((group, k) => (
            <div key={k} className={k ? "mt-1 border-t border-slate-100 pt-1" : undefined}>
              {group.map((t) => {
                const Icon = ICONS[t];
                return (
                <Link
                  key={t}
                  role="menuitem"
                  href={hrefFor(t)}
                  scroll={false}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 rounded px-2.5 py-1.5 text-slate-800 hover:bg-blue-50 hover:text-blue-900"
                >
                  <Icon className="h-3.5 w-3.5 text-slate-400" /> {CONDITION_TYPE_LABELS[t]}
                </Link>
                );
              })}
            </div>
          ))}
          <div className="mt-1 border-t border-slate-100 pt-1">
            <button
              type="button"
              role="menuitem"
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-slate-800 hover:bg-blue-50 hover:text-blue-900"
              onClick={() => {
                setOpen(false);
                onLibrary();
              }}
            >
              <Library className="h-3.5 w-3.5 text-slate-400" /> From your Library…{libraryCount ? <span className="ml-auto text-slate-400">{libraryCount}</span> : null}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

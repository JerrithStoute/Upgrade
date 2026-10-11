"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { moveCard, type Layout, type Spot } from "@/lib/dashboard-cards";
import { saveDashboardLayout } from "./actions";

/**
 * The Dashboard's cards where you put them: a full-width band across the top, then three
 * columns that each stack their cards with no gaps. Grab a card by its grip (top right, on
 * hover) and drop it anywhere — it's saved as soon as you let go.
 */
export function DashboardBoard({ layout: initial, cards, titles }: { layout: Layout; cards: Record<string, React.ReactNode>; titles: Record<string, string> }) {
  const [layout, setLayout] = useState(initial);
  const [armed, setArmed] = useState<string | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [, start] = useTransition();
  const router = useRouter();
  const zones = useRef(new Map<string, HTMLDivElement>());

  const finish = () => {
    setArmed(null);
    setDrag(null);
    setSpot(null);
  };
  const drop = () => {
    if (drag && spot) {
      const next = moveCard(layout, drag, spot);
      setLayout(next);
      // Saved, then the page re-reads it — so Customize and Reset start from where the cards are now.
      start(async () => {
        await saveDashboardLayout(next);
        router.refresh();
      });
    }
    finish();
  };
  // Where in a zone the pointer is: before the first card whose middle is below it.
  const spotIn = (zone: Spot["zone"], y: number): Spot => {
    const el = zones.current.get(String(zone));
    const kids = el ? [...el.querySelectorAll<HTMLElement>(":scope > [data-card]")] : [];
    const index = kids.findIndex((k) => {
      const r = k.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    return { zone, index: index < 0 ? kids.length : index };
  };

  const zone = (z: Spot["zone"], keys: string[], className: string, empty: string) => (
    <div
      ref={(el) => {
        if (el) zones.current.set(String(z), el);
      }}
      className={cn(
        className,
        drag && !keys.length && "min-h-24 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60",
        drag && spot?.zone === z && !keys.length && "border-blue-500 bg-blue-50/60",
      )}
      onDragOver={(e) => {
        if (!drag) return;
        e.preventDefault();
        const s = spotIn(z, e.clientY);
        if (!spot || spot.zone !== s.zone || spot.index !== s.index) setSpot(s);
      }}
      onDrop={(e) => {
        e.preventDefault();
        drop();
      }}
    >
      {drag && !keys.length ? <p className="py-8 text-center text-xs text-slate-500">{empty}</p> : null}
      {keys.map((k, i) => {
        const before = drag && spot?.zone === z && spot.index === i && drag !== k;
        const after = drag && spot?.zone === z && spot.index === keys.length && i === keys.length - 1 && drag !== k;
        return (
          <div
            key={k}
            data-card={k}
            draggable={armed === k}
            onDragStart={(e) => {
              setDrag(k);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", k);
            }}
            onDragEnd={finish}
            className={cn("group relative @container", drag === k && "opacity-40")}
          >
            {before ? <span className="absolute -top-2.5 left-0 right-0 h-1 rounded bg-blue-500" aria-hidden /> : null}
            {after ? <span className="absolute -bottom-2.5 left-0 right-0 h-1 rounded bg-blue-500" aria-hidden /> : null}
            <button
              type="button"
              onMouseDown={() => setArmed(k)}
              onMouseUp={() => !drag && setArmed(null)}
              onTouchStart={() => setArmed(k)}
              className="absolute right-1.5 top-1.5 z-10 cursor-grab rounded-md p-1 text-slate-300 opacity-60 hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100 active:cursor-grabbing"
              title={`Drag to move ${titles[k] ?? "this card"}`}
              aria-label={`Move ${titles[k] ?? "card"}`}
            >
              <GripVertical className="h-4 w-4" />
            </button>
            {cards[k]}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4" onDragEnd={finish}>
      {zone("wide", layout.wide, "space-y-4", "Drop a card here to stretch it across the top")}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {layout.cols.map((keys, i) => (
          <div key={i}>{zone(i, keys, "space-y-4", "Drop a card here")}</div>
        ))}
      </div>
    </div>
  );
}

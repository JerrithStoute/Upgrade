"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The estimate's sideways scrollbar, pinned just above the bottom bar — always in view and
 * usable, wherever the page is scrolled. It moves the sheet (and follows it). Gives way to the
 * sheet's own scrollbar when that one is on screen, so there's never two.
 * Goes inside the (sticky, positioned) bottom bar.
 */
export function SideScroll({ box }: { box: React.RefObject<HTMLDivElement | null> }) {
  const bar = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; width: number; inner: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    const host = bar.current?.parentElement;
    if (!el || !host) return;
    const measure = () => {
      const b = el.getBoundingClientRect();
      const h = host.getBoundingClientRect();
      const wide = el.scrollWidth > el.clientWidth + 1;
      // The sheet's own scrollbar is in view (its bottom edge is above the bottom bar): use that one.
      const ownInView = b.bottom <= h.top + 1;
      const next = wide && !ownInView && b.top < h.top ? { left: b.left - h.left, width: el.clientWidth, inner: el.scrollWidth } : null;
      setAt((cur) => (cur?.left === next?.left && cur?.width === next?.width && cur?.inner === next?.inner ? cur : next));
    };
    const follow = () => {
      if (bar.current && Math.abs(bar.current.scrollLeft - el.scrollLeft) > 1) bar.current.scrollLeft = el.scrollLeft;
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(el);
    if (el.firstElementChild) sizes.observe(el.firstElementChild);
    el.addEventListener("scroll", follow, { passive: true });
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      sizes.disconnect();
      el.removeEventListener("scroll", follow);
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [box]);

  // Just shown: start where the sheet is.
  useEffect(() => {
    if (at && bar.current && box.current) bar.current.scrollLeft = box.current.scrollLeft;
  }, [at, box]);

  return (
    <div
      ref={bar}
      aria-hidden
      className={at ? "absolute -top-4 h-4 overflow-x-scroll overflow-y-hidden rounded-b-lg border border-t-0 border-slate-200 bg-white" : "hidden"}
      style={at ? { left: at.left, width: at.width } : undefined}
      onScroll={(e) => {
        const el = box.current;
        if (el && Math.abs(el.scrollLeft - e.currentTarget.scrollLeft) > 1) el.scrollLeft = e.currentTarget.scrollLeft;
      }}
    >
      <div style={{ width: at?.inner ?? 0, height: 1 }} />
    </div>
  );
}

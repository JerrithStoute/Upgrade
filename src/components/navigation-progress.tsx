"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * A thin bar across the top of the screen from the moment a link is clicked until the next
 * page is there — so a click always shows it was heard. Floats over the page: nothing moves.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [width, setWidth] = useState(0); // 0 = hidden
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  // A click on a link to another page in the program: start the bar.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || a.target || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      clear();
      setWidth(15);
      // Creeps toward the end without reaching it until the page arrives (and gives up after 10 s).
      [[150, 40], [600, 60], [1500, 75], [4000, 88], [10000, 0]].forEach(([ms, w]) => timers.current.push(setTimeout(() => setWidth(w), ms)));
    };
    // Heard before the link itself handles the click (the program's links take it over).
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The new page is here: finish, then fade out.
  const here = `${pathname}?${search.toString()}`;
  const [shown, setShown] = useState(here);
  if (shown !== here) {
    setShown(here);
    if (width) setWidth(100);
  }
  useEffect(() => {
    if (width !== 100) return;
    clear();
    timers.current.push(setTimeout(() => setWidth(0), 250));
  }, [width]);

  return (
    <div aria-hidden className="no-print pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5">
      <div
        className="h-full bg-blue-600 shadow-[0_0_6px_rgba(37,99,235,0.6)] transition-[width,opacity] duration-300 ease-out"
        style={{ width: `${width}%`, opacity: width ? 1 : 0 }}
      />
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";

/**
 * The project tabs, held under the top bar while the page scrolls
 * (computer screens; a phone needs the room). Its height goes in --job-head so
 * panels that also stay put (cost codes, the estimate sheet) sit just below them.
 */
export function StickyJobHead({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const measure = () => root.style.setProperty("--job-head", getComputedStyle(el).position === "sticky" ? `${el.offsetHeight}px` : "0px");
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      root.style.removeProperty("--job-head");
    };
  }, []);
  return (
    <div
      ref={ref}
      className="no-print relative z-[5] mb-6 bg-[var(--background)] md:sticky md:top-14 md:shadow-[0_0_0_100vmax_var(--background)] md:[clip-path:inset(0_-100vmax)]"
    >
      {children}
    </div>
  );
}

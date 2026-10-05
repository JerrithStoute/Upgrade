"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const FADE = "2.5rem";

export function Tabs({ items, className }: { items: { href: string; label: string; exact?: boolean; count?: number }[]; className?: string }) {
  const pathname = usePathname();
  const ref = useRef<HTMLElement>(null);
  // More tabs off to the left / right (no scrollbar — the edge fades instead).
  const [more, setMore] = useState({ left: false, right: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
    };
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("resize", check);
    const first = setTimeout(() => {
      // The page you're on, in view (sideways only — the page itself doesn't move).
      const on = el.querySelector<HTMLElement>("[aria-current=page]");
      if (on && (on.offsetLeft < el.scrollLeft || on.offsetLeft + on.offsetWidth > el.scrollLeft + el.clientWidth)) el.scrollLeft = on.offsetLeft - el.clientWidth / 3;
      check();
    });
    return () => {
      clearTimeout(first);
      ro.disconnect();
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, [pathname]);
  const nudge = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.6, behavior: "smooth" });
  const mask =
    more.left || more.right
      ? `linear-gradient(to right, ${more.left ? "transparent" : "#000"}, #000 ${FADE}, #000 calc(100% - ${FADE}), ${more.right ? "transparent" : "#000"})`
      : undefined;

  return (
    <div className={cn("no-print relative", className)}>
      <nav
        ref={ref}
        className={cn("-mb-px flex gap-1 overflow-x-auto border-b border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden")}
        style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      >
        {items.map((t) => {
          const active = t.exact ? pathname === t.href : pathname === t.href || pathname.startsWith(t.href + "/");
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                active ? "border-blue-700 text-blue-800" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800",
              )}
            >
              {t.label}
              {typeof t.count === "number" ? <span className="rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{t.count}</span> : null}
            </Link>
          );
        })}
      </nav>
      {more.left ? (
        <button
          type="button"
          onClick={() => nudge(-1)}
          className="absolute inset-y-0 left-0 flex items-center px-0.5 text-slate-500 hover:text-slate-900"
          aria-label="More tabs to the left"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      ) : null}
      {more.right ? (
        <button
          type="button"
          onClick={() => nudge(1)}
          className="absolute inset-y-0 right-0 flex items-center px-0.5 text-slate-500 hover:text-slate-900"
          aria-label="More tabs to the right"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}

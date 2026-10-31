"use client";

import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

/**
 * A search box that narrows a list as you type — no Search button, no page reload. Each row of the list (inside
 * the element with id `listId`) carries `data-find` with the text it can be found by; rows that don't match hide.
 */
export function ListFind({ listId, placeholder }: { listId: string; placeholder: string }) {
  const [q, setQ] = useState("");
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    const list = document.getElementById(listId);
    if (!list) return;
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const narrow = () => {
      // A row shown in two places (the same job in "Custom homes" and "All projects") counts once, by data-find-key.
      const hits = new Set<string | HTMLElement>();
      list.querySelectorAll<HTMLElement>("[data-find]").forEach((row) => {
        const hit = words.every((w) => (row.dataset.find ?? "").includes(w));
        if (row.hidden !== !hit) row.hidden = !hit;
        if (hit) hits.add(row.dataset.findKey ?? row);
      });
      // A group (one box of rows) with nothing left shows its "None match" line.
      list.querySelectorAll<HTMLElement>("[data-find-group]").forEach((group) => {
        const none = group.querySelector<HTMLElement>("[data-find-none]");
        if (!none) return;
        const empty = !!words.length && !group.querySelector("[data-find]:not([hidden])");
        if (none.hidden !== !empty) none.hidden = !empty;
      });
      setShown(words.length ? hits.size : null);
    };
    narrow();
    // Rows that appear later (a box opened, the list refreshed) get narrowed too.
    const watch = new MutationObserver(narrow);
    watch.observe(list, { childList: true, subtree: true });
    return () => watch.disconnect();
  }, [q, listId]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[220px] max-w-md flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder={placeholder}
          aria-label="Search"
          className="input !h-8 !py-0 !pl-8 !pr-7 text-sm"
        />
        {q ? (
          <button type="button" aria-label="Clear" onClick={() => setQ("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {shown !== null ? <span className="text-xs text-slate-500">{shown === 0 ? "No matches" : `${shown} ${shown === 1 ? "match" : "matches"}`}</span> : null}
    </div>
  );
}

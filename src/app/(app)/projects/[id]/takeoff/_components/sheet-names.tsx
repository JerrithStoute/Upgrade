"use client";

import { actionMessage } from "@/lib/action-message";
import Link from "@/components/link";
import { useState, useTransition } from "react";
import { Check, ExternalLink, Pencil, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { renameSheet } from "../actions";

type Sheet = { id: string; pageNumber: number; name: string; unitsPerFoot: number | null; scaleLabel: string | null; _count: { measurements: number } };
type Status = "saving" | "saved" | { error: string };

/**
 * A plan set's pages: chips that open each one — or, with **Rename pages**, every page's name in
 * a box to type over (saves when you click away or press Enter, like the other tables).
 */
export function SheetNames({ projectId, planId, sheets }: { projectId: string; planId: string; sheets: Sheet[] }) {
  const href = (page: number) => `/projects/${projectId}/takeoff/${planId}?page=${page}`;
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [, startTransition] = useTransition();

  const save = (sheetId: string, name: string) => {
    setStatus((s) => ({ ...s, [sheetId]: "saving" }));
    startTransition(async () => {
      try {
        await renameSheet({ projectId, sheetId, name });
        setStatus((s) => ({ ...s, [sheetId]: "saved" }));
      } catch (e) {
        setStatus((s) => ({ ...s, [sheetId]: { error: actionMessage(e, "Couldn't rename it") } }));
      }
    });
  };

  const toggle = (
    <button
      type="button"
      className="tap inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50"
      onClick={() => setEditing((v) => !v)}
    >
      {editing ? (
        <>
          <Check className="h-3.5 w-3.5" /> Done
        </>
      ) : (
        <>
          <Pencil className="h-3.5 w-3.5" /> Rename pages
        </>
      )}
    </button>
  );

  if (!editing)
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {sheets.map((sh) => (
          <Link
            key={sh.id}
            href={href(sh.pageNumber)}
            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50"
          >
            <span className="font-medium">{sh.name}</span>
            <span className={cn("ml-1.5", sh.unitsPerFoot ? "text-slate-500" : "text-amber-700")}>{sh.unitsPerFoot ? sh.scaleLabel : "no scale"}</span>
            {sh._count.measurements ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{sh._count.measurements}</span> : null}
          </Link>
        ))}
        {toggle}
      </div>
    );

  return (
    <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-slate-600">Type over a page&apos;s name — it saves when you click away or press Enter. The ↗ opens the page to see what it is.</p>
        {toggle}
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {sheets.map((sh, i) => {
          const st = status[sh.id];
          return (
            <label key={sh.id} className="flex items-center gap-1.5 text-xs">
              <span className="w-9 shrink-0 text-right tabular-nums text-slate-500">p. {sh.pageNumber}</span>
              <input
                aria-label={`Name of page ${sh.pageNumber}`}
                className="input !h-8 min-w-0 flex-1 !px-2 !py-1 text-xs"
                defaultValue={sh.name}
                autoFocus={i === 0}
                onFocus={(e) => e.currentTarget.select()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    // On to the next page's box, like a list you type down.
                    const boxes = [...(e.currentTarget.closest(".grid")?.querySelectorAll("input") ?? [])];
                    const next = boxes[boxes.indexOf(e.currentTarget) + 1];
                    if (next) next.focus();
                    else e.currentTarget.blur();
                  }
                  if (e.key === "Escape") {
                    e.currentTarget.value = sh.name;
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => {
                  const v = e.currentTarget.value.trim();
                  if (!v) e.currentTarget.value = sh.name;
                  else if (v !== sh.name) save(sh.id, v);
                }}
              />
              <span className="w-3.5 shrink-0">
                {st === "saving" ? (
                  <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-400" aria-label="Saving" />
                ) : st === "saved" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="Saved" />
                ) : st ? (
                  <span title={st.error} className="text-rose-600">
                    <X className="h-3.5 w-3.5" aria-label={st.error} />
                  </span>
                ) : null}
              </span>
              <a href={href(sh.pageNumber)} target="_blank" rel="noreferrer" className="shrink-0 text-slate-400 hover:text-blue-700" title={`Open page ${sh.pageNumber} in a new tab`}>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </label>
          );
        })}
      </div>
    </div>
  );
}

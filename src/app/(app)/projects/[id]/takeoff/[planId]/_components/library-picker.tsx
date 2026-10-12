"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Library, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CONDITION_TYPE_LABELS, type ConditionType } from "@/lib/takeoff";
import type { LibraryTakeoff } from "./plan-viewer";

/**
 * The Library: every takeoff in your templates, big enough to read, to pull onto the job.
 * Stays open so several can be added; Done starts measuring with the last one added.
 */
export function LibraryPicker({
  library,
  jobNames,
  onAdd,
  onDone,
}: {
  library: LibraryTakeoff[];
  /** This job's takeoff names (lowercase) — those are already "On this job". */
  jobNames: Set<string>;
  /** Adds one to the job; the job's takeoff id, or null when it didn't go. */
  onAdd: (l: LibraryTakeoff) => Promise<string | null>;
  onDone: (lastAddedId: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<{ names: Set<string>; lastId: string | null; count: number }>({ names: new Set(), lastId: null, count: 0 });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDone(added.lastId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onDone, added.lastId]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => library.filter((l) => !q || l.name.toLowerCase().includes(q) || l.template.toLowerCase().includes(q)), [library, q]);
  // The templates, in Library order, with how many of their takeoffs match the search.
  const templates = useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number }>();
    for (const l of library) if (!m.has(l.templateId)) m.set(l.templateId, { id: l.templateId, name: l.template, n: 0 });
    for (const l of matches) m.get(l.templateId)!.n++;
    return [...m.values()];
  }, [library, matches]);
  const shown = templateId ? matches.filter((l) => l.templateId === templateId) : matches;
  const onJob = (l: LibraryTakeoff) => jobNames.has(l.name.trim().toLowerCase()) || added.names.has(l.name.trim().toLowerCase());

  const add = async (l: LibraryTakeoff) => {
    setBusy(l.id);
    const id = await onAdd(l);
    setBusy(null);
    if (id) setAdded((a) => ({ names: new Set([...a.names, l.name.trim().toLowerCase()]), lastId: id, count: a.count + 1 }));
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4" role="dialog" aria-modal="true" aria-label="Takeoff Library">
      <div className="flex h-[85vh] w-full max-w-4xl flex-col rounded-xl bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-slate-200 p-5">
          <Library className="h-5 w-5 text-blue-700" />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900">Takeoff Library</h2>
            <p className="text-sm text-slate-600">The takeoffs saved in your templates. Add the ones this job needs — items and all.</p>
          </div>
          <button type="button" aria-label="Close" className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => onDone(added.lastId)}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex gap-2 border-b border-slate-200 px-5 py-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the Library" className="input !pl-9" aria-label="Search the Library" />
          </div>
          {/* Narrow screens: the templates as a list to pick from. */}
          <select value={templateId ?? ""} onChange={(e) => setTemplateId(e.target.value || null)} className="input !w-40 sm:hidden" aria-label="Template">
            <option value="">All ({matches.length})</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.n})
              </option>
            ))}
          </select>
        </div>
        <div className="flex min-h-0 flex-1">
          {/* The templates */}
          <nav className="hidden w-56 shrink-0 overflow-y-auto border-r border-slate-200 p-2 text-sm sm:block">
            {[{ id: null, name: "All", n: matches.length }, ...templates].map((t) => (
              <button
                key={t.id ?? "all"}
                type="button"
                onClick={() => setTemplateId(t.id)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left",
                  templateId === t.id ? "bg-blue-50 font-medium text-blue-900" : "text-slate-700 hover:bg-slate-50",
                  t.n === 0 && templateId !== t.id && "text-slate-400",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="shrink-0 text-xs text-slate-400">{t.n}</span>
              </button>
            ))}
          </nav>
          {/* Their takeoffs */}
          <ul className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
            {library.length === 0 ? (
              <li className="p-6 text-center text-sm text-slate-500">Your Library is empty. Save a job&apos;s takeoffs as a template (⋯ Takeoff menu) and they show up here.</li>
            ) : shown.length === 0 ? (
              <li className="p-6 text-center text-sm text-slate-500">Nothing in {templateId ? "this template" : "the Library"} matches “{query.trim()}”.</li>
            ) : null}
            {shown.map((l) => {
              const here = onJob(l);
              return (
                <li key={l.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="h-3.5 w-3.5 shrink-0 rounded" style={{ background: l.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{l.name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {CONDITION_TYPE_LABELS[l.type as ConditionType] ?? l.type} · {l.items ? `${l.items} item${l.items === 1 ? "" : "s"}` : "measure only"}
                      {templateId ? "" : ` · ${l.template}`}
                    </p>
                  </div>
                  {here ? (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700">
                      <Check className="h-3.5 w-3.5" /> On this job
                    </span>
                  ) : (
                    <Button type="button" size="sm" variant="secondary" disabled={busy !== null} onClick={() => add(l)}>
                      <Plus className="h-3.5 w-3.5" /> {busy === l.id ? "Adding…" : "Add"}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="flex items-center gap-3 border-t border-slate-200 px-5 py-3">
          <p className="flex-1 text-sm text-slate-600">{added.count ? `Added ${added.count} to this job.` : "Nothing added yet."}</p>
          <Button type="button" onClick={() => onDone(added.lastId)}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

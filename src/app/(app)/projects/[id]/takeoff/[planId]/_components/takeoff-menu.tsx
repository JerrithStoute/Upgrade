"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Calculator, ClipboardList, FolderOpen, LayoutTemplate, MoreHorizontal, RefreshCw, Save, X } from "lucide-react";
import { SubmitButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { applyTakeoffTemplate, saveTakeoffAsTemplate } from "../../actions";
import { RevisionUpload } from "../../_components/revision-upload";

export type TakeoffMenuData = {
  templates: { id: string; name: string; conditions: number }[];
  isAdmin: boolean;
  takeoffCount: number;
};

type Panel = "template" | "save" | null;

/**
 * "⋯ Takeoff": everything that used to be on the Takeoff landing page and isn't on
 * the drawing screen already — the estimate, templates, price review, the full
 * material list, and a new revision of this plan set.
 */
export function TakeoffMenu({
  projectId,
  plan,
  here,
  data,
}: {
  projectId: string;
  plan: { id: string; name: string; revision: number; canRevise: boolean };
  /** This page, to come back to after a form. */
  here: string;
  data: TakeoffMenuData;
}) {
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  // Save as template: add to one you have (your toolbox), a new one, or replace one.
  const [saveMode, setSaveMode] = useState<"add" | "new" | "replace">(data.templates.length ? "add" : "new");
  const box = useRef<HTMLDivElement>(null);

  // Click outside or Esc closes it.
  useEffect(() => {
    if (!open && !panel) return;
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) {
        setOpen(false);
        setPanel(null);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setPanel(null);
      }
    };
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open, panel]);

  const item = "flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100";
  const show = (p: Panel) => {
    setPanel(p);
    setOpen(false);
  };
  const base = `/projects/${projectId}`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setPanel(null);
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium hover:bg-slate-100",
          open || panel ? "bg-slate-100 text-slate-900" : "text-slate-700",
        )}
        title="Estimate, templates, price review, material list, new revision"
      >
        <MoreHorizontal className="h-4 w-4" /> Takeoff
      </button>

      {open ? (
        <div className="absolute right-0 top-9 z-40 w-64 rounded-lg border border-slate-200 bg-white p-1 shadow-xl">
          <Link href={`${base}/materials`} className={item}>
            <ClipboardList className="h-3.5 w-3.5 text-slate-400" /> Full material list (print, prices, CSV)
          </Link>
          {/* No sending: a draft estimate fills in and updates itself from the takeoff whenever it's opened. */}
          <Link href={`${base}/estimate`} className={item} title="Draft estimates fill in and update themselves from the takeoff (locked ones don't change)">
            <Calculator className="h-3.5 w-3.5 text-slate-400" /> Open the estimate
          </Link>
          <button type="button" className={item} onClick={() => show("template")}>
            <LayoutTemplate className="h-3.5 w-3.5 text-slate-400" /> Add takeoffs from a template…
          </button>
          {data.isAdmin && data.takeoffCount > 0 ? (
            <button type="button" className={item} onClick={() => show("save")}>
              <Save className="h-3.5 w-3.5 text-slate-400" /> Save takeoffs as a template…
            </button>
          ) : null}
          <Link href={`${base}/takeoff/rebid`} className={item}>
            <RefreshCw className="h-3.5 w-3.5 text-slate-400" /> Price review / lock prices
          </Link>
          <div className="my-1 border-t border-slate-100" />
          <p className="px-2.5 pb-0.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {plan.name}
            {plan.revision > 1 ? ` · Rev ${plan.revision}` : ""}
          </p>
          {plan.canRevise ? (
            <div className="px-1">
              <RevisionUpload projectId={projectId} planId={plan.id} nextRevision={plan.revision + 1} />
            </div>
          ) : null}
          <Link href={`${base}/plans`} className={item}>
            <FolderOpen className="h-3.5 w-3.5 text-slate-400" /> All plan sets (upload, rename, share)
          </Link>
        </div>
      ) : null}

      {panel ? (
        <div className="absolute right-0 top-9 z-40 w-80 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-xl">
          <div className="mb-2 flex items-center gap-2">
            <p className="flex-1 font-semibold text-slate-900">{panel === "template" ? "Add takeoffs from a template" : "Save as a template"}</p>
            <button type="button" aria-label="Close" className="text-slate-400 hover:text-slate-700" onClick={() => setPanel(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {panel === "template" ? (
            data.templates.length === 0 ? (
              <p className="text-xs text-slate-600">
                No takeoff templates yet.{" "}
                {data.isAdmin ? "Save this job's takeoffs as one, or build one in Settings → Takeoff templates." : "An admin can create them in Settings."}
              </p>
            ) : (
              <form action={applyTakeoffTemplate} className="space-y-2">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="returnTo" value={here} />
                <select name="templateId" aria-label="Takeoff template" className="input !h-8 !py-0 text-xs" defaultValue={data.templates[0].id}>
                  {data.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.conditions})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-500">Takeoffs already on this job are skipped.</p>
                <SubmitButton size="sm" pendingText="Adding…">
                  Add takeoffs
                </SubmitButton>
              </form>
            )
          ) : null}

          {panel === "save" ? (
            <form action={saveTakeoffAsTemplate} className="space-y-2 text-xs">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="returnTo" value={here} />
              <input type="hidden" name="mode" value={saveMode} />
              {data.templates.length ? (
                <div className="space-y-1" role="radiogroup" aria-label="Where to save">
                  {(
                    [
                      ["add", "Add to a template I have"],
                      ["new", "A new template"],
                      ["replace", "Replace a template"],
                    ] as const
                  ).map(([m, label]) => (
                    <label key={m} className="flex items-center gap-2 text-slate-700">
                      <input type="radio" name="saveModePick" checked={saveMode === m} onChange={() => setSaveMode(m)} className="h-3.5 w-3.5" />
                      {label}
                    </label>
                  ))}
                </div>
              ) : null}
              {saveMode === "new" || !data.templates.length ? (
                <input name="name" placeholder="New template name" className="input !h-8 !py-0 text-xs" aria-label="New template name" required />
              ) : (
                <select name="templateId" aria-label="Template" className="input !h-8 !py-0 text-xs" defaultValue={data.templates[0].id} required>
                  {data.templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.conditions})
                    </option>
                  ))}
                </select>
              )}
              {saveMode === "add" && data.templates.length ? (
                <>
                  <label className="flex items-start gap-2 text-slate-700">
                    <input type="checkbox" name="update" value="1" className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300" />
                    <span>Also update the takeoffs it already has (same name) with this job&apos;s settings and items</span>
                  </label>
                  <p className="text-slate-500">
                    Adds the takeoffs it doesn&apos;t have yet, items and all — your toolbox grows. Ones it has stay as they are unless you tick the box.
                  </p>
                </>
              ) : saveMode === "replace" ? (
                <p className="text-amber-800">Replaces everything in that template with this job&apos;s takeoffs.</p>
              ) : (
                <p className="text-slate-500">All {data.takeoffCount} takeoffs, with the items under them.</p>
              )}
              <SubmitButton size="sm" variant="secondary" pendingText="Saving…" disabled={data.takeoffCount === 0}>
                {saveMode === "add" && data.templates.length ? "Add" : "Save"} {data.takeoffCount} takeoff{data.takeoffCount === 1 ? "" : "s"}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "@/components/link";
import { FileWarning, Pencil, Plus } from "lucide-react";
import { actionMessage } from "@/lib/action-message";
import { cn } from "@/lib/utils";
import { quickVendor } from "@/app/(app)/(directory)/vendors/actions";
import { saveJobVendors } from "../actions";

type JobVendor = { id: string; name: string; hasLogin: boolean; warn?: string };

const btn = "inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-medium disabled:opacity-50";
const primary = cn(btn, "bg-blue-600 text-white hover:bg-blue-700");
const plain = cn(btn, "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50");

/**
 * Which subs and vendors see this job in their portal (its address on a map, and directions to
 * it). Picked by hand; the ones with a portal login are marked — the rest see it once they have one.
 * Paperwork a sub still owes shows beside them (a reminder, not a stop), and one not on the list yet
 * can be added right here. Edit opens the ticks in the box; Save keeps you on the job.
 */
export function JobVendors({ projectId, vendors: initial, picked }: { projectId: string; vendors: JobVendor[]; picked: string[] }) {
  const router = useRouter();
  const [vendors, setVendors] = useState(initial);
  const [editing, setEditing] = useState(false);
  const [ticked, setTicked] = useState(() => new Set(picked));
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const shown = initial.filter((v) => picked.includes(v.id));

  const add = () =>
    start(async () => {
      setError(null);
      try {
        const r = await quickVendor({ name: adding ?? "" });
        if (!r.ok) return setError(r.error);
        const v = { id: r.option.id, name: r.option.label, hasLogin: false, warn: r.option.warn };
        setVendors((cur) => (cur.some((x) => x.id === v.id) ? cur : [...cur, v]));
        setTicked((cur) => new Set(cur).add(v.id));
        setAdding(null);
      } catch (e) {
        setError(actionMessage(e, "It wasn't saved — try again"));
      }
    });
  const save = () =>
    start(async () => {
      setError(null);
      const r = await saveJobVendors(projectId, [...ticked]);
      if (!r.ok) return setError(r.error);
      setEditing(false);
      router.refresh();
    });
  const cancel = () => {
    setTicked(new Set(picked));
    setAdding(null);
    setError(null);
    setEditing(false);
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900">Subs on this job</h2>
          <p className="text-xs text-slate-500">They see where it is in their portal: the address, a map, and directions.</p>
        </div>
        {!editing ? (
          <button type="button" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700 hover:underline" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" /> Edit
          </button>
        ) : null}
      </header>
      {editing ? (
        <div className="space-y-2 px-4 py-2.5">
          {vendors.length ? (
            <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 text-sm text-slate-700 sm:grid-cols-2">
              {vendors.map((v) => (
                <label key={v.id} className="flex items-start gap-1.5">
                  <input
                    type="checkbox"
                    checked={ticked.has(v.id)}
                    onChange={(e) =>
                      setTicked((cur) => {
                        const next = new Set(cur);
                        if (e.target.checked) next.add(v.id);
                        else next.delete(v.id);
                        return next;
                      })
                    }
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300"
                  />
                  <span className="min-w-0">
                    <span className="block truncate">
                      {v.name}
                      {v.hasLogin ? null : <span className="ml-1 text-xs text-slate-400">(no portal login yet)</span>}
                    </span>
                    {v.warn && ticked.has(v.id) ? (
                      <span className="flex items-start gap-1 text-xs text-amber-800">
                        <FileWarning className="mt-px h-3 w-3 shrink-0" /> {v.warn}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No subs or vendors yet — add one below.</p>
          )}
          {adding === null ? (
            <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline" onClick={() => setAdding("")}>
              <Plus className="h-3.5 w-3.5" /> New sub or vendor
            </button>
          ) : (
            <span className="flex flex-wrap items-center gap-1.5">
              <input
                autoFocus
                className="input !h-7 !w-48 !py-0 text-xs"
                placeholder="Company name"
                aria-label="New vendor's name"
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                  if (e.key === "Escape") setAdding(null);
                }}
              />
              <button type="button" disabled={busy || !adding.trim()} className={primary} onClick={add}>
                {busy ? "Adding…" : "Add and tick"}
              </button>
              <button type="button" className={plain} onClick={() => setAdding(null)}>
                Cancel
              </button>
            </span>
          )}
          {error ? <p className="text-xs text-rose-700">{error}</p> : null}
          <div className="flex gap-1.5 border-t border-slate-100 pt-2">
            <button type="button" disabled={busy} className={primary} onClick={save}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" className={plain} onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : shown.length ? (
        <ul className="divide-y divide-slate-100">
          {shown.map((v) => (
            <li key={v.id} className="px-4 py-1.5 text-sm">
              <Link href={`/vendors/${v.id}`} className="text-slate-900 hover:text-blue-700">
                {v.name}
              </Link>{" "}
              <span className="text-xs text-slate-500">{v.hasLogin ? "· portal" : "· no portal login yet"}</span>
              {v.warn ? (
                <span className="flex items-start gap-1 text-xs text-amber-800">
                  <FileWarning className="mt-px h-3 w-3 shrink-0" /> {v.warn}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-2.5 text-sm text-slate-500">None yet — click Edit to pick who sees this job.</p>
      )}
    </section>
  );
}

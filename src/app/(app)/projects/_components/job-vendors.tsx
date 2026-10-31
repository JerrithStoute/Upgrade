"use client";

import { useState, useTransition } from "react";
import { FileWarning, Plus } from "lucide-react";
import { Card, CardBody, CardHeader, SubmitButton } from "@/components/ui";
import { actionMessage } from "@/lib/action-message";
import { quickVendor } from "@/app/(app)/(directory)/vendors/actions";

type JobVendor = { id: string; name: string; hasLogin: boolean; warn?: string };

/**
 * Which subs and vendors see this job in their portal (its address on a map, and directions to
 * it). Picked by hand; the ones with a portal login are marked — the rest see it once they have one.
 * Paperwork a sub still owes shows beside them (a reminder, not a stop), and one not on the list yet
 * can be added right here.
 */
export function JobVendors({ action, vendors: initial, picked }: { action: (fd: FormData) => Promise<void>; vendors: JobVendor[]; picked: string[] }) {
  const [vendors, setVendors] = useState(initial);
  const [ticked, setTicked] = useState(() => new Set(picked));
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

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

  return (
    <Card>
      <CardHeader title="Subs & vendors who see where this job is" description="In their portal, under Jobs: the address, a map, and directions from where they are." />
      <CardBody>
        <form action={action} className="space-y-3">
          {vendors.length ? (
            <div className="grid grid-cols-1 gap-x-5 gap-y-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
              {vendors.map((v) => (
                <label key={v.id} className="flex items-start gap-1.5">
                  <input
                    type="checkbox"
                    name="vendorIds"
                    value={v.id}
                    checked={ticked.has(v.id)}
                    onChange={(e) =>
                      setTicked((cur) => {
                        const next = new Set(cur);
                        if (e.target.checked) next.add(v.id);
                        else next.delete(v.id);
                        return next;
                      })
                    }
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300"
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
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton size="sm">Save</SubmitButton>
            {adding === null ? (
              <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline" onClick={() => setAdding("")}>
                <Plus className="h-3.5 w-3.5" /> New vendor
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <input
                  autoFocus
                  className="input !h-8 !w-48 text-sm"
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
                <button type="button" disabled={busy || !adding.trim()} className="rounded-md bg-blue-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50" onClick={add}>
                  {busy ? "Adding…" : "Add and tick"}
                </button>
                <button type="button" className="text-xs text-slate-500" onClick={() => setAdding(null)}>
                  Cancel
                </button>
              </span>
            )}
            {error ? <span className="text-xs text-rose-700">{error}</span> : null}
          </div>
        </form>
      </CardBody>
    </Card>
  );
}

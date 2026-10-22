"use client";

import { useMemo, useState } from "react";
import { HardHat, Search } from "lucide-react";
import { SubmitButton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { VendorPicker, type AddVendor, type EditVendor, type SendVendor } from "./vendor-picker";

type Code = { id: string; label: string };
type Plan = { id: string; name: string; folder: string; size: number };

const fileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/**
 * Send to subs: the trade (cost codes) to bid, the subs — ticked for you if they bid that code (or add one
 * here) — the job's plans to go with it, when it's due and a note. Each sub gets a bid in Sent below, to
 * email: a link to the plans and a page to send their price, nothing attached.
 */
export function SendToSubs({
  action,
  addVendor,
  editVendor,
  projectId,
  codes,
  vendors: initialVendors,
  plans,
}: {
  action: (fd: FormData) => Promise<void>;
  addVendor: AddVendor;
  editVendor: EditVendor;
  projectId: string;
  codes: Code[];
  vendors: SendVendor[];
  plans: Plan[];
}) {
  const [vendors, setVendors] = useState(initialVendors);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [find, setFind] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);
  // The plan sheets go by default; other documents when you tick them.
  const [files, setFiles] = useState<Set<string>>(() => new Set(plans.filter((p) => p.folder === "Plans").map((p) => p.id)));

  const shown = useMemo(() => {
    const q = find.trim().toLowerCase();
    return q ? codes.filter((c) => c.label.toLowerCase().includes(q) || picked.has(c.id)) : codes;
  }, [codes, find, picked]);
  const pickedCodes = Array.from(picked);

  const toggleCode = (id: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(id);
    else next.delete(id);
    setPicked(next);
    // Picking a trade ticks the subs who bid it (until you tick subs yourself).
    if (!touched) setChosen(new Set(vendors.filter((v) => v.codes.some((c) => next.has(c))).map((v) => v.id)));
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      {pickedCodes.map((id) => (
        <input key={id} type="hidden" name="code" value={id} />
      ))}
      {Array.from(files).map((id) => (
        <input key={id} type="hidden" name="plan" value={id} />
      ))}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <div>
            <p className="label">Trade</p>
            <div className="relative mb-1.5">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
              <input
                className="input !pl-8"
                placeholder="Find a cost code — plumbing, 15…"
                value={find}
                onChange={(e) => setFind(e.target.value)}
                aria-label="Find a cost code"
              />
            </div>
            <ul className="max-h-48 overflow-y-auto rounded-md border border-slate-300 bg-white px-2.5 py-1">
              {shown.map((c) => (
                <li key={c.id}>
                  <label className="flex items-center gap-2 py-0.5 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={picked.has(c.id)}
                      onChange={(e) => toggleCode(c.id, e.target.checked)}
                    />
                    <span className={cn("truncate", picked.has(c.id) && "font-medium text-slate-900")}>{c.label}</span>
                  </label>
                </li>
              ))}
              {shown.length === 0 ? <li className="py-1 text-xs text-slate-500">No cost code matches — add it in Settings → Cost codes.</li> : null}
            </ul>
            <p className="mt-1 text-xs text-slate-500">Each trade gets its own price from the sub. Pick more than one if they bid them together.</p>
          </div>
          <div>
            <p className="label">Plans to send</p>
            {plans.length ? (
              <ul className="max-h-48 overflow-y-auto rounded-md border border-slate-300 bg-white px-2.5 py-1">
                {plans.map((f) => (
                  <li key={f.id}>
                    <label className="flex items-center gap-2 py-0.5 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={files.has(f.id)}
                        onChange={(e) =>
                          setFiles((cur) => {
                            const n = new Set(cur);
                            if (e.target.checked) n.add(f.id);
                            else n.delete(f.id);
                            return n;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {f.folder} · {fileSize(f.size)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-slate-300 px-2.5 py-2 text-xs text-slate-500">
                No plans on this job yet — add them in Files (Plans folder), or send without and attach nothing.
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              From this job&apos;s Files (Plans, Documents, Permits). They open them from the email&apos;s link — nothing big goes by email.
            </p>
          </div>
        </div>
        <div className="space-y-3">
          <VendorPicker
            label="Subs"
            noun="sub"
            vendors={vendors}
            setVendors={setVendors}
            chosen={chosen}
            pickedCodes={pickedCodes}
            addVendor={addVendor}
            editVendor={editVendor}
            onTick={(id, on) => {
              setTouched(true);
              setChosen((cur) => {
                const n = new Set(cur);
                if (on) n.add(id);
                else n.delete(id);
                return n;
              });
            }}
          />
          <label className="block">
            <span className="label">Due by (optional)</span>
            <input type="date" name="due" className="input !w-auto" />
          </label>
          <label className="block">
            <span className="label">Note to the subs (optional)</span>
            <textarea name="note" rows={2} className="input" placeholder="Bid per plans. Fixtures per allowance. Include permit." />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Making…" disabled={!picked.size || !chosen.size}>
          <HardHat className="h-4 w-4" /> Send to {chosen.size || ""} sub{chosen.size === 1 ? "" : "s"}
        </SubmitButton>
        <span className={cn("text-xs", picked.size && chosen.size ? "text-slate-600" : "text-slate-400")}>
          {picked.size && chosen.size
            ? `Each sub gets a bid in Sent below — email them from there. ${files.size ? `${files.size} file${files.size === 1 ? "" : "s"} go with it.` : "No plans picked."}`
            : "Pick the trade and who to send it to."}
        </span>
      </div>
    </form>
  );
}

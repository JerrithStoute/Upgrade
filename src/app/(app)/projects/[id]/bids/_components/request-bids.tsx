"use client";

import { useState, useTransition } from "react";
import { ChevronRight, FileSpreadsheet, Plus, X } from "lucide-react";
import { Button, SubmitButton } from "@/components/ui";
import { cn, money, num } from "@/lib/utils";

type Item = { key: string; name: string; quantity: number; unit: string; extended: number };
type Group = { codeKey: string; codeLabel: string; items: Item[] };
export type SendVendor = { id: string; name: string; email: string | null; codes: string[] };
type NewVendor = { name: string; contact: string; email: string; phone: string };

/**
 * Send to vendors: pick what goes (by cost code, and item by item inside one), pick the
 * vendors — or add one right here — and a note. Picking cost codes ticks the vendors who
 * bid them (until you tick vendors yourself).
 */
export function RequestBids({
  action,
  addVendor,
  projectId,
  groups,
  vendors: initialVendors,
  locked,
  ladders,
}: {
  action: (fd: FormData) => Promise<void>;
  addVendor: (v: NewVendor & { codes: string[] }) => Promise<{ ok: true; vendor: SendVendor } | { ok: false; error: string }>;
  projectId: string;
  groups: Group[];
  vendors: SendVendor[];
  locked: boolean;
  /** Lumber sizes on the job and every length they come in (the price ladder). */
  ladders: { size: string; lengths: number[]; itemKeys: string[] }[];
}) {
  const [vendors, setVendors] = useState(initialVendors);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState("");
  const [askLadder, setAskLadder] = useState(true);
  const [adding, setAdding] = useState<NewVendor | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const codesOf = (keys: Set<string>) => groups.filter((g) => g.items.some((i) => keys.has(i.key))).map((g) => g.codeKey);
  const autoVendors = (keys: Set<string>) => {
    if (touched) return;
    const codes = codesOf(keys);
    setChosen(new Set(vendors.filter((v) => v.codes.some((c) => codes.includes(c))).map((v) => v.id)));
  };
  const setItems = (keys: Set<string>) => {
    setPicked(keys);
    autoVendors(keys);
  };
  const toggleGroup = (g: Group, on: boolean) => {
    const next = new Set(picked);
    for (const i of g.items) {
      if (on) next.add(i.key);
      else next.delete(i.key);
    }
    setItems(next);
  };
  const toggleItem = (key: string, on: boolean) => {
    const next = new Set(picked);
    if (on) next.add(key);
    else next.delete(key);
    setItems(next);
  };
  const allKeys = groups.flatMap((g) => g.items.map((i) => i.key));
  const ladderNow = ladders.filter((l) => l.itemKeys.some((k) => picked.has(k)));
  const feet = (n: number) => `${num(n)}'`;
  const pickedCodes = codesOf(picked);

  const saveVendor = () => {
    if (!adding) return;
    setAddError(null);
    startSaving(async () => {
      const r = await addVendor({ ...adding, codes: pickedCodes });
      if (!r.ok) {
        setAddError(r.error);
        return;
      }
      setVendors((cur) =>
        cur.some((v) => v.id === r.vendor.id) ? cur.map((v) => (v.id === r.vendor.id ? r.vendor : v)) : [...cur, r.vendor].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setTouched(true);
      setChosen((cur) => new Set(cur).add(r.vendor.id));
      setAdding(null);
    });
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="projectId" value={projectId} />
      {Array.from(picked).map((k) => (
        <input key={k} type="hidden" name="item" value={k} />
      ))}
      <div className="grid gap-4 md:grid-cols-2">
        {/* What to send */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <p className="label !mb-0">What to send</p>
            <span className="flex gap-2 text-xs">
              <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setItems(new Set(allKeys))}>
                All
              </button>
              <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setItems(new Set())}>
                None
              </button>
            </span>
          </div>
          <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-300 bg-white">
            {groups.map((g) => {
              const n = g.items.filter((i) => picked.has(i.key)).length;
              const isOpen = open === g.codeKey;
              return (
                <li key={g.codeKey}>
                  <div className="flex items-center gap-2 px-2.5 py-1.5">
                    <input
                      type="checkbox"
                      aria-label={`Send ${g.codeLabel}`}
                      className="h-4 w-4 rounded border-slate-300"
                      checked={n > 0}
                      ref={(el) => {
                        if (el) el.indeterminate = n > 0 && n < g.items.length;
                      }}
                      onChange={(e) => toggleGroup(g, e.target.checked)}
                    />
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm" onClick={() => setOpen(isOpen ? null : g.codeKey)}>
                      <span className="truncate font-medium text-slate-800">{g.codeLabel}</span>
                      <span className="shrink-0 text-xs text-slate-500">
                        {n > 0 && n < g.items.length ? `${n} of ${g.items.length}` : `${g.items.length} item${g.items.length === 1 ? "" : "s"}`}
                      </span>
                      <ChevronRight className={cn("ml-auto h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform", isOpen && "rotate-90")} />
                    </button>
                  </div>
                  {isOpen ? (
                    <ul className="space-y-0.5 bg-slate-50 px-2.5 py-1.5 pl-8">
                      {g.items.map((i) => (
                        <li key={i.key}>
                          <label className="flex items-center gap-2 text-xs text-slate-700">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-slate-300"
                              checked={picked.has(i.key)}
                              onChange={(e) => toggleItem(i.key, e.target.checked)}
                            />
                            <span className="min-w-0 flex-1 truncate">{i.name}</span>
                            <span className="shrink-0 tabular-nums text-slate-500">
                              {num(i.quantity)} {i.unit}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <p className="mt-1 text-xs text-slate-500">Click a cost code to untick single items. Quantities include waste.</p>
        </div>

        {/* Who to send it to */}
        <div className="space-y-3">
          <div>
            <p className="label">Vendors</p>
            <div className="max-h-56 overflow-y-auto rounded-md border border-slate-300 bg-white px-2.5 py-1.5">
              {vendors.length === 0 && !adding ? <p className="py-1 text-xs text-slate-500">No vendors yet — add the first one below.</p> : null}
              {vendors.map((v) => (
                <label key={v.id} className="flex items-center gap-2 py-1 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="vendor"
                    value={v.id}
                    checked={chosen.has(v.id)}
                    onChange={(e) => {
                      setTouched(true);
                      setChosen((cur) => {
                        const n = new Set(cur);
                        if (e.target.checked) n.add(v.id);
                        else n.delete(v.id);
                        return n;
                      });
                    }}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  <span className="min-w-0 flex-1 truncate">{v.name}</span>
                  {pickedCodes.length && v.codes.some((c) => pickedCodes.includes(c)) ? (
                    <span className="shrink-0 rounded-full bg-emerald-50 px-2 text-[11px] font-medium text-emerald-700">bids these</span>
                  ) : null}
                  {!v.email ? <span className="shrink-0 text-[11px] text-slate-400">no email</span> : null}
                </label>
              ))}
            </div>
            {adding ? (
              <div className="mt-2 space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="input col-span-2"
                    placeholder="Vendor name"
                    aria-label="New vendor name"
                    value={adding.name}
                    autoFocus
                    onChange={(e) => setAdding({ ...adding, name: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        saveVendor();
                      }
                    }}
                  />
                  <input
                    className="input"
                    placeholder="Email"
                    aria-label="New vendor email"
                    type="email"
                    value={adding.email}
                    onChange={(e) => setAdding({ ...adding, email: e.target.value })}
                  />
                  <input
                    className="input"
                    placeholder="Phone"
                    aria-label="New vendor phone"
                    value={adding.phone}
                    onChange={(e) => setAdding({ ...adding, phone: e.target.value })}
                  />
                  <input
                    className="input col-span-2"
                    placeholder="Contact (optional)"
                    aria-label="New vendor contact"
                    value={adding.contact}
                    onChange={(e) => setAdding({ ...adding, contact: e.target.value })}
                  />
                </div>
                {addError ? <p className="text-xs text-rose-700">{addError}</p> : null}
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" onClick={saveVendor} disabled={saving || !adding.name.trim()}>
                    {saving ? "Adding…" : "Add vendor"}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>
                    <X className="h-3.5 w-3.5" /> Cancel
                  </Button>
                  <span className="text-[11px] text-slate-500">
                    {pickedCodes.length ? "Saved with the cost codes you picked as what they bid." : ""} It&apos;s added to Settings → Vendors too.
                  </span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                onClick={() => setAdding({ name: "", contact: "", email: "", phone: "" })}
              >
                <Plus className="h-3.5 w-3.5" /> New vendor
              </button>
            )}
          </div>
          {ladderNow.length ? (
            <label className="flex items-start gap-2 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-sm text-slate-700">
              <input
                type="checkbox"
                name="ladder"
                value="1"
                checked={askLadder}
                onChange={(e) => setAskLadder(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <span>
                Also ask a price on every length: <b>{ladderNow.map((l) => `${l.size} ${feet(l.lengths[0])}–${feet(l.lengths[l.lengths.length - 1])}`).join(", ")}</b>
                <span className="block text-xs text-slate-500">
                  A short price list at the end — no quantities. With real prices for every length, Cheapest packing can pick the lengths that cost least.
                </span>
              </span>
            </label>
          ) : null}
          <label className="block">
            <span className="label">Note to the vendor (optional)</span>
            <textarea
              name="note"
              rows={2}
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Please quote by Friday. Deliver to the job site."
            />
          </label>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pendingText="Making…" disabled={!picked.size || !chosen.size}>
          <FileSpreadsheet className="h-4 w-4" /> Send to {chosen.size || ""} vendor{chosen.size === 1 ? "" : "s"}
        </SubmitButton>
        <span className={cn("text-xs", picked.size && chosen.size ? "text-slate-600" : "text-slate-400")}>
          {picked.size && chosen.size
            ? `${picked.size} item${picked.size === 1 ? "" : "s"} (${money(
                groups
                  .flatMap((g) => g.items)
                  .filter((i) => picked.has(i.key))
                  .reduce((s, i) => s + i.extended, 0),
              )} now). Each vendor gets an Excel file and a Print / PDF sheet below — send whichever they like.`
            : "Pick what to send and who to send it to."}
          {locked ? " Prices are locked, so these are re-bids: they're for comparing and won't change the job unless you take one." : ""}
        </span>
      </div>
    </form>
  );
}

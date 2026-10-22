"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui";

export type SendVendor = { id: string; name: string; email: string | null; contact: string | null; phone: string | null; codes: string[] };
/** The vendor form: a new one, or (with `id`) one being changed. */
type NewVendor = { id?: string; name: string; contact: string; email: string; phone: string };
export type AddVendor = (v: NewVendor & { codes: string[] }) => Promise<{ ok: true; vendor: SendVendor } | { ok: false; error: string }>;
export type EditVendor = (v: NewVendor & { id: string }) => Promise<{ ok: true; vendor: SendVendor } | { ok: false; error: string }>;

/**
 * Who a bid goes to — ticked boxes (sent as `vendor`), the ones who bid the picked cost codes marked, and a
 * vendor added or changed right here (saved to Settings → Vendors too). Send to vendors and Send to subs both use it.
 */
export function VendorPicker({
  label,
  noun,
  vendors,
  setVendors,
  chosen,
  onTick,
  pickedCodes,
  addVendor,
  editVendor,
}: {
  label: string;
  noun: string;
  vendors: SendVendor[];
  setVendors: (f: (cur: SendVendor[]) => SendVendor[]) => void;
  chosen: Set<string>;
  /** A box ticked or unticked (`added`: a new vendor, ticked for you). */
  onTick: (id: string, on: boolean, added?: boolean) => void;
  pickedCodes: string[];
  addVendor: AddVendor;
  editVendor: EditVendor;
}) {
  const [adding, setAdding] = useState<NewVendor | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const saveVendor = () => {
    if (!adding) return;
    setAddError(null);
    startSaving(async () => {
      const r = adding.id ? await editVendor({ ...adding, id: adding.id }) : await addVendor({ ...adding, codes: pickedCodes });
      if (!r.ok) {
        setAddError(r.error);
        return;
      }
      setVendors((cur) =>
        cur.some((v) => v.id === r.vendor.id)
          ? cur.map((v) => (v.id === r.vendor.id ? r.vendor : v))
          : [...cur, r.vendor].sort((a, b) => a.name.localeCompare(b.name)),
      );
      // (A new one is ticked; changing one leaves the ticks as they are.)
      if (!adding.id) onTick(r.vendor.id, true, true);
      setAdding(null);
    });
  };

  return (
    <div>
      <p className="label">{label}</p>
      <div className="max-h-56 overflow-y-auto rounded-md border border-slate-300 bg-white px-2.5 py-1.5">
        {vendors.length === 0 && !adding ? <p className="py-1 text-xs text-slate-500">No {noun}s yet — add the first one below.</p> : null}
        {vendors.map((v) => (
          <label key={v.id} className="flex items-center gap-2 py-1 text-sm text-slate-700">
            <input
              type="checkbox"
              name="vendor"
              value={v.id}
              checked={chosen.has(v.id)}
              onChange={(e) => onTick(v.id, e.target.checked)}
              className="h-4 w-4 rounded border-slate-300"
            />
            <span className="min-w-0 flex-1 truncate">{v.name}</span>
            {pickedCodes.length && v.codes.some((c) => pickedCodes.includes(c)) ? (
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 text-[11px] font-medium text-emerald-700">bids these</span>
            ) : null}
            {!v.email ? <span className="shrink-0 text-[11px] text-slate-400">no email</span> : null}
            <button
              type="button"
              className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title={`Change ${v.name}'s name, email, phone or contact`}
              aria-label={`Edit ${v.name}`}
              onClick={(e) => {
                e.preventDefault();
                setAddError(null);
                setAdding({ id: v.id, name: v.name, contact: v.contact ?? "", email: v.email ?? "", phone: v.phone ?? "" });
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </label>
        ))}
      </div>
      {adding ? (
        <div className="mt-2 space-y-2 rounded-md border border-blue-200 bg-blue-50/50 p-2.5">
          <div className="grid grid-cols-2 gap-2">
            <input
              className="input col-span-2"
              placeholder={`${noun[0].toUpperCase()}${noun.slice(1)} name`}
              aria-label={adding.id ? `${noun} name` : `New ${noun} name`}
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
              aria-label={`New ${noun} email`}
              type="email"
              value={adding.email}
              onChange={(e) => setAdding({ ...adding, email: e.target.value })}
            />
            <input
              className="input"
              placeholder="Phone"
              aria-label={`New ${noun} phone`}
              value={adding.phone}
              onChange={(e) => setAdding({ ...adding, phone: e.target.value })}
            />
            <input
              className="input col-span-2"
              placeholder="Contact (optional)"
              aria-label={`New ${noun} contact`}
              value={adding.contact}
              onChange={(e) => setAdding({ ...adding, contact: e.target.value })}
            />
          </div>
          {addError ? <p className="text-xs text-rose-700">{addError}</p> : null}
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={saveVendor} disabled={saving || !adding.name.trim()}>
              {saving ? "Saving…" : adding.id ? "Save changes" : `Add ${noun}`}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(null)}>
              <X className="h-3.5 w-3.5" /> Cancel
            </Button>
            <span className="text-[11px] text-slate-500">
              {adding.id
                ? "Changed in Settings → Vendors too. Bids already made keep the name they were sent with."
                : `${pickedCodes.length ? "Saved with the cost codes you picked as what they bid. " : ""}It's added to Settings → Vendors too.`}
            </span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
          onClick={() => setAdding({ name: "", contact: "", email: "", phone: "" })}
        >
          <Plus className="h-3.5 w-3.5" /> New {noun}
        </button>
      )}
    </div>
  );
}

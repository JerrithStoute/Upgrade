"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Pencil, Phone } from "lucide-react";
import { maskTaxId } from "@/lib/paperwork";
import { CodePicker } from "@/components/code-picker";
import { saveVendorInfo } from "@/app/(app)/(directory)/vendors/actions";

export type VendorInfoValues = {
  id: string;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  licenseNumber: string | null;
  taxId: string | null;
  notes: string | null;
  codes: string[];
};

const box = "input !h-8 !py-0 text-sm";

/** A vendor's company info — and, with Edit, the same box as fields: saved right here, you stay on their page. */
export function VendorInfo({ vendor: v, codes, canEdit, startEditing }: { vendor: VendorInfoValues; codes: { id: string; label: string }[]; canEdit: boolean; startEditing?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!!startEditing && canEdit);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const label = new Map(codes.map((c) => [c.id, c.label]));
  const bids = v.codes.map((id) => label.get(id)).filter(Boolean) as string[];

  const row = (name: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1.5 text-sm first:border-t-0">
      <span className="text-slate-500">{name}</span>
      <span className="min-w-0 break-words text-slate-900">{value || <span className="text-slate-300">—</span>}</span>
    </div>
  );
  const field = (name: string, key: keyof VendorInfoValues, opts: { type?: string; placeholder?: string } = {}) => (
    <label className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 border-t border-slate-100 py-1 text-sm first:border-t-0">
      <span className="text-slate-500">{name}</span>
      <input name={key} type={opts.type ?? "text"} defaultValue={(v[key] as string | null) ?? ""} placeholder={opts.placeholder} className={box} required={key === "name"} />
    </label>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-900">Company info</h2>
        {canEdit && !editing ? (
          <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" /> Edit
          </button>
        ) : null}
      </header>
      {editing ? (
        <form
          className="px-4 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("id", v.id);
            start(async () => {
              setError(null);
              const r = await saveVendorInfo(fd);
              if (!r.ok) return setError(r.error);
              setEditing(false);
              router.refresh();
            });
          }}
        >
          {field("Name", "name")}
          {field("Contact", "contact", { placeholder: "Who you call" })}
          {field("Phone", "phone", { type: "tel" })}
          {field("Email", "email", { type: "email" })}
          {field("Address", "address", { placeholder: "123 Main St, Beaumont TX" })}
          {field("License #", "licenseNumber")}
          {field("Tax ID", "taxId", { placeholder: "For 1099s" })}
          <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1 text-sm">
            <span className="pt-1 text-slate-500">Bids on</span>
            <CodePicker idPrefix={`vendor-${v.id}-codes`} codes={codes} picked={v.codes} />
          </div>
          <label className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1 text-sm">
            <span className="pt-1 text-slate-500">Notes</span>
            <textarea name="notes" rows={2} defaultValue={v.notes ?? ""} className="input text-sm" placeholder="Net 30, crew size, who to call…" />
          </label>
          {error ? <p className="py-1 text-sm text-rose-700">{error}</p> : null}
          <div className="flex gap-1.5 border-t border-slate-100 pt-2">
            <button type="submit" disabled={busy} className="inline-flex h-7 items-center rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {busy ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              className="inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
              onClick={() => {
                setError(null);
                setEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="px-4 py-2">
          {row("Contact", v.contact)}
          {row(
            "Phone",
            v.phone ? (
              <a href={`tel:${v.phone}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                <Phone className="h-3.5 w-3.5" /> {v.phone}
              </a>
            ) : null,
          )}
          {row(
            "Email",
            v.email ? (
              <a href={`mailto:${v.email}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                <Mail className="h-3.5 w-3.5" /> {v.email}
              </a>
            ) : null,
          )}
          {row("Address", v.address)}
          {row("License #", v.licenseNumber)}
          {row("Tax ID", v.taxId ? <span className="font-mono tracking-wide">{maskTaxId(v.taxId)}</span> : null)}
          {row("Bids on", bids.join(" · "))}
          {row("Notes", v.notes ? <span className="whitespace-pre-line">{v.notes}</span> : null)}
        </div>
      )}
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Pencil, Phone } from "lucide-react";
import { fmtDate } from "@/lib/utils";
import { saveClientInfo } from "@/app/(app)/(directory)/clients/actions";

export type ClientInfoValues = {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  source: string | null;
  notes: string | null;
  createdAt: Date;
};

const box = "input !h-8 !py-0 text-sm";

/** A client's info — and, with Edit, the same box as fields: saved right here, you stay on their page. */
export function ClientInfo({ client: c, canEdit, startEditing }: { client: ClientInfoValues; canEdit: boolean; startEditing?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(!!startEditing && canEdit);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const cityLine = [[c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ");
  const address = [c.address, cityLine].filter(Boolean).join(", ");

  const row = (name: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1.5 text-sm first:border-t-0">
      <span className="text-slate-500">{name}</span>
      <span className="min-w-0 break-words text-slate-900">{value || <span className="text-slate-300">—</span>}</span>
    </div>
  );
  const input = (key: keyof ClientInfoValues, opts: { type?: string; placeholder?: string; label: string; className?: string; maxLength?: number }) => (
    <input
      name={key}
      type={opts.type ?? "text"}
      defaultValue={(c[key] as string | null) ?? ""}
      placeholder={opts.placeholder}
      aria-label={opts.label}
      maxLength={opts.maxLength}
      className={`${box} ${opts.className ?? ""}`}
      required={key === "firstName" || key === "lastName"}
    />
  );
  const field = (name: string, children: React.ReactNode) => (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 border-t border-slate-100 py-1 text-sm first:border-t-0">
      <span className="text-slate-500">{name}</span>
      {children}
    </div>
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <h2 className="text-sm font-semibold text-slate-900">Info</h2>
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
            fd.set("id", c.id);
            start(async () => {
              setError(null);
              const r = await saveClientInfo(fd);
              if (!r.ok) return setError(r.error);
              setEditing(false);
              router.refresh();
            });
          }}
        >
          {field(
            "Name",
            <span className="grid grid-cols-2 gap-1.5">
              {input("firstName", { label: "First name", placeholder: "First" })}
              {input("lastName", { label: "Last name", placeholder: "Last" })}
            </span>,
          )}
          {field("Company", input("company", { label: "Company" }))}
          {field("Email", input("email", { label: "Email", type: "email" }))}
          {field("Phone", input("phone", { label: "Phone", type: "tel" }))}
          {field("Street", input("address", { label: "Street" }))}
          {field(
            "City, state, ZIP",
            <span className="grid grid-cols-[minmax(0,1fr)_3.5rem_5.5rem] gap-1.5">
              {input("city", { label: "City", placeholder: "City" })}
              {input("state", { label: "State", placeholder: "ST", maxLength: 2 })}
              {input("zip", { label: "ZIP", placeholder: "ZIP" })}
            </span>,
          )}
          {field("Source", input("source", { label: "Source", placeholder: "Referral, website, repeat client…" }))}
          <label className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1 text-sm">
            <span className="pt-1 text-slate-500">Notes</span>
            <textarea name="notes" rows={2} defaultValue={c.notes ?? ""} className="input text-sm" placeholder="Gate codes, preferences, how they found you…" />
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
          {row("Company", c.company)}
          {row(
            "Phone",
            c.phone ? (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                <Phone className="h-3.5 w-3.5" /> {c.phone}
              </a>
            ) : null,
          )}
          {row(
            "Email",
            c.email ? (
              <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                <Mail className="h-3.5 w-3.5" /> {c.email}
              </a>
            ) : null,
          )}
          {row("Address", address)}
          {row("Source", c.source)}
          {row("Client since", fmtDate(c.createdAt))}
          {row("Notes", c.notes ? <span className="whitespace-pre-line">{c.notes}</span> : null)}
        </div>
      )}
    </section>
  );
}

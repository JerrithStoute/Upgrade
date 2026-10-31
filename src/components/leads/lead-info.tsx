"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Pencil, Phone } from "lucide-react";
import { PROJECT_TYPES } from "@/lib/constants";
import { money, titleCase } from "@/lib/utils";
import { updateLead } from "@/app/(app)/leads/actions";

export type LeadInfoValues = {
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
  title: string | null;
  jobType: string;
  value: number | null;
  source: string | null;
  notes: string | null;
  ownerId: string | null;
};

const box = "input !h-8 !py-0 text-sm";

/** A lead's info — and, with Edit, the same box as fields: saved right here, you stay on their page. */
export function LeadInfo({
  lead: l,
  sources,
  staff,
  canEdit,
}: {
  lead: LeadInfoValues;
  sources: string[];
  staff: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const cityLine = [[l.city, l.state].filter(Boolean).join(", "), l.zip].filter(Boolean).join(" ");
  const address = [l.address, cityLine].filter(Boolean).join(", ");
  const owner = staff.find((s) => s.id === l.ownerId)?.name;

  const row = (name: string, value: React.ReactNode) => (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1.5 text-sm first:border-t-0">
      <span className="text-slate-500">{name}</span>
      <span className="min-w-0 break-words text-slate-900">{value || <span className="text-slate-300">—</span>}</span>
    </div>
  );
  const input = (key: keyof LeadInfoValues, label: string, opts: { type?: string; placeholder?: string; list?: string; inputMode?: "decimal" } = {}) => (
    <input
      name={key}
      type={opts.type ?? "text"}
      defaultValue={(l[key] as string | number | null) ?? ""}
      placeholder={opts.placeholder}
      aria-label={label}
      list={opts.list}
      inputMode={opts.inputMode}
      className={box}
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
            fd.set("id", l.id);
            start(async () => {
              setError(null);
              const r = await updateLead(null, fd);
              if (r?.error) return setError(r.error);
              setEditing(false);
              router.refresh();
            });
          }}
        >
          {field(
            "Name",
            <span className="grid grid-cols-2 gap-1.5">
              {input("firstName", "First name", { placeholder: "First" })}
              {input("lastName", "Last name", { placeholder: "Last" })}
            </span>,
          )}
          {field("Company", input("company", "Company", { placeholder: "If any" }))}
          {field("Phone", input("phone", "Phone", { type: "tel" }))}
          {field("Email", input("email", "Email", { type: "email" }))}
          {field("Job address", input("address", "Job address"))}
          {field(
            "City, state, ZIP",
            <span className="grid grid-cols-[minmax(0,1fr)_3.5rem_5.5rem] gap-1.5">
              {input("city", "City", { placeholder: "City" })}
              {input("state", "State", { placeholder: "ST" })}
              {input("zip", "ZIP", { placeholder: "ZIP" })}
            </span>,
          )}
          {field("What they want", input("title", "What they want", { placeholder: "Kitchen remodel, 2-car garage…" }))}
          {field(
            "Kind of job",
            <select name="jobType" defaultValue={l.jobType} aria-label="Kind of job" className={box}>
              {PROJECT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>,
          )}
          {field("Value", input("value", "Rough budget / value", { placeholder: "$", inputMode: "decimal" }))}
          {field(
            "Source",
            <>
              {input("source", "How they found you", { placeholder: "Pick or type", list: `lead-sources-${l.id}` })}
              <datalist id={`lead-sources-${l.id}`}>
                {sources.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </>,
          )}
          {field(
            "Whose lead",
            <select name="ownerId" defaultValue={l.ownerId ?? ""} aria-label="Whose lead" className={box}>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>,
          )}
          <label className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1 text-sm">
            <span className="pt-1 text-slate-500">Notes</span>
            <textarea name="notes" rows={3} defaultValue={l.notes ?? ""} className="input text-sm" placeholder="Timeline, must-haves, how they heard of you…" />
          </label>
          {error ? (
            <p role="alert" className="py-1 text-sm text-rose-700">
              {error}
            </p>
          ) : null}
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
          {l.company && l.firstName !== l.company ? row("Company", l.company) : null}
          {row(
            "Phone",
            l.phone ? (
              <a href={`tel:${l.phone}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                <Phone className="h-3.5 w-3.5" /> {l.phone}
              </a>
            ) : null,
          )}
          {row(
            "Email",
            l.email ? (
              <a href={`mailto:${l.email}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline">
                <Mail className="h-3.5 w-3.5" /> {l.email}
              </a>
            ) : null,
          )}
          {row("Job address", address)}
          {row("Job", [titleCase(l.jobType), l.title].filter(Boolean).join(" · "))}
          {row("Value", l.value ? money(l.value) : null)}
          {row("Source", l.source)}
          {row("Whose lead", owner)}
          {row("Notes", l.notes ? <span className="whitespace-pre-line">{l.notes}</span> : null)}
        </div>
      )}
    </section>
  );
}

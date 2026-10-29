"use client";

import { useState, useTransition } from "react";
import { PROJECT_TYPES } from "@/lib/constants";
import { titleCase } from "@/lib/utils";
import { Button, Field, FormGrid } from "@/components/ui";
import type { LeadFormState } from "../actions";

type Values = {
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

/** A lead's details — new (with a first follow-up) or editing. */
export function LeadForm({
  action,
  values,
  sources,
  staff,
  meId,
  followDefault,
}: {
  action: (prev: LeadFormState, fd: FormData) => Promise<LeadFormState>;
  values?: Values;
  sources: string[];
  staff: { id: string; name: string }[];
  meId: string;
  /** The first follow-up's date (yyyy-mm-dd), new leads only. */
  followDefault?: string;
}) {
  const v = values;
  const id = (k: string) => `lead-${k}`;
  const [error, setError] = useState<string | null>(null);
  const [saving, start] = useTransition();
  return (
    // Submitted by hand (not a form action) so a problem leaves everything you typed in place.
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          const r = await action(null, fd);
          if (r?.error) setError(r.error);
        });
      }}
    >
      {v ? <input type="hidden" name="id" value={v.id} /> : null}
      <FormGrid className="md:grid-cols-4">
        <Field label="First name" htmlFor={id("first")}>
          <input id={id("first")} name="firstName" className="input" defaultValue={v?.firstName} autoFocus={!v} />
        </Field>
        <Field label="Last name" htmlFor={id("last")}>
          <input id={id("last")} name="lastName" className="input" defaultValue={v?.lastName} />
        </Field>
        <Field label="Phone" htmlFor={id("phone")}>
          <input id={id("phone")} name="phone" type="tel" className="input" defaultValue={v?.phone ?? ""} />
        </Field>
        <Field label="Email" htmlFor={id("email")}>
          <input id={id("email")} name="email" type="email" className="input" defaultValue={v?.email ?? ""} />
        </Field>
        <Field label="Company (if any)" htmlFor={id("company")}>
          <input id={id("company")} name="company" className="input" defaultValue={v?.company ?? ""} />
        </Field>
        <Field label="Job address" htmlFor={id("address")} className="md:col-span-2">
          <input id={id("address")} name="address" className="input" defaultValue={v?.address ?? ""} />
        </Field>
        <div className="grid grid-cols-[1fr_4rem_5rem] gap-2">
          <Field label="City" htmlFor={id("city")}>
            <input id={id("city")} name="city" className="input" defaultValue={v?.city ?? ""} />
          </Field>
          <Field label="State" htmlFor={id("state")}>
            <input id={id("state")} name="state" className="input" defaultValue={v?.state ?? ""} />
          </Field>
          <Field label="Zip" htmlFor={id("zip")}>
            <input id={id("zip")} name="zip" className="input" defaultValue={v?.zip ?? ""} />
          </Field>
        </div>
        <Field label="What they want" htmlFor={id("title")} className="md:col-span-2">
          <input id={id("title")} name="title" className="input" defaultValue={v?.title ?? ""} placeholder="e.g. Kitchen remodel, 2-car garage with apartment" />
        </Field>
        <Field label="Kind of job" htmlFor={id("type")}>
          <select id={id("type")} name="jobType" className="input" defaultValue={v?.jobType ?? "REMODEL"}>
            {PROJECT_TYPES.map((t) => (
              <option key={t} value={t}>
                {titleCase(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Rough budget / value" htmlFor={id("value")}>
          <input id={id("value")} name="value" inputMode="decimal" className="input" defaultValue={v?.value ?? ""} placeholder="$" />
        </Field>
        <Field label="How they found you" htmlFor={id("source")}>
          <input id={id("source")} name="source" list="lead-sources" className="input" defaultValue={v?.source ?? ""} placeholder="Pick or type" />
          <datalist id="lead-sources">
            {sources.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>
        <Field label="Whose lead" htmlFor={id("owner")}>
          <select id={id("owner")} name="ownerId" className="input" defaultValue={v?.ownerId ?? meId}>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" htmlFor={id("notes")} className="md:col-span-4">
          <textarea
            id={id("notes")}
            name="notes"
            rows={3}
            className="input"
            defaultValue={v?.notes ?? ""}
            placeholder="What they told you — timeline, must-haves, how they heard of you…"
          />
        </Field>
      </FormGrid>
      {v ? null : (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3">
          <p className="mb-2 text-sm font-medium text-slate-800">First follow-up</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[10rem_1fr]">
            <input name="followUp" type="date" className="input" defaultValue={followDefault ?? ""} aria-label="Follow up on" />
            <input name="followNote" className="input" placeholder="e.g. Call to set up a meeting" aria-label="Follow-up note" />
          </div>
          <p className="mt-1 text-xs text-slate-500">It goes in To-Dos for whoever&apos;s lead it is. Clear the date to skip it.</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : v ? "Save lead" : "Add lead"}
        </Button>
        {error ? (
          <p role="alert" className="text-sm font-medium text-rose-700">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  );
}

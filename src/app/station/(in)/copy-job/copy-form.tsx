"use client";

import { useActionState } from "react";
import { Field, SubmitButton } from "@/components/ui";
import { FormNote } from "@/components/auth-card";
import { copyJobToBuilder, type CopyState } from "./actions";

type Builder = { id: string; name: string; jobs: { id: string; number: number; name: string; status: string }[] };

/** Pick the job (any builder's), the builder to copy it to, and what to do with the copy. */
export function CopyJobForm({ builders }: { builders: Builder[] }) {
  const [state, action] = useActionState<CopyState, FormData>(copyJobToBuilder, undefined);
  return (
    <form action={action} className="space-y-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="The job to copy" htmlFor="job" hint="Only read — the original is never changed">
          <select id="job" name="job" required className="input" defaultValue="">
            <option value="" disabled>
              Pick a job…
            </option>
            {builders
              .filter((b) => b.jobs.length)
              .map((b) => (
                <optgroup key={b.id} label={b.name}>
                  {b.jobs.map((j) => (
                    <option key={j.id} value={`${b.id}:${j.id}`}>
                      #{j.number} {j.name}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </Field>
        <Field label="Copy it to" htmlFor="to">
          <select id="to" name="to" required className="input" defaultValue="">
            <option value="" disabled>
              Pick a builder…
            </option>
            {builders.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="space-y-1.5 text-sm text-slate-700">
        <label className="flex items-start gap-2">
          <input type="checkbox" name="contract" defaultChecked className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>
            Put the copy under contract
            <span className="block text-xs text-slate-500">Its estimate approved — the budget follows it — prices locked, the job Contracted.</span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="changeOrders" defaultChecked className="mt-0.5 h-4 w-4 rounded border-slate-300" />
          <span>
            Add a few made-up change orders to the copy
            <span className="block text-xs text-slate-500">Two approved, one waiting on the client, one draft.</span>
          </span>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <SubmitButton pendingText="Copying… (a big job takes a minute)">Copy the job</SubmitButton>
        {state?.done ? <span className="text-sm text-emerald-700">{state.done}</span> : null}
      </div>
      <FormNote error={state?.error} />
    </form>
  );
}

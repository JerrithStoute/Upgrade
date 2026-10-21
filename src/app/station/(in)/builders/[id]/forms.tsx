"use client";

import { useActionState, useState } from "react";
import { Field, SubmitButton } from "@/components/ui";
import { FormNote } from "@/components/auth-card";
import { STATUS_LABEL, BUILDER_STATUSES, type BuilderStatus } from "@/lib/builder-status";
import { saveBuilderNotes, setBuilderStatus, type BuilderFormState } from "../actions";

const WHAT: Record<BuilderStatus, string> = {
  TRIAL: "Trying it out. Their admins see a note in the trial's last week, and after it ends.",
  ACTIVE: "A customer.",
  FREE: "Free on purpose — a founding builder, a friend.",
  PAUSED: "Nobody at this company can sign in — team, clients or vendors. Their data is kept; set it back to bring them back.",
};

export function StatusForm({ companyId, status, trialEndsAt }: { companyId: string; status: BuilderStatus; trialEndsAt: string }) {
  const [state, action] = useActionState<BuilderFormState, FormData>(setBuilderStatus, undefined);
  const [pick, setPick] = useState<BuilderStatus>(status);
  return (
    <form
      action={action}
      className="space-y-3"
      onSubmit={(e) => {
        if (pick === "PAUSED" && status !== "PAUSED" && !window.confirm("Pause this builder? Everyone at the company is signed out and can't sign back in.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="companyId" value={companyId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Status" htmlFor="status">
          <select id="status" name="status" className="input" value={pick} onChange={(e) => setPick(e.target.value as BuilderStatus)}>
            {BUILDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        {pick === "TRIAL" ? (
          <Field label="Trial ends" htmlFor="trialEndsAt">
            <input id="trialEndsAt" name="trialEndsAt" type="date" className="input" defaultValue={trialEndsAt} required />
          </Field>
        ) : null}
      </div>
      <p className="text-xs text-slate-500">{WHAT[pick]}</p>
      <FormNote error={state?.error} ok={state?.ok} />
      <SubmitButton pendingText="Saving…">Save status</SubmitButton>
    </form>
  );
}

export function NotesForm({ companyId, notes }: { companyId: string; notes: string }) {
  const [state, action] = useActionState<BuilderFormState, FormData>(saveBuilderNotes, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="companyId" value={companyId} />
      <textarea name="notes" rows={6} className="input" defaultValue={notes} placeholder="Calls, what they asked for, how they found us… Only the Station sees these." />
      <FormNote error={state?.error} ok={state?.ok} />
      <SubmitButton pendingText="Saving…">Save notes</SubmitButton>
    </form>
  );
}

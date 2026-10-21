"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Field, SubmitButton } from "@/components/ui";
import { FormNote } from "@/components/auth-card";
import { addStationPerson, newSetupLink, type TeamState } from "./actions";

/** The setup link that went out — or didn't — to copy and send another way. */
function SetupLinkNote({ state }: { state: TeamState }) {
  const [copied, setCopied] = useState(false);
  if (!state?.link) return <FormNote error={state?.error} />;
  return (
    <div className="space-y-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
      <p>{state.sent ? `Sent to ${state.email}.` : `The email didn't go out — send ${state.email} this link yourself.`} You can also text them this link:</p>
      <div className="flex items-center gap-2">
        <input readOnly value={state.link} className="input min-w-0 flex-1 bg-white font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className="flex items-center gap-1 rounded-md bg-white px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
          onClick={() => navigator.clipboard?.writeText(state.link!).then(() => setCopied(true), () => {})}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function AddPersonForm() {
  const [state, action] = useActionState<TeamState, FormData>(addStationPerson, undefined);
  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 md:grid-cols-4">
        <Field label="Name" htmlFor="name">
          <input id="name" name="name" required className="input" />
        </Field>
        <Field label="Email" htmlFor="email">
          <input id="email" name="email" type="email" required className="input" />
        </Field>
        <Field label="Role" htmlFor="role">
          <select id="role" name="role" className="input" defaultValue="STAFF">
            <option value="STAFF">Staff</option>
            <option value="OWNER">Owner</option>
          </select>
        </Field>
        <div className="flex items-end">
          <SubmitButton pendingText="Adding…">Add and send link</SubmitButton>
        </div>
      </form>
      <SetupLinkNote state={state} />
    </div>
  );
}

export function NewLinkForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<TeamState, FormData>(newSetupLink, undefined);
  return (
    <div className="space-y-2">
      <form action={action}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" disabled={pending} className="text-xs font-medium text-blue-700 hover:underline disabled:opacity-60">
          {pending ? "Sending…" : "Send a new setup link"}
        </button>
      </form>
      <SetupLinkNote state={state} />
    </div>
  );
}

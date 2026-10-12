"use client";

import { useActionState, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Field, SubmitButton } from "@/components/ui";
import { FormNote } from "@/components/auth-card";
import { inviteBuilder, type InviteState } from "./actions";

/** `fill`: a website request's who, to invite them in one click. */
export function InviteBuilderForm({ fill }: { fill?: { email?: string; name?: string; company?: string } }) {
  const [state, action] = useActionState<InviteState, FormData>(inviteBuilder, undefined);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <form action={action} className="grid gap-3 md:grid-cols-3">
        <Field label="Builder's email" htmlFor="email">
          <input id="email" name="email" type="email" required className="input" placeholder="sam@samhomes.com" defaultValue={fill?.email} />
        </Field>
        <Field label="Their name (optional)" htmlFor="name">
          <input id="name" name="name" className="input" defaultValue={fill?.name} />
        </Field>
        <Field label="Company (optional)" htmlFor="companyName">
          <input id="companyName" name="companyName" className="input" defaultValue={fill?.company} />
        </Field>
        <div className="md:col-span-3">
          <SubmitButton pendingText="Sending…">Send invitation</SubmitButton>
        </div>
      </form>
      <FormNote error={state?.error} />
      {state?.link ? (
        <div className="space-y-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-200">
          <p>{state.sent ? `Sent to ${state.email}.` : `The email didn't go out — send ${state.email} this link yourself.`} You can also text or email them this link:</p>
          <div className="flex items-center gap-2">
            <input readOnly value={state.link} className="input min-w-0 flex-1 bg-white font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="flex items-center gap-1 rounded-md bg-white px-3 py-2 text-xs font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50"
              onClick={() => {
                navigator.clipboard?.writeText(state.link!).then(() => setCopied(true), () => {});
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

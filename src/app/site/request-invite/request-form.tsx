"use client";

import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { FormNote } from "@/components/auth-card";
import { RobotCheck } from "@/components/robot-check";
import { HOMES_PER_YEAR } from "@/lib/site";
import { requestInvite, type RequestState } from "../actions";

export function RequestInviteForm({ robotKey }: { robotKey: string | null }) {
  const [state, action, pending] = useActionState<RequestState, FormData>(requestInvite, undefined);
  if (state?.ok)
    return (
      <div className="flex gap-3 rounded-xl bg-emerald-50 p-5 text-emerald-900 ring-1 ring-inset ring-emerald-200">
        <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
        <div>
          <p className="font-medium">Thanks — we’ve got your request.</p>
          <p className="mt-1 text-sm">We’ll be in touch soon. Your invitation will come by email, with your own sign-up link.</p>
        </div>
      </div>
    );
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" required className="input" autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="company">
          Company
        </label>
        <input id="company" name="company" required className="input" autoComplete="organization" />
      </div>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <div>
        <label className="label" htmlFor="phone">
          Phone <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input id="phone" name="phone" type="tel" className="input" autoComplete="tel" />
      </div>
      <div>
        <label className="label" htmlFor="where">
          Where you build <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <input id="where" name="where" className="input" placeholder="City, state" />
      </div>
      <div>
        <label className="label" htmlFor="homes">
          Homes a year <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <select id="homes" name="homes" className="input" defaultValue="">
          <option value="">—</option>
          {HOMES_PER_YEAR.map((h) => (
            <option key={h} value={h}>
              {h}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label" htmlFor="notes">
          Anything we should know? <span className="font-normal text-slate-400">(optional)</span>
        </label>
        <textarea id="notes" name="notes" rows={3} maxLength={1000} className="input" placeholder="What you use now, what you'd most like to fix…" />
      </div>
      <div className="sm:col-span-2 space-y-4">
        <RobotCheck siteKey={robotKey} round={state} />
        <FormNote error={state?.error} />
        <button type="submit" disabled={pending} className="rounded-md bg-blue-700 px-5 py-2.5 font-medium text-white hover:bg-blue-800 disabled:opacity-60">
          {pending ? "Sending…" : "Request an invite"}
        </button>
      </div>
    </form>
  );
}

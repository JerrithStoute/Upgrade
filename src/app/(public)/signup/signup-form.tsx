"use client";

import { useActionState } from "react";
import { authButton, FormNote } from "@/components/auth-card";
import { RobotCheck } from "@/components/robot-check";
import { resendConfirmation, signUp, type FormState } from "../actions";

export function SignUpForm({ robotKey, invite }: { robotKey: string | null; invite: { token: string; email: string; name: string | null; companyName: string | null } }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signUp, undefined);
  const [again, resend, resending] = useActionState<FormState, FormData>(resendConfirmation, undefined);

  if (state?.ok === "sent")
    return (
      <div className="space-y-4 text-sm text-slate-700">
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800">
          Almost done — we sent a link to <strong>{state.email}</strong>. Click it to confirm your email and get started.
        </p>
        <p className="text-slate-500">Nothing there in a few minutes? Check your spam folder.</p>
        <form action={resend}>
          <input type="hidden" name="email" value={state.email} />
          <button type="submit" disabled={resending} className="text-sm font-medium text-blue-700 hover:underline disabled:opacity-60">
            {resending ? "Sending…" : "Send the link again"}
          </button>
        </form>
        <FormNote error={again?.error} ok={again?.ok} />
      </div>
    );

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="invite" value={invite.token} />
      <div>
        <label className="label" htmlFor="companyName">
          Company name
        </label>
        <input
          id="companyName"
          name="companyName"
          required
          className="input"
          autoComplete="organization"
          placeholder="e.g. Smith Custom Homes"
          defaultValue={invite.companyName ?? ""}
        />
      </div>
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" required className="input" autoComplete="name" defaultValue={invite.name ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        {/* The invitation is for this email. */}
        <input id="email" name="email" type="email" required className="input bg-slate-50" autoComplete="email" value={invite.email} readOnly />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" required minLength={10} className="input" autoComplete="new-password" />
        <p className="mt-1 text-xs text-slate-500">At least 10 characters — a short sentence works well.</p>
      </div>
      <fieldset>
        <legend className="label">Cost codes</legend>
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input type="radio" name="starter" value="standard" defaultChecked className="mt-1" />
          <span>
            Start with a standard list <span className="block text-xs text-slate-500">Common residential codes — rename or remove any.</span>
          </span>
        </label>
        <label className="mt-2 flex items-start gap-2 text-sm text-slate-700">
          <input type="radio" name="starter" value="blank" className="mt-1" />
          <span>
            Start blank <span className="block text-xs text-slate-500">Add your own as you go, or bring them in from a spreadsheet.</span>
          </span>
        </label>
      </fieldset>
      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input type="checkbox" name="starterLumber" defaultChecked className="mt-1" />
        <span>
          Start with common lumber
          <span className="block text-xs text-slate-500">
            2x4–2x12, TJI, BCI, LVL and glulam sizes, plus studs, plates, sheathing and drywall for your first walls — no prices. Change or remove any.
          </span>
        </span>
      </label>
      <RobotCheck siteKey={robotKey} round={state} />
      <FormNote error={state?.error} />
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Setting up…" : "Create my company"}
      </button>
    </form>
  );
}

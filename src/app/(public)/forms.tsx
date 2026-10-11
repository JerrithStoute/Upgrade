"use client";

import { useActionState } from "react";
import { authButton, FormNote } from "@/components/auth-card";
import { RobotCheck } from "@/components/robot-check";
import { acceptInvite, confirmEmail, forgotPassword, resetPassword, type FormState } from "./actions";

export function ForgotForm({ robotKey }: { robotKey: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(forgotPassword, undefined);
  if (state?.ok) return <FormNote ok={state.ok} />;
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" required className="input" autoComplete="email" />
      </div>
      <RobotCheck siteKey={robotKey} round={state} />
      <FormNote error={state?.error} />
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Sending…" : "Email me a reset link"}
      </button>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(resetPassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input id="password" name="password" type="password" required minLength={10} className="input" autoComplete="new-password" />
        <p className="mt-1 text-xs text-slate-500">At least 10 characters — a short sentence works well.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          Type it again
        </label>
        <input id="confirm" name="confirm" type="password" required className="input" autoComplete="new-password" />
      </div>
      <FormNote error={state?.error} />
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Saving…" : "Save and sign in"}
      </button>
    </form>
  );
}

export function ConfirmForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(confirmEmail, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <FormNote error={state?.error} />
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Confirming…" : "Confirm and get started"}
      </button>
    </form>
  );
}

export function InviteForm({ token, email, name }: { token: string; email: string; name: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(acceptInvite, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label className="label">Email</label>
        <p className="text-sm font-medium text-slate-900">{email}</p>
      </div>
      <div>
        <label className="label" htmlFor="name">
          Your name
        </label>
        <input id="name" name="name" required className="input" defaultValue={name} autoComplete="name" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Choose a password
        </label>
        <input id="password" name="password" type="password" required minLength={10} className="input" autoComplete="new-password" />
        <p className="mt-1 text-xs text-slate-500">At least 10 characters — a short sentence works well.</p>
      </div>
      <FormNote error={state?.error} />
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Setting up…" : "Join"}
      </button>
    </form>
  );
}

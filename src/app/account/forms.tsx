"use client";

import { useActionState } from "react";
import { FormNote } from "@/components/auth-card";
import { changePassword, newCodes, turnOffTwoStep, type AccountState } from "./actions";

const btn = "rounded-md bg-blue-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60";
const quiet = "rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60";

export function PasswordForm() {
  const [state, action, pending] = useActionState<AccountState, FormData>(changePassword, undefined);
  return (
    <form action={action} className="grid gap-3 sm:max-w-sm">
      <div>
        <label className="label" htmlFor="current">
          Current password
        </label>
        <input id="current" name="current" type="password" required className="input" autoComplete="current-password" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input id="password" name="password" type="password" required minLength={10} className="input" autoComplete="new-password" />
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          New password again
        </label>
        <input id="confirm" name="confirm" type="password" required className="input" autoComplete="new-password" />
      </div>
      <FormNote error={state?.error} ok={state?.ok} />
      <div>
        <button type="submit" disabled={pending} className={btn}>
          {pending ? "Saving…" : "Change password"}
        </button>
      </div>
    </form>
  );
}

/** Two-step is on: new backup codes, or turn it off — each needs the password. */
export function TwoStepOnForms({ canTurnOff }: { canTurnOff: boolean }) {
  const [codesState, codesAction, codesPending] = useActionState<AccountState, FormData>(newCodes, undefined);
  const [offState, offAction, offPending] = useActionState<AccountState, FormData>(turnOffTwoStep, undefined);
  return (
    <div className="space-y-4">
      <form action={codesAction} className="flex flex-wrap items-end gap-2">
        <div>
          <label className="label" htmlFor="pw-codes">
            Your password
          </label>
          <input id="pw-codes" name="password" type="password" required className="input w-56" autoComplete="current-password" />
        </div>
        <button type="submit" disabled={codesPending} className={quiet}>
          New backup codes
        </button>
        {canTurnOff ? (
          <button type="submit" formAction={offAction} disabled={offPending} className={quiet}>
            Turn off two-step
          </button>
        ) : null}
      </form>
      <FormNote error={codesState?.error ?? offState?.error} ok={offState?.ok ?? (codesState?.codes ? codesState.ok : null)} />
      {codesState?.codes ? (
        <ul className="grid max-w-xs grid-cols-2 gap-1 rounded-md bg-slate-50 p-3 font-mono text-sm text-slate-900">
          {codesState.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

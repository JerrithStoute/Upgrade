"use client";

import Link from "@/components/link";
import { useActionState } from "react";
import { FormNote } from "@/components/auth-card";
import { RobotCheck } from "@/components/robot-check";
import { resendConfirmation, type FormState } from "../(public)/actions";
import { login, type LoginState } from "./actions";

export function LoginForm({ next, robotKey }: { next?: string; robotKey: string | null }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);
  const [again, resend, resending] = useActionState<FormState, FormData>(resendConfirmation, undefined);
  return (
    <form action={action} className="space-y-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="input" />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <label className="label" htmlFor="password">Password</label>
          <Link href="/forgot" className="text-xs font-medium text-blue-700 hover:underline">
            Forgot password?
          </Link>
        </div>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      {state?.error ? (
        <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      ) : null}
      {state?.unconfirmed ? (
        <div className="text-sm">
          <button type="submit" formAction={resend} formNoValidate disabled={resending} className="font-medium text-blue-700 hover:underline disabled:opacity-60">
            {resending ? "Sending…" : "Send the link again"}
          </button>
          <FormNote error={again?.error} ok={again?.ok} />
        </div>
      ) : null}
      {state?.check ? <RobotCheck siteKey={robotKey} round={state} /> : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

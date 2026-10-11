"use client";

import { useActionState } from "react";
import { authButton, FormNote } from "@/components/auth-card";
import { confirmTwoStepSetup, finishTwoStep, finishTwoStepSetup, type StepState } from "./actions";

export function CodeForm() {
  const [state, action, pending] = useActionState<StepState, FormData>(finishTwoStep, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="code">
          Code from your authenticator app
        </label>
        <input id="code" name="code" required autoFocus autoComplete="one-time-code" inputMode="numeric" className="input text-center text-lg tracking-[0.3em]" placeholder="123 456" />
        <p className="mt-1 text-xs text-slate-500">No phone? Type one of your backup codes instead.</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="remember" className="h-4 w-4 rounded border-slate-300" /> Remember this computer for 30 days
      </label>
      <FormNote error={state?.error} />
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}

/** Scan, type the first code, then save the backup codes (shown once). */
export function SetupForm({ qr, secret }: { qr: string; secret: string }) {
  const [state, action, pending] = useActionState<StepState, FormData>(confirmTwoStepSetup, undefined);
  if (state?.codes)
    return (
      <div className="space-y-4 text-sm text-slate-700">
        <FormNote ok="Two-step sign-in is on." />
        <p>
          <strong>Save these backup codes</strong> somewhere safe (print them, or keep them with your passwords). Each one works once, if you ever don&apos;t have your phone.
        </p>
        <ul className="grid grid-cols-2 gap-1 rounded-md bg-slate-50 p-3 font-mono text-sm text-slate-900">
          {state.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <form action={finishTwoStepSetup}>
          <button type="submit" className={authButton}>
            I saved them — continue
          </button>
        </form>
      </div>
    );
  return (
    <form action={action} className="space-y-4 text-sm text-slate-700">
      <ol className="list-decimal space-y-2 pl-5">
        <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator, 1Password…).</li>
        <li>Add an account and scan this code:</li>
      </ol>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt="QR code for your authenticator app" width={180} height={180} className="mx-auto rounded-md border border-slate-200" />
      <p className="text-center text-xs text-slate-500">
        Can&apos;t scan? Type this key instead: <span className="font-mono text-slate-700">{secret.match(/.{1,4}/g)?.join(" ")}</span>
      </p>
      <div>
        <label className="label" htmlFor="code">
          3. Type the 6-digit code it shows
        </label>
        <input id="code" name="code" required inputMode="numeric" autoComplete="one-time-code" className="input text-center text-lg tracking-[0.3em]" placeholder="123 456" />
      </div>
      <FormNote error={state?.error} />
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Checking…" : "Turn on two-step sign-in"}
      </button>
    </form>
  );
}

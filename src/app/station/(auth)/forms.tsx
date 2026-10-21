"use client";

import { useActionState } from "react";
import { authButton, FormNote } from "@/components/auth-card";
import { RobotCheck } from "@/components/robot-check";
import { confirmStationTwoStep, finishStationCode, finishStationSetup, setStationPassword, stationLogin, type StationFormState } from "./actions";

export function StationLoginForm({ robotKey }: { robotKey: string | null }) {
  const [state, action, pending] = useActionState<StationFormState, FormData>(stationLogin, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="input" />
      </div>
      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input id="password" name="password" type="password" autoComplete="current-password" required className="input" />
      </div>
      <FormNote error={state?.error} />
      {state?.check ? <RobotCheck siteKey={robotKey} round={state} /> : null}
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

export function StationCodeForm() {
  const [state, action, pending] = useActionState<StationFormState, FormData>(finishStationCode, undefined);
  return (
    <form action={action} className="space-y-4">
      <div>
        <label className="label" htmlFor="code">
          Code from your authenticator app
        </label>
        <input id="code" name="code" required autoFocus autoComplete="one-time-code" inputMode="numeric" className="input text-center text-lg tracking-[0.3em]" placeholder="123 456" />
        <p className="mt-1 text-xs text-slate-500">No phone? Type one of your backup codes instead.</p>
      </div>
      <FormNote error={state?.error} />
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}

export function StationPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<StationFormState, FormData>(setStationPassword, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="t" value={token} />
      <div>
        <label className="label" htmlFor="password">
          New password
        </label>
        <input id="password" name="password" type="password" autoComplete="new-password" required minLength={10} className="input" />
        <p className="mt-1 text-xs text-slate-500">At least 10 characters. A short sentence works well.</p>
      </div>
      <div>
        <label className="label" htmlFor="confirm">
          The same again
        </label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" required className="input" />
      </div>
      <FormNote error={state?.error} />
      <button type="submit" disabled={pending} className={authButton}>
        {pending ? "Saving…" : "Save and go on"}
      </button>
    </form>
  );
}

/** Scan, type the first code, then save the backup codes (shown once). */
export function StationSetupForm({ qr, secret }: { qr: string; secret: string }) {
  const [state, action, pending] = useActionState<StationFormState, FormData>(confirmStationTwoStep, undefined);
  if (state?.codes)
    return (
      <div className="space-y-4 text-sm text-slate-700">
        <FormNote ok="Two-step sign-in is on." />
        <p>
          <strong>Save these backup codes</strong> somewhere safe. Each one works once, if you ever don&apos;t have your phone.
        </p>
        <ul className="grid grid-cols-2 gap-1 rounded-md bg-slate-50 p-3 font-mono text-sm text-slate-900">
          {state.codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <form action={finishStationSetup}>
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
        <li>Add an account and scan this code. It shows as &ldquo;The Builder Station · Station&rdquo;, apart from any builder sign-in you have.</li>
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

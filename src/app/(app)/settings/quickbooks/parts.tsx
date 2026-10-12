"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui";
import { FormNote } from "@/components/auth-card";
import type { PasswordState } from "./actions";

/** A button that makes a Web Connector password and shows it — this once. */
export function PasswordButton({ action, children, variant = "primary" }: { action: () => Promise<PasswordState>; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  const [state, run, pending] = useActionState<PasswordState, FormData>(() => action(), undefined);
  const [copied, setCopied] = useState(false);
  if (state?.password)
    return (
      <div className="space-y-2 rounded-lg bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-inset ring-amber-200">
        <p className="flex items-center gap-2 font-medium">
          <KeyRound className="h-4 w-4" /> The Web Connector&apos;s password
        </p>
        <div className="flex items-center gap-2">
          <input readOnly value={state.password} className="input max-w-xs bg-white font-mono" onFocus={(e) => e.currentTarget.select()} aria-label="Password" />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => navigator.clipboard?.writeText(state.password!).then(() => setCopied(true), () => {})}
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />} {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <p>
          Paste it into the Web Connector&apos;s <b>Password</b> box now — it&apos;s shown only this once. Don&apos;t share it or take a picture of it. Lost it? Make a new one here.
        </p>
      </div>
    );
  return (
    <form action={run} className="space-y-2">
      <Button type="submit" variant={variant} disabled={pending}>
        {pending ? "One moment…" : children}
      </Button>
      <FormNote error={state?.error} />
    </form>
  );
}

/** A picker that saves as soon as you choose. */
export function LinkPicker({
  action,
  hidden,
  value,
  options,
  empty,
  label,
}: {
  action: (fd: FormData) => Promise<void>;
  hidden: Record<string, string>;
  value: string;
  options: { value: string; label: string }[];
  empty: string;
  label: string;
}) {
  return (
    <form action={action}>
      {Object.entries(hidden).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <select name="listId" defaultValue={value} aria-label={label} className="input !py-1.5 text-sm" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        <option value="">{empty}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  );
}

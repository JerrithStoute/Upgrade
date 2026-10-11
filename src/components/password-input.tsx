"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** A password box with an eye button to show or hide what's typed. */
export function PasswordInput({ id, name, autoComplete = "new-password", minLength }: { id: string; name: string; autoComplete?: string; minLength?: number }) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input id={id} name={name} type={shown ? "text" : "password"} required minLength={minLength} className="input pr-10" autoComplete={autoComplete} />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700"
        aria-label={shown ? "Hide password" : "Show password"}
        title={shown ? "Hide password" : "Show password"}
      >
        {shown ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

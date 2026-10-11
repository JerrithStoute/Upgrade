"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

const COOKIE = "upgrade_flash";

function readFlash() {
  const hit = document.cookie.split("; ").find((c) => c.startsWith(`${COOKIE}=`));
  if (!hit) return null;
  try {
    return decodeURIComponent(decodeURIComponent(hit.slice(COOKIE.length + 1)));
  } catch {
    return hit.slice(COOKIE.length + 1);
  }
}
const clearFlash = () => (document.cookie = `${COOKIE}=; path=/; max-age=0`);

/**
 * Shows the message a form action left when its check failed (see lib/friendly-action), and
 * stops the form from clearing — so you fix the one thing and save again. It sits over the
 * page, so nothing moves.
 */
export function ActionErrorToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    // A form action that failed must not wipe what was typed: React clears the form when its
    // action finishes — cancel that while a message is waiting.
    const keep = (e: Event) => {
      if (readFlash()) e.preventDefault();
    };
    document.addEventListener("reset", keep, true);
    const check = () => {
      const m = readFlash();
      if (!m) return;
      // Give the form's reset a moment to see it, then take it.
      setTimeout(clearFlash, 1500);
      setMessage(m);
    };
    check();
    const t = setInterval(check, 400);
    return () => {
      document.removeEventListener("reset", keep, true);
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 12000);
    return () => clearTimeout(t);
  }, [message]);

  if (!message) return null;
  return (
    <div role="alert" className="no-print fixed inset-x-0 bottom-4 z-[100] flex justify-center px-4">
      <div className="flex max-w-xl items-start gap-3 rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-2xl ring-1 ring-rose-100">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold text-rose-700">Not saved: </span>
          {message}
        </p>
        <button type="button" onClick={() => setMessage(null)} className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

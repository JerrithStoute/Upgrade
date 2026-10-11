"use client";

import { useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile — the "are you a person?" check on sign-up, forgot-password, and
 * sign-in after a few wrong tries. Usually it passes by itself without a click. It puts its
 * answer in the form (cf-turnstile-response); the server checks it (lib/turnstile.ts).
 * Shows nothing when Turnstile isn't set up (on this PC).
 *
 * `round` changes after each try (pass the form's state): every answer works only once,
 * so the check starts over.
 */

type Turnstile = {
  render(el: HTMLElement, opts: { sitekey: string; theme?: string; size?: string }): string;
  reset(id: string): void;
  remove(id: string): void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let loading: Promise<Turnstile> | null = null;
function load(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("Turnstile didn't load")));
    s.onerror = () => {
      loading = null;
      reject(new Error("Turnstile didn't load"));
    };
    document.head.appendChild(s);
  });
  return loading;
}

export function RobotCheck({ siteKey, round }: { siteKey: string | null; round?: unknown }) {
  const box = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !box.current) return;
    let gone = false;
    load()
      .then((t) => {
        if (gone || !box.current || widget.current) return;
        widget.current = t.render(box.current, { sitekey: siteKey, theme: "light", size: "flexible" });
      })
      .catch(() => {});
    return () => {
      gone = true;
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [siteKey]);

  useEffect(() => {
    if (round !== undefined && widget.current) window.turnstile?.reset(widget.current);
  }, [round]);

  if (!siteKey) return null;
  // Room saved up front, so the form doesn't jump when the check appears.
  return <div ref={box} className="min-h-[65px]" />;
}

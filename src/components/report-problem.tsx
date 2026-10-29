"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { Check, ImagePlus, MessageSquareWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reportProblem } from "@/app/account/problem-actions";
import { actionMessage } from "@/lib/action-message";

/** Opens "Report a problem" from anywhere — the "Something went wrong" page, with what it said. */
export const OPEN_REPORT = "open-report-problem";
export const openReportProblem = (said?: string) => window.dispatchEvent(new CustomEvent(OPEN_REPORT, { detail: said ?? "" }));

/**
 * The top bar's "Report a problem": say what happened, add a picture if you like (pick one, or paste a
 * screenshot), and it goes to The Builder Station with the page you're on (src/lib/problems.ts).
 */
export function ReportProblemButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [picture, setPicture] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, start] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const show = (said = "") => {
    setOpen(true);
    setSent(false);
    setError(null);
    if (said) setMessage((m) => m || `The page said: “${said}”\n\nWhat I was doing: `);
    setTimeout(() => box.current?.focus(), 0);
  };
  const pick = (f: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setPicture(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  };
  const close = () => {
    setOpen(false);
    if (sent) {
      setMessage("");
      pick(null);
    }
  };

  useEffect(() => {
    const onOpen = (e: Event) => show((e as CustomEvent<string>).detail);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener(OPEN_REPORT, onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener(OPEN_REPORT, onOpen);
      window.removeEventListener("keydown", onKey);
    };
  });

  const send = () =>
    start(async () => {
      setError(null);
      const form = new FormData();
      form.set("message", message);
      form.set("page", pathname);
      form.set("device", `${navigator.userAgent} · screen ${window.innerWidth}×${window.innerHeight}`);
      if (picture) form.set("picture", picture);
      try {
        const r = await reportProblem(form);
        if (r.ok) setSent(true);
        else setError(r.error);
      } catch (e) {
        setError(actionMessage(e, "Couldn't send it"));
      }
    });

  return (
    <>
      <button type="button" onClick={() => show()} className="rounded-md p-2 text-slate-500 hover:bg-slate-100" title="Report a problem — something not working, or confusing">
        <MessageSquareWarning className="h-4 w-4" />
        <span className="sr-only">Report a problem</span>
      </button>
      {open
        ? createPortal(
            <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:pt-20" role="dialog" aria-modal="true" aria-label="Report a problem">
              <button type="button" className="fixed inset-0 cursor-default bg-slate-900/30" aria-label="Close" onClick={close} />
              <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl">
                <div className="flex items-center border-b border-slate-200 px-4 py-3">
                  <p className="flex-1 text-sm font-semibold text-slate-900">Report a problem</p>
                  <button type="button" className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" title="Close (Esc)" onClick={close}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {sent ? (
                  <div className="space-y-3 px-4 py-6 text-center">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                      <Check className="h-5 w-5" />
                    </div>
                    <p className="text-sm font-medium text-slate-900">Thanks — it&apos;s sent.</p>
                    <p className="text-sm text-slate-600">We&apos;ll look at it, and get back to you by email if we need more.</p>
                    <Button variant="secondary" onClick={close}>
                      Close
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3 p-4">
                    <p className="text-sm text-slate-600">Something not working, or confusing? Tell us what you were doing. The page you&apos;re on is sent with it.</p>
                    <textarea
                      ref={box}
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onPaste={(e) => {
                        // A screenshot pasted in (Windows: Win+Shift+S, then Ctrl+V) becomes the picture.
                        const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
                        if (img) {
                          e.preventDefault();
                          pick(img);
                        }
                      }}
                      rows={5}
                      maxLength={4000}
                      className="input"
                      placeholder="e.g. I clicked Save on the estimate and nothing happened"
                      aria-label="What happened"
                    />
                    {preview ? (
                      <div className="flex items-start gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element -- a picture on this computer, not from the server */}
                        <img src={preview} alt="The picture you added" className="max-h-32 rounded border border-slate-200" />
                        <button type="button" className="tap rounded-md p-1 text-slate-500 hover:bg-slate-100" title="Remove the picture" onClick={() => pick(null)}>
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button type="button" className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:underline" onClick={() => fileInput.current?.click()}>
                        <ImagePlus className="h-4 w-4" /> Add a picture (or paste a screenshot)
                      </button>
                    )}
                    <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
                    {error ? <p className="text-sm text-rose-700">{error}</p> : null}
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" onClick={close}>
                        Cancel
                      </Button>
                      <Button onClick={send} disabled={busy || !message.trim()}>
                        {busy ? "Sending…" : "Send"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

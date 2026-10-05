"use client";

import { useEffect, useState } from "react";
import { Copy, Download, ExternalLink, Mail, Printer, X } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui";

/**
 * The email to a vendor, to read over before it goes: who it's to, the subject and the
 * message (all can be changed), and the files to attach — your email program can't be
 * handed attachments, so they're right here to download. "Open in my email" starts it with
 * exactly what you see; nothing is sent from here.
 */
export function EmailPreview({
  to: initialTo,
  subject: initialSubject,
  body: initialBody,
  excelHref,
  printHref,
  vendorName,
  bidNumber,
}: {
  to: string;
  subject: string;
  body: string;
  excelHref: string | null;
  printHref: string;
  vendorName: string;
  bidNumber: number;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const mailto = `mailto:${encodeURIComponent(to.trim()).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return (
    <>
      <button type="button" className={buttonClasses("ghost", "sm")} onClick={() => setOpen(true)} title="See the email before it goes">
        <Mail className="h-3.5 w-3.5" /> Email
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Email to ${vendorName}`}
            className="w-full max-w-2xl rounded-xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="text-base font-semibold text-slate-900">
                Email to {vendorName} — Bid #{bidNumber}
              </h3>
              <button type="button" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={() => setOpen(false)} aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <label className="block">
                <span className="label">To</span>
                <input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="vendor@example.com" />
                {!to.trim() ? (
                  <span className="mt-1 block text-xs text-amber-700">No email on file for {vendorName} — type it here (or fill it in your email program).</span>
                ) : null}
              </label>
              <label className="block">
                <span className="label">Subject</span>
                <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <label className="block">
                <span className="label">Message</span>
                <textarea className="input" rows={9} value={body} onChange={(e) => setBody(e.target.value)} />
              </label>
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="font-medium text-amber-900">Attach before you send</p>
                <p className="text-xs text-amber-800">Your email program can&apos;t be handed files, so download one (or both) and attach it to the email.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {excelHref ? (
                    <a href={excelHref} className={buttonClasses("secondary", "sm")}>
                      <Download className="h-3.5 w-3.5" /> Excel file (prices come back in by themselves)
                    </a>
                  ) : null}
                  <a href={printHref} target="_blank" rel="noopener" className={buttonClasses("secondary", "sm")}>
                    <Printer className="h-3.5 w-3.5" /> Print / save as PDF
                  </a>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
              <a href={mailto} className={buttonClasses("primary", "sm")} onClick={() => setOpen(false)}>
                <ExternalLink className="h-3.5 w-3.5" /> Open in my email
              </a>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${body}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* clipboard blocked: they can select the text */
                  }
                }}
              >
                <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy the email"}
              </Button>
              <span className="text-xs text-slate-500">Nothing is sent from here — your email program sends it.</span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

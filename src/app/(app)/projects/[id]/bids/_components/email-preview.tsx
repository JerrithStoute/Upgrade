"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, ExternalLink, Link2, Mail, MessageSquare, Printer, Send, Share2, X } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui";
import { actionMessage } from "@/lib/action-message";
import { saveBidMessage, sendBidEmail } from "../actions";
import { useSendHow } from "./send-how";

/**
 * The email to a vendor, to read over before it goes: who it's to, the subject and the message (all
 * can be changed). "Send" sends it from here, with the bid's Excel file attached and the list in the
 * email itself — replies come to your own email. "Open in my email" is still there, to send it yourself
 * (your email program can't be handed files, so they're right here to download and attach).
 */
export function EmailPreview({
  projectId,
  bidId,
  emailedTo,
  to: initialTo,
  subject: initialSubject,
  body: initialBody,
  excelHref,
  pdfHref,
  onlineUrl,
  vendorName,
  bidNumber,
  sub = false,
  autoOpen = false,
  phone = null,
}: {
  projectId: string;
  bidId: string;
  /** Already emailed from here (to this address), or null. */
  emailedTo: string | null;
  to: string;
  subject: string;
  body: string;
  excelHref: string | null;
  pdfHref: string | null;
  /** The vendor's link to type prices online (the sent email has it as a button). */
  onlineUrl: string;
  vendorName: string;
  bidNumber: number;
  /** A sub's bid: the plans are on its page — nothing to attach, no standard message (that's for material lists). */
  sub?: boolean;
  /** Opens by itself (Send to subs just made it). */
  autoOpen?: boolean;
  /** Their phone on file, for "Text it". */
  phone?: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(autoOpen);
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok?: string; error?: string } | null>(null);
  const [standard, setStandard] = useState<"saving" | "saved" | null>(null);
  const [how, setHow] = useSendHow();
  const [linkCopied, setLinkCopied] = useState(false);
  const [showLink, setShowLink] = useState(false);
  // The text that goes with the link, and a text message started with it (their number when on file).
  const textMessage = `${sub ? "Here are the plans for our bid" : "Here's our list for prices"} (Bid #${bidNumber}) — tap the link to ${sub ? "see the plans and send your bid" : "put your prices in"}: ${onlineUrl}`;
  const smsHref = `sms:${(phone ?? "").replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(textMessage)}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!open) return;
    // Several open at once (Send to subs): Escape closes the one on top only.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const all = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (all[all.length - 1]?.getAttribute("aria-label") === `Email to ${vendorName}`) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, vendorName]);

  // Sent yourself, the email carries the online link in its message.
  const mailBody = onlineUrl ? `${body}\n\n${sub ? "See the plans and send your bid" : "Type your prices online (the quickest way)"}: ${onlineUrl}` : body;
  const mailto = `mailto:${encodeURIComponent(to.trim()).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(mailBody)}`;

  const send = async () => {
    setSending(true);
    setResult(null);
    try {
      const r = await sendBidEmail({ projectId, bidId, to, subject, body, how });
      if ("ok" in r) {
        setResult({ ok: `Sent to ${r.to}. Their reply comes to your email.` });
        router.refresh();
      } else setResult({ error: r.error });
    } catch (e) {
      setResult({ error: actionMessage(e, "The email didn't go out") });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={buttonClasses(emailedTo ? "ghost" : "secondary", "sm")}
        onClick={() => {
          setResult(null);
          setOpen(true);
        }}
        title={emailedTo ? `Emailed to ${emailedTo} — open it to send again` : "See the email, then send it"}
      >
        <Mail className="h-3.5 w-3.5" /> {emailedTo ? "Email again" : "Email"}
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
              <button
                type="button"
                className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 px-5 py-4 text-sm">
              <label className="block">
                <span className="label">To</span>
                <input className="input" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="vendor@example.com" />
                {!to.trim() ? <span className="mt-1 block text-xs text-amber-700">No email on file for {vendorName} — type it here.</span> : null}
              </label>
              <label className="block">
                <span className="label">Subject</span>
                <input className="input" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </label>
              <div>
                <label className="block">
                  <span className="label">Message</span>
                  <textarea
                    className="input"
                    rows={9}
                    value={body}
                    onChange={(e) => {
                      setBody(e.target.value);
                      setStandard(null);
                    }}
                  />
                </label>
                {/* Like "Use as default" on change orders: your words here start every bid email. */}
                {sub ? null : (
                  <label className="mt-1 inline-flex items-center gap-1.5 text-xs text-slate-600">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-slate-300"
                      checked={standard === "saved"}
                      disabled={standard === "saved" || standard === "saving"}
                      onChange={async () => {
                        setStandard("saving");
                        try {
                          const r = await saveBidMessage({ projectId, bidId, body });
                          if ("ok" in r) setStandard("saved");
                          else {
                            setStandard(null);
                            setResult({ error: r.error });
                          }
                        } catch (e) {
                          setStandard(null);
                          setResult({ error: actionMessage(e, "Your standard message wasn't saved") });
                        }
                      }}
                    />
                    {standard === "saved" ? "Saved — every bid email starts with this message (Directory → Subs & vendors to change it)" : "Use as my standard message"}
                  </label>
                )}
              </div>
              {sub ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="font-medium text-slate-900">Sent with it: a button to see the plans and send their bid</p>
                  <p className="text-xs text-slate-600">
                    Nothing is attached — the plans open from that page. What they send comes in by itself (and goes in Files → Bids), and you get an email.
                    Replies come to your own email. It goes from bids@thebuilderstation.com, with your company&apos;s name.
                  </p>
                  <label className="mt-2 flex items-center gap-1.5 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-slate-300"
                      checked={how.copyMe}
                      onChange={(e) => setHow({ copyMe: e.target.checked })}
                    />
                    Send me a copy
                  </label>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="font-medium text-slate-900">
                    Sent with it: a button to type prices online — the Excel file and a PDF are on that page to download
                  </p>
                  <p className="text-xs text-slate-600">
                    Prices typed online come in by themselves, and you get an email. Replies come to your own email. It goes from bids@thebuilderstation.com,
                    with your company&apos;s name.
                  </p>
                  {/* Remembered on this computer — Email all goes the same way. */}
                  <div className="mt-2 space-y-1 text-xs text-slate-700">
                    <label className="flex items-start gap-1.5">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300"
                        checked={how.attach}
                        onChange={(e) => setHow({ attach: e.target.checked })}
                      />
                      <span>
                        Also attach the Excel file and PDF{" "}
                        <span className="text-slate-500">
                          — a new sender&apos;s email with files lands in fewer inboxes; leave it off unless they need them attached
                        </span>
                      </span>
                    </label>
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-slate-300"
                        checked={how.copyMe}
                        onChange={(e) => setHow({ copyMe: e.target.checked })}
                      />
                      Send me a copy
                    </label>
                  </div>
                  <p className="mt-2 text-xs text-slate-600">
                    Sending it yourself with &ldquo;Open in my email&rdquo;? The online link goes in the message; download the files here to attach them.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {excelHref ? (
                      <a href={excelHref} className={buttonClasses("secondary", "sm")}>
                        <Download className="h-3.5 w-3.5" /> Excel file (prices come back in by themselves)
                      </a>
                    ) : null}
                    {pdfHref ? (
                      <a href={pdfHref} target="_blank" rel="noopener" className={buttonClasses("secondary", "sm")}>
                        <Printer className="h-3.5 w-3.5" /> PDF (to print and fill in)
                      </a>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
            {result ? (
              <p
                className={
                  result.ok
                    ? "mx-5 mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
                    : "mx-5 mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700"
                }
              >
                {result.ok ? <Check className="mr-1 inline h-4 w-4" /> : null}
                {result.ok ?? result.error}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-3">
              <Button type="button" size="sm" disabled={sending || !to.trim() || !!result?.ok} onClick={send}>
                <Send className="h-3.5 w-3.5" /> {sending ? "Sending…" : result?.ok ? "Sent" : "Send"}
              </Button>
              <a href={mailto} className={buttonClasses("secondary", "sm")} onClick={() => setOpen(false)}>
                <ExternalLink className="h-3.5 w-3.5" /> Open in my email
              </a>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`To: ${to}\nSubject: ${subject}\n\n${mailBody}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* clipboard blocked: they can select the text */
                  }
                }}
              >
                <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy the email"}
              </Button>
              {onlineUrl ? (
                <Button
                  type="button"
                  variant={showLink ? "secondary" : "ghost"}
                  size="sm"
                  title={sub ? "The sub's link to the plans and their bid — to text them" : "The vendor's link to type prices online — to text them"}
                  onClick={() => setShowLink((v) => !v)}
                >
                  <Link2 className="h-3.5 w-3.5" /> Text the link
                </Button>
              ) : null}
              {emailedTo && !result?.ok ? <span className="text-xs text-slate-500">Already emailed to {emailedTo}.</span> : null}
            </div>
            {/* The link itself, to see — and to text: straight from a phone, or copied to paste anywhere. */}
            {onlineUrl && showLink ? (
              <div className="space-y-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-sm">
                <p className="text-xs text-slate-600">
                  {vendorName}&apos;s link — {sub ? "it opens the plans and their bid" : "it opens their prices page"}, no sign-in. Works 30 days.
                </p>
                <input
                  readOnly
                  value={onlineUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="input font-mono text-xs"
                  aria-label={`${vendorName}'s link`}
                />
                <div className="flex flex-wrap items-center gap-2">
                  {/* On a phone: opens a text to them with the link in it. */}
                  <a href={smsHref} className={buttonClasses("primary", "sm")}>
                    <MessageSquare className="h-3.5 w-3.5" /> Text it{phone ? ` to ${phone}` : ""}
                  </a>
                  {canShare ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => navigator.share({ text: textMessage }).catch(() => null)}
                      title="Your phone's share menu — Messages, WhatsApp…"
                    >
                      <Share2 className="h-3.5 w-3.5" /> Share…
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(onlineUrl);
                        setLinkCopied(true);
                        setTimeout(() => setLinkCopied(false), 2500);
                      } catch {
                        /* copying blocked: the link is in the box to select */
                      }
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" /> {linkCopied ? "Copied — paste it in your text" : "Copy the link"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500">
                  On a computer: copy it and paste it into a text (or Phone Link), or open this job on your phone and tap <b>Text it</b>.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

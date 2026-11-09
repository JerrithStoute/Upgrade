"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui";
import { SectionTitle, TermsText } from "@/components/doc-parts";
import { savePoTerms } from "../../../actions";

/**
 * Your PO terms on your copy of a PO: click to type them right here (admins). They print on every PO.
 * Empty: a dashed "Add" box that never prints, and no Terms section on the paper.
 */
export function EditablePoTerms({ projectId, poId, text }: { projectId: string; poId: string; text: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(text ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const save = () =>
    start(async () => {
      setErr(null);
      const r = await savePoTerms(projectId, poId, value);
      if (!r.ok) setErr(r.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  if (open)
    return (
      <section>
        <SectionTitle>Terms</SectionTitle>
        <div className="no-print space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
          <textarea
            className="input min-h-[7rem] text-sm leading-relaxed"
            rows={7}
            value={value}
            autoFocus
            aria-label="PO terms"
            placeholder={"Pricing\nPrices on this order are firm. Any change needs our OK before delivery.\n\nDeliveries\nShort or damaged material must be noted on the ticket."}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-slate-500">Prints on every PO. A short line on its own above a paragraph prints as its heading.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={buttonClasses("primary", "sm")} disabled={busy} onClick={save}>
              Save for every PO
            </button>
            <button
              type="button"
              className={buttonClasses("ghost", "sm")}
              disabled={busy}
              onClick={() => {
                setValue(text ?? "");
                setOpen(false);
              }}
            >
              Cancel
            </button>
            {busy ? <span className="text-xs text-slate-500">Saving…</span> : null}
          </div>
          {err ? <p className="text-xs text-rose-700">{err}</p> : null}
        </div>
      </section>
    );
  if (!text?.trim())
    return (
      <div className="no-print mt-10 flex flex-wrap items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-3 py-2.5 text-sm text-slate-500">
        <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setOpen(true)}>
          + Add PO terms
        </button>
        <span className="text-xs">Pricing, deliveries, substitutions… They print on every PO. Only you see this box.</span>
      </div>
    );
  return (
    <section>
      <SectionTitle>Terms</SectionTitle>
      <div className="group relative">
        <TermsText text={text} />
        <button
          type="button"
          className="no-print absolute -right-2 -top-2 rounded bg-white px-1.5 py-0.5 text-xs text-slate-500 opacity-70 shadow-sm ring-1 ring-slate-200 hover:text-slate-900 hover:opacity-100 group-hover:opacity-100"
          onClick={() => {
            setValue(text ?? "");
            setOpen(true);
          }}
        >
          Edit
        </button>
      </div>
    </section>
  );
}

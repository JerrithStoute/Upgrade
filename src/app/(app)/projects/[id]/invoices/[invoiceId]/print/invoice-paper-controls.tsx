"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buttonClasses } from "@/components/ui";
import { HowToPay } from "@/components/invoice-document";
import { TermsText } from "@/components/doc-parts";
import { savePaymentInstructions, setInvoiceSummary } from "../../actions";

/** "Where your contract stands" on or off for this invoice (it saves at once; nothing prints from here). */
export function SummarySwitch({ projectId, invoiceId, on }: { projectId: string; invoiceId: string; on: boolean }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300"
        checked={on}
        disabled={busy}
        onChange={(e) =>
          start(async () => {
            await setInvoiceSummary(projectId, invoiceId, e.target.checked);
            router.refresh();
          })
        }
      />
      Contract summary
    </label>
  );
}

/**
 * How to pay on your copy of the invoice: click to type it right here (admins). It prints on every
 * invoice. Empty: a dashed "Add" box that never prints.
 */
export function EditableHowToPay({ projectId, invoiceId, text, number, canEdit }: { projectId: string; invoiceId: string; text: string | null; number: number; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(text ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (!canEdit) return <HowToPay text={text} number={number} />;
  const save = () =>
    start(async () => {
      setErr(null);
      const r = await savePaymentInstructions(projectId, invoiceId, value);
      if (!r.ok) setErr(r.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  if (open)
    return (
      <HowToPay text={text} number={number}>
        <div className="no-print space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
          <textarea
            className="input min-h-[7rem] text-sm leading-relaxed"
            rows={6}
            value={value}
            autoFocus
            aria-label="How to pay"
            placeholder={"By check\nPayable to … and where to mail it\n\nBy bank transfer (ACH)\nCall the office for our bank details."}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-xs text-slate-500">Prints on every invoice. A short line on its own above a paragraph prints as its heading.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={buttonClasses("primary", "sm")} disabled={busy} onClick={save}>
              Save for every invoice
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
      </HowToPay>
    );
  if (!text?.trim())
    return (
      <>
        <div className="no-print mt-10 flex flex-wrap items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-3 py-2.5 text-sm text-slate-500">
          <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setOpen(true)}>
            + Add how to pay
          </button>
          <span className="text-xs">Check payable to, bank transfer… It prints on every invoice. Only you see this box.</span>
        </div>
        <HowToPay text={null} number={number} />
      </>
    );
  return (
    <HowToPay text={text} number={number}>
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
    </HowToPay>
  );
}

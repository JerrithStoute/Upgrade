"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Plus, SlidersHorizontal, X } from "lucide-react";
import { cn, money, num } from "@/lib/utils";
import {
  buildProposal,
  paymentSchedule,
  STARTER_PAYMENTS,
  type DocPhoto,
  type ProposalDoc,
  type ProposalExtras,
  type ProposalOptions,
  type ProposalSpec,
} from "@/lib/proposal-options";
import type { DocHead } from "@/lib/proposal-data";
import { DocFooter, DocHeader, PhotoRow, SectionTitle, SignBox, SignLine, TermsText, Th, docColors, type DocPill } from "@/components/doc-parts";
import { buttonClasses } from "@/components/ui";
import { LogoEditor } from "@/app/(app)/settings/logo-editor";
import { saveProposalOptions, saveProposalText, setProjectCover, setProposalPhotos, uploadProposalPhoto } from "../../actions";

type Cover = { url: string | null; projectName: string; address: string; clientName: string | null; date: string; logoUrl: string | null };

/**
 * The proposal, with the options that decide what the client sees beside it (the
 * options don't print): header, divisions with their categories' spec text, allowances,
 * choices and pictures, the totals, payment schedule, terms and signatures, and the
 * allowances on their own page. Changes show at once; "Save for this estimate" or
 * "Save as my default" keeps them.
 */
export function ProposalView({
  projectId,
  estimateId,
  specs,
  basePrice,
  extras,
  initial,
  isCustom,
  isAdmin,
  companyName,
  cover,
  intro,
  terms,
  head,
  issuedOn,
  decision,
  jobPhotos,
  standard,
  canEditText,
}: {
  projectId: string;
  estimateId: string;
  specs: ProposalSpec[];
  basePrice: number | null;
  /** From the estimate's Markup, Margin & Tax table. */
  extras: ProposalExtras;
  initial: ProposalOptions;
  /** This estimate has its own options (not following your default). */
  isCustom: boolean;
  isAdmin: boolean;
  companyName: string;
  cover: Cover;
  /** The estimate's notes: the proposal's introduction, under the header. */
  intro: string | null;
  /** The estimate's Terms box. */
  terms: string | null;
  head: DocHead;
  /** The proposal's date (yyyy-mm-dd) — "good for N days" counts from it. */
  issuedOn: string;
  decision: Decision;
  /** This job's pictures your client can see — to add under a category. */
  jobPhotos: DocPhoto[];
  /** Your standard introduction and terms. */
  standard: { intro: string | null; terms: string | null };
  /** May type the introduction and terms (sees costs and may change estimates). */
  canEditText: boolean;
}) {
  const router = useRouter();
  const [o, setO] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const doc = useMemo(() => buildProposal(specs, o, basePrice, extras), [specs, o, basePrice, extras]);
  const set = (fn: (p: ProposalOptions) => ProposalOptions) => {
    setO(fn);
    setDirty(true);
    setMsg(null);
  };
  const save = (scope: "estimate" | "default" | "reset") =>
    start(async () => {
      const r = await saveProposalOptions(projectId, estimateId, o, scope);
      if (!r.ok) setMsg(r.error);
      else {
        setDirty(false);
        setMsg(scope === "default" ? "Saved as your default for every proposal." : scope === "reset" ? "Back to your default." : "Saved for this estimate.");
        router.refresh();
      }
    });

  return (
    <div className="flex flex-col items-start gap-4 lg:flex-row">
      <aside className="no-print w-full shrink-0 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-[calc(4.5rem+var(--job-head,0px))] lg:max-h-[calc(100vh-5.5rem-var(--job-head,0px))] lg:w-72 lg:overflow-y-auto">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold text-slate-900">What the client sees</h2>
        </div>
        <p className="-mt-1 text-xs text-slate-500">{isCustom ? "This estimate has its own settings." : "Following your default settings."}</p>

        <Group title="Page">
          <label className="block text-sm text-slate-700">
            Heading
            <input
              className="input mt-1 !h-8 !py-0 text-xs"
              value={o.heading}
              placeholder="Proposal"
              onChange={(e) => set((p) => ({ ...p, heading: e.target.value }))}
              aria-label="Heading"
            />
          </label>
          <Check label="Cover page with a picture" checked={o.cover} onChange={(v) => set((p) => ({ ...p, cover: v }))} />
          {o.cover ? <CoverPicker projectId={projectId} url={cover.url} /> : null}
          <Check label="Title over the introduction" checked={o.intro.titled} onChange={(v) => set((p) => ({ ...p, intro: { ...p.intro, titled: v } }))} />
          <div className={cn("pl-5", !o.intro.titled && "opacity-50")}>
            <input
              className="input !h-8 !py-0 text-xs"
              value={o.intro.title}
              disabled={!o.intro.titled}
              placeholder="Notes"
              aria-label="Introduction title"
              onChange={(e) => set((p) => ({ ...p, intro: { ...p.intro, title: e.target.value } }))}
            />
          </div>
        </Group>
        <Group title="Divisions">
          <Check label="Show divisions" checked={o.categories.show} onChange={(v) => set((p) => ({ ...p, categories: { ...p.categories, show: v } }))} />
          <Check
            label="Division totals"
            checked={o.categories.subtotals}
            disabled={!o.categories.show || o.totalOnly}
            onChange={(v) => set((p) => ({ ...p, categories: { ...p.categories, subtotals: v } }))}
          />
        </Group>
        <Group title="Categories (selections / specifications)">
          <Check label="Show categories" checked={o.divisions.show} onChange={(v) => set((p) => ({ ...p, divisions: { ...p.divisions, show: v } }))} />
          <Check
            label="Prices"
            checked={o.divisions.prices}
            disabled={!o.divisions.show || o.totalOnly}
            onChange={(v) => set((p) => ({ ...p, divisions: { ...p.divisions, prices: v } }))}
          />
          <Check
            label="Specification text"
            checked={o.divisions.specText}
            disabled={!o.divisions.show}
            onChange={(v) => set((p) => ({ ...p, divisions: { ...p.divisions, specText: v } }))}
          />
          <Check label="“Allowance: $X” under allowances" checked={o.allowanceInline} onChange={(v) => set((p) => ({ ...p, allowanceInline: v }))} />
          <Check label="“Choice – To be specified by client … TBD” under selections" checked={o.selectionTbd} onChange={(v) => set((p) => ({ ...p, selectionTbd: v }))} />
        </Group>
        <Group title="Items">
          <Check label="Show items" checked={o.items.show} onChange={(v) => set((p) => ({ ...p, items: { ...p.items, show: v } }))} />
          <Check label="Qty & units" checked={o.items.qty} disabled={!o.items.show} onChange={(v) => set((p) => ({ ...p, items: { ...p.items, qty: v } }))} />
          <Check label="Prices" checked={o.items.prices} disabled={!o.items.show || o.totalOnly} onChange={(v) => set((p) => ({ ...p, items: { ...p.items, prices: v } }))} />
        </Group>
        <Group title="Totals">
          <Check label="Final total only (hide every other price)" checked={o.totalOnly} onChange={(v) => set((p) => ({ ...p, totalOnly: v }))} />
          <Check label="Allowance Summary page" checked={o.allowances} onChange={(v) => set((p) => ({ ...p, allowances: v }))} />
        </Group>
        <Group title="Profit">
          <Radio
            name="profit"
            label="Built into the prices"
            checked={o.profit.mode === "BUILT_IN"}
            onChange={() => set((p) => ({ ...p, profit: { ...p.profit, mode: "BUILT_IN" } }))}
          />
          <Radio
            name="profit"
            label="Separate fee line (prices at cost)"
            checked={o.profit.mode === "FEE"}
            onChange={() => set((p) => ({ ...p, profit: { ...p.profit, mode: "FEE" } }))}
          />
          <div className={cn("space-y-1.5 pl-5", o.profit.mode !== "FEE" && "opacity-50")}>
            <input
              className="input !h-8 !py-0 text-xs"
              value={o.profit.label}
              disabled={o.profit.mode !== "FEE"}
              aria-label="Fee line name"
              onChange={(e) => set((p) => ({ ...p, profit: { ...p.profit, label: e.target.value } }))}
            />
            <Check
              label="Show the fee %"
              checked={o.profit.showPct}
              disabled={o.profit.mode !== "FEE"}
              onChange={(v) => set((p) => ({ ...p, profit: { ...p.profit, showPct: v } }))}
            />
          </div>
        </Group>
        <Group title="Sales tax">
          <p className="text-xs text-slate-500">The tax you pay (Tax column on the estimate) is in the total either way.</p>
          <Radio name="tax" label="Built into the prices" checked={!o.tax.on} onChange={() => set((p) => ({ ...p, tax: { ...p.tax, on: false } }))} />
          <Radio name="tax" label="Its own line (prices before tax)" checked={o.tax.on} onChange={() => set((p) => ({ ...p, tax: { ...p.tax, on: true } }))} />
          <div className={cn("pl-5", !o.tax.on && "opacity-50")}>
            <input
              className="input !h-8 !py-0 text-xs"
              value={o.tax.label}
              disabled={!o.tax.on}
              aria-label="Tax line name"
              onChange={(e) => set((p) => ({ ...p, tax: { ...p.tax, label: e.target.value } }))}
            />
          </div>
        </Group>
        <Group title="Pricing">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Good for
            <input
              className="input !h-8 !w-16 !py-0 text-right text-xs"
              inputMode="numeric"
              value={o.validDays || ""}
              placeholder="—"
              aria-label="Pricing good for (days)"
              onChange={(e) => {
                const n = Math.max(0, Math.min(365, Math.round(Number(e.target.value.replace(/\D/g, "")) || 0)));
                set((p) => ({ ...p, validDays: n }));
              }}
            />
            days
          </label>
          <p className="text-xs text-slate-500">Shows &ldquo;Pricing good through (date)&rdquo; at the top. Leave it empty to leave it off.</p>
        </Group>
        <Group title="Payment schedule">
          <Check label="Show the payment schedule" checked={o.payments.show} onChange={(v) => set((p) => ({ ...p, payments: { ...p.payments, show: v } }))} />
          {o.payments.show ? <PaymentRows rows={o.payments.rows} total={doc.total} onChange={(rows) => set((p) => ({ ...p, payments: { ...p.payments, rows } }))} /> : null}
        </Group>
        <Group title="Terms & conditions">
          <Check label="Show the terms" checked={o.terms} onChange={(v) => set((p) => ({ ...p, terms: v }))} />
          <p className="text-xs text-slate-500">From the estimate&apos;s Terms box. A short line on its own above a paragraph prints as its heading.</p>
        </Group>
        <Group title="Signatures">
          <label className="block text-sm text-slate-700">
            Builder signs as
            <input
              className="input mt-1 !h-8 !py-0 text-xs"
              value={o.signer}
              placeholder={companyName}
              onChange={(e) => set((p) => ({ ...p, signer: e.target.value }))}
              aria-label="Builder signs as"
            />
          </label>
          <Check label="Client signs too" checked={o.clientSignature} onChange={(v) => set((p) => ({ ...p, clientSignature: v }))} />
        </Group>

        <div className="space-y-2 border-t border-slate-200 pt-3">
          <p className={cn("h-4 text-xs", msg && !dirty ? "text-emerald-700" : "text-amber-700")}>{msg ?? (dirty ? "Not saved yet" : "")}</p>
          <button type="button" className={cn(buttonClasses("primary", "sm"), "w-full")} disabled={!dirty || saving} onClick={() => save("estimate")}>
            Save for this estimate
          </button>
          {isAdmin ? (
            <button type="button" className={cn(buttonClasses("secondary", "sm"), "w-full")} disabled={saving} onClick={() => save("default")}>
              Save as my default
            </button>
          ) : null}
          {isCustom ? (
            <button type="button" className={cn(buttonClasses("ghost", "sm"), "w-full")} disabled={saving} onClick={() => save("reset")}>
              Use my default instead
            </button>
          ) : null}
        </div>
      </aside>

      <ProposalPaper
        doc={doc}
        o={o}
        basePrice={basePrice}
        head={{ ...head, goodThrough: o.validDays > 0 ? goodThrough(issuedOn, o.validDays) : null }}
        cover={cover}
        intro={intro}
        terms={terms}
        decision={decision}
        photoEdit={{ projectId, estimateId, jobPhotos }}
        textEdit={canEditText ? { projectId, estimateId, isAdmin, standard } : undefined}
      />
    </div>
  );
}

/** What decides how the paper reads (from the proposal's settings). */
export type PaperOptions = Pick<ProposalOptions, "cover" | "intro" | "heading" | "signer" | "clientSignature" | "payments" | "terms">;

/** The client's answer, once they've given it: their typed signature, or their decline. */
export type Decision = { kind: "APPROVED"; name: string; when: string } | { kind: "DECLINED"; when: string | null; note: string | null } | null;

/** Adding and removing a category's pictures — the builder's page only (the client's copy never has it). */
export type PhotoEdit = { projectId: string; estimateId: string; jobPhotos: DocPhoto[] };

/** Typing the introduction and terms right on the paper — the builder's page only. */
export type TextEdit = { projectId: string; estimateId: string; isAdmin: boolean; standard: { intro: string | null; terms: string | null } };

/**
 * The proposal as a document — what prints, and what the client opens in their portal.
 * It's handed the finished numbers (`doc`), never the cost lines behind them. It flows from the
 * header through the scope, totals, payment schedule and terms to the signatures (no forced page
 * breaks, so the signatures never sit alone); the allowances follow on their own page as Attachment A.
 */
export function ProposalPaper({
  doc,
  o,
  basePrice,
  head,
  cover,
  intro,
  terms,
  decision,
  photoEdit,
  textEdit,
}: {
  doc: ProposalDoc;
  o: PaperOptions;
  basePrice: number | null;
  head: DocHead;
  cover: Cover;
  intro: string | null;
  terms: string | null;
  decision?: Decision;
  photoEdit?: PhotoEdit;
  textEdit?: TextEdit;
}) {
  const kind = o.heading.trim() || "Proposal";
  const payments = o.payments.show ? paymentSchedule(doc.total, o.payments.rows) : null;
  const showTerms = o.terms && (!!terms?.trim() || !!textEdit);
  const attachment = doc.allowances.length > 0;
  return (
    <article
      className="proposal-doc mx-auto w-full min-w-0 max-w-4xl flex-1 rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
      style={docColors(head)}
    >
      {o.cover ? <CoverPage cover={cover} /> : null}
      <DocHeader
        logoUrl={head.logoUrl}
        companyName={head.companyName}
        kind={kind}
        number={head.number}
        dates={[["Issued", head.issued], ...(head.goodThrough ? [["Pricing good through", head.goodThrough] as [string, string]] : [])]}
        pill={pillFor(head, decision ?? null)}
        parties={[
          { label: "From", name: head.companyName, lines: head.from },
          { label: "Prepared for", name: head.forName, lines: head.forLines },
          { label: "Project", name: head.project, lines: head.projectLines },
        ]}
      />
      {intro?.trim() || textEdit ? (
        // The estimate's introduction opens the proposal, like a letter.
        <section className="mt-6 break-inside-avoid">
          {o.intro.titled && o.intro.title.trim() && intro?.trim() ? <h2 className="mb-1 text-sm font-semibold text-slate-700">{o.intro.title.trim()}</h2> : null}
          <EditableText field="intro" text={intro} edit={textEdit}>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{intro?.trim()}</p>
          </EditableText>
        </section>
      ) : null}

      <SectionTitle>{doc.totalOnly ? "Scope" : "Scope & pricing"}</SectionTitle>
      <ProposalBody doc={doc} basePrice={basePrice} photoEdit={photoEdit} />

      {payments && payments.rows.length ? (
        <section className="break-inside-avoid">
          <SectionTitle>Payment schedule</SectionTitle>
          <div className="grid grid-cols-[1fr_auto_auto] gap-x-6 text-sm">
            <Th>When</Th>
            <Th right>%</Th>
            <Th right>Amount</Th>
            {payments.rows.map((r, i) => (
              <Fragment key={i}>
                <span className="border-b border-slate-100 py-2">{r.label || `Payment ${i + 1}`}</span>
                <span className="border-b border-slate-100 py-2 text-right tabular-nums">{num(r.pct, 2)}%</span>
                <span className="border-b border-slate-100 py-2 text-right tabular-nums">{money(r.amount)}</span>
              </Fragment>
            ))}
            <span className="border-t-[1.5px] border-slate-900 py-2 font-semibold">Total</span>
            <span className="border-t-[1.5px] border-slate-900 py-2 text-right font-semibold tabular-nums">{num(payments.pctTotal, 2)}%</span>
            <span className="border-t-[1.5px] border-slate-900 py-2 text-right font-semibold tabular-nums">{money(payments.amountTotal)}</span>
          </div>
        </section>
      ) : null}

      {showTerms ? (
        <section>
          <SectionTitle>Terms &amp; conditions</SectionTitle>
          <EditableText field="terms" text={terms} edit={textEdit}>
            <TermsText text={terms ?? ""} />
          </EditableText>
        </section>
      ) : null}

      <Acceptance
        signer={o.signer.trim() || head.companyName}
        client={o.clientSignature ? (head.forName ?? "Client") : null}
        attachment={attachment}
        decision={decision ?? null}
      />

      <DocFooter left={head.footer} right={`${kind} ${head.number}${attachment ? " · Allowances attached" : ""}`} />

      {attachment ? (
        <section className="mt-12 break-before-page border-t border-dashed border-slate-300 pt-12 print:mt-0 print:border-0 print:pt-0">
          <div className="flex items-center justify-between gap-4 border-b-[1.5px] border-[var(--doc-accent)] pb-3 text-xs text-slate-500">
            {head.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={head.logoUrl} alt={head.companyName} className="max-h-10 max-w-[7rem] object-contain" />
            ) : (
              <span className="font-semibold text-slate-900">{head.companyName}</span>
            )}
            <span className="text-right">
              {kind} No. {head.number} · {head.project}
            </span>
          </div>
          <SectionTitle>Attachment A · Allowances</SectionTitle>
          <p className="text-sm leading-relaxed text-slate-700">
            An allowance is a budget set for something you&apos;ll pick out yourself — fixtures, cabinets, countertops and the like. The amounts below are already included in the
            proposal total.
          </p>
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-x-6 text-sm sm:grid-cols-[1fr_auto_auto]">
            <Th>Item</Th>
            <Th className="hidden sm:block">Part of</Th>
            <Th right>Allowance</Th>
            {doc.allowances.map((a) => (
              <Fragment key={a.id}>
                <span className="border-b border-slate-100 py-2.5">{a.name}</span>
                <span className="hidden border-b border-slate-100 py-2.5 text-slate-600 sm:block">{a.division}</span>
                <span className="border-b border-slate-100 py-2.5 text-right tabular-nums">{money(a.amount)}</span>
              </Fragment>
            ))}
            <span className="border-y-[1.5px] border-slate-900 py-2.5 font-semibold sm:col-span-2">Total allowances</span>
            <span className="border-y-[1.5px] border-slate-900 py-2.5 text-right font-semibold tabular-nums">{money(doc.allowancesTotal)}</span>
          </div>
          <h3 className="mt-6 text-sm font-semibold">How allowances work</h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-700">
            When you make your selections, what you pick is compared to its allowance. If it costs less, the difference is credited to you; if it costs more, the difference is billed by
            change order. Either way, you see it and approve it first.
          </p>
          <DocFooter left={head.footer} right={`${kind} ${head.number} · Attachment A`} />
        </section>
      ) : null}
    </article>
  );
}

const STATUS: Record<string, DocPill> = {
  DRAFT: { label: "Draft", tone: "draft" },
  SENT: { label: "Sent", tone: "waiting" },
  APPROVED: { label: "Approved", tone: "ok" },
  DECLINED: { label: "Declined", tone: "no" },
};

/** Draft, Sent, Approved (and the day, and "signed" once the client has), Declined. */
function pillFor(head: DocHead, decision: Decision): DocPill {
  const st = STATUS[head.status] ?? STATUS.DRAFT;
  const day = (head.status === "APPROVED" || head.status === "DECLINED") && head.decidedOn ? ` ${head.decidedOn}` : "";
  return { ...st, label: `${st.label}${day}${decision?.kind === "APPROVED" ? " · signed" : ""}` };
}

function Acceptance({ signer, client, attachment, decision }: { signer: string; client: string | null; attachment: boolean; decision: Decision }) {
  const signed = decision?.kind === "APPROVED" ? decision : null;
  return (
    <SignBox statement={`The specifications, prices and terms above${attachment ? ", including the allowances in Attachment A," : ""} are accepted.`}>
      {decision?.kind === "DECLINED" ? (
        <div className="mt-4 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <p className="font-semibold">Declined{decision.when ? ` · ${decision.when}` : ""}</p>
          {decision.note ? <p className="whitespace-pre-line">{decision.note}</p> : null}
        </div>
      ) : (
        <div className={cn("mt-5 grid grid-cols-1 gap-8", client && "sm:grid-cols-2")}>
          {client ? <SignLine who={client} signed={signed?.name} stamp={signed ? `✓ Signed online ${signed.when}` : null} /> : null}
          <SignLine who={signer} />
        </div>
      )}
    </SignBox>
  );
}

/** "Mar 3, 2026": the day `days` after `ymd` ("2026-02-01") — the panel's "Good for" shows at the top as you type. */
function goodThrough(ymd: string, days: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, (d || 1) + days).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * The introduction or terms on your page: click to type it right here, then save it for this estimate
 * or as your standard. Empty: a dashed "Add…" box (never printed), with your standard one a click away.
 */
function EditableText({ field, text, edit, children }: { field: "intro" | "terms"; text: string | null; edit?: TextEdit; children: React.ReactNode }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(text ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (!edit) return <>{children}</>;
  const name = field === "intro" ? "introduction" : "terms";
  const standard = (field === "intro" ? edit.standard.intro : edit.standard.terms)?.trim() || null;
  const save = (v: string, scope: "estimate" | "default") =>
    start(async () => {
      setErr(null);
      const r = await saveProposalText(edit.projectId, edit.estimateId, field, v, scope);
      if (!r.ok) setErr(r.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  if (open)
    return (
      <div className="no-print space-y-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
        <textarea
          className="input min-h-[8rem] text-sm leading-relaxed"
          rows={field === "terms" ? 10 : 5}
          value={value}
          autoFocus
          aria-label={field === "intro" ? "Introduction" : "Terms & conditions"}
          onChange={(e) => setValue(e.target.value)}
        />
        {field === "terms" ? <p className="text-xs text-slate-500">A short line on its own above a paragraph prints as its heading.</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={buttonClasses("primary", "sm")} disabled={busy} onClick={() => save(value, "estimate")}>
            Save for this estimate
          </button>
          {edit.isAdmin ? (
            <button type="button" className={buttonClasses("secondary", "sm")} disabled={busy} onClick={() => save(value, "default")} title={`New estimates start with this ${name}`}>
              Save as my default
            </button>
          ) : null}
          {standard && standard !== value.trim() ? (
            <button type="button" className={buttonClasses("ghost", "sm")} disabled={busy} onClick={() => setValue(standard)}>
              Use my default
            </button>
          ) : null}
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
    );
  if (!text?.trim())
    return (
      <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-3 py-2.5 text-sm text-slate-500">
        <button type="button" className="font-medium text-blue-700 hover:underline" onClick={() => setOpen(true)}>
          + Add {field === "intro" ? "an introduction" : "terms"}
        </button>
        {standard ? (
          <button type="button" className="font-medium text-blue-700 hover:underline" disabled={busy} onClick={() => save(standard, "estimate")}>
            Use my default
          </button>
        ) : null}
        <span className="text-xs">Only you see this box; it doesn&apos;t print.</span>
        {err ? <span className="text-xs text-rose-700">{err}</span> : null}
      </div>
    );
  return (
    <div className="group relative">
      {children}
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
  );
}

/** The payment schedule's rows: each payment's name and %, with what they add up to. */
function PaymentRows({ rows, total, onChange }: { rows: ProposalOptions["payments"]["rows"]; total: number; onChange: (rows: ProposalOptions["payments"]["rows"]) => void }) {
  const list = rows.length ? rows : STARTER_PAYMENTS;
  const s = paymentSchedule(total, list);
  const put = (i: number, r: Partial<(typeof list)[number]>) => onChange(list.map((x, j) => (j === i ? { ...x, ...r } : x)));
  return (
    <div className="space-y-1.5 pl-5">
      {list.map((r, i) => (
        <div key={i} className="flex items-center gap-1">
          <input className="input !h-8 min-w-0 flex-1 !py-0 text-xs" value={r.label} placeholder="When it's due" aria-label={`Payment ${i + 1}`} onChange={(e) => put(i, { label: e.target.value })} />
          <input
            className="input !h-8 !w-14 !py-0 text-right text-xs"
            inputMode="decimal"
            value={r.pct || ""}
            placeholder="%"
            aria-label={`Payment ${i + 1} percent`}
            onChange={(e) => put(i, { pct: Math.max(0, Math.min(100, Number(e.target.value.replace(/[^\d.]/g, "")) || 0)) })}
          />
          <span className="text-xs text-slate-400">%</span>
          <button type="button" className="rounded p-0.5 text-slate-400 hover:text-rose-700" aria-label={`Remove payment ${i + 1}`} onClick={() => onChange(list.filter((_, j) => j !== i))}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
      {list.length < 12 ? (
        <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline" onClick={() => onChange([...list, { label: "", pct: 0 }])}>
          <Plus className="h-3.5 w-3.5" /> Add a payment
        </button>
      ) : null}
      <p className={cn("text-xs", s.pctTotal === 100 ? "text-slate-500" : "text-amber-700")}>
        {s.pctTotal === 100 ? `Adds up to 100% — ${money(total)}.` : `Adds up to ${num(s.pctTotal, 2)}%, not 100%.`}
      </p>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-1.5">
      <legend className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</legend>
      {children}
    </fieldset>
  );
}

function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 text-sm text-slate-700", disabled && "cursor-default opacity-50")}>
      <input
        type="checkbox"
        className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-slate-300"
        checked={checked && !disabled}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function Radio({ name, label, checked, disabled, onChange }: { name: string; label: string; checked: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <label className={cn("flex cursor-pointer items-center gap-2 text-sm text-slate-700", disabled && "cursor-default")}>
      <input type="radio" name={name} className="h-3.5 w-3.5 border-slate-300" checked={checked} disabled={disabled} onChange={onChange} />
      {label}
    </label>
  );
}

/** The job's cover picture: drop or pick one, crop it, and it's saved to the job (every version uses it). */
export function CoverPicker({ projectId, url }: { projectId: string; url: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [over, setOver] = useState(false);
  const pick = (f: File | undefined | null) => {
    setErr(null);
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) return setErr("Use a PNG, JPG or WebP picture.");
    setEditing(URL.createObjectURL(f));
  };
  const upload = (file: File | null) =>
    start(async () => {
      const fd = new FormData();
      if (file) fd.set("file", file);
      const r = await setProjectCover(projectId, fd);
      if (!r.ok) setErr(r.error);
      else {
        setEditing(null);
        router.refresh();
      }
    });

  if (editing)
    return (
      <div className="-mx-1">
        <LogoEditor photo src={editing} onCancel={() => setEditing(null)} onDone={(file) => upload(file)} />
        {busy ? <p className="mt-1 text-xs text-slate-500">Saving…</p> : null}
      </div>
    );
  return (
    <div
      className={cn("rounded-lg border-2 border-dashed p-2 text-center transition-colors", over ? "border-blue-500 bg-blue-50" : "border-slate-200")}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        pick(e.dataTransfer.files[0]);
      }}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="Cover" className="mx-auto mb-2 max-h-28 rounded object-contain" />
      ) : (
        <ImagePlus className="mx-auto mb-1 h-6 w-6 text-slate-400" />
      )}
      <p className="text-xs text-slate-500">{url ? "Drop a new picture to replace it" : "Drop a picture here (e.g. a rendering of the front elevation)"}</p>
      <div className="mt-1.5 flex justify-center gap-1.5">
        <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => input.current?.click()} disabled={busy}>
          {url ? "Change" : "Choose a picture"}
        </button>
        {url ? (
          <button type="button" className={cn(buttonClasses("ghost", "sm"), "text-rose-700")} onClick={() => upload(null)} disabled={busy}>
            Remove
          </button>
        ) : null}
      </div>
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
      {err ? <p className="mt-1 text-xs text-rose-700">{err}</p> : null}
    </div>
  );
}

function CoverPage({ cover }: { cover: Cover }) {
  return (
    <section className="mb-10 break-after-page border-b border-slate-200 pb-10 print:mb-0 print:border-0 print:pb-0">
      {cover.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cover.url} alt="" className="h-[26rem] w-full rounded-lg object-cover print:h-[6.4in]" />
      ) : (
        <div className="no-print grid h-48 place-items-center rounded-lg border-2 border-dashed border-slate-200 text-sm text-slate-400">Add a cover picture in the settings</div>
      )}
      <div className="mt-8 flex items-end justify-between gap-6">
        <div>
          <p className="font-serif text-3xl">{cover.projectName}</p>
          {cover.address ? <p className="mt-1 text-slate-600">{cover.address}</p> : null}
          {cover.clientName ? <p className="mt-4 text-sm text-slate-600">Prepared for {cover.clientName}</p> : null}
          <p className="text-sm text-slate-600">{cover.date}</p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover.logoUrl ? <img src={cover.logoUrl} alt="" className="max-h-24 max-w-[14rem] object-contain" /> : null}
      </div>
    </section>
  );
}

/** Divisions as tinted bands, their categories under them with spec text, allowances, choices and pictures; then the totals. */
function ProposalBody({ doc, basePrice, photoEdit }: { doc: ProposalDoc; basePrice: number | null; photoEdit?: PhotoEdit }) {
  const footRows = !doc.totalOnly && (doc.fee || doc.tax);
  return (
    <>
      <div className="flex justify-between border-b-[1.5px] border-slate-900 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span>Description</span>
        <span>{doc.totalOnly ? "" : "Amount"}</span>
      </div>
      {doc.categories.map((c) => (
        <DivisionBlock key={c.name} doc={doc} division={c} photoEdit={photoEdit} />
      ))}

      <div className="ml-auto mt-4 w-full break-inside-avoid text-sm sm:w-80">
        {footRows ? <Row label="Subtotal" value={money(doc.subtotal)} /> : null}
        {doc.fee && !doc.totalOnly ? <Row label={`${doc.fee.label}${doc.fee.pct !== null ? ` (${num(doc.fee.pct, 1)}%)` : ""}`} value={money(doc.fee.amount)} /> : null}
        {doc.taxes.map((t, i) => (
          <Row key={i} label={`${t.label} (${num(t.pct, 3)}%)`} value={money(t.amount)} />
        ))}
        <div className="mt-1.5 flex items-baseline justify-between gap-4 border-y-slate-900 py-2.5 text-base font-bold [border-bottom:3px_double] [border-top:1.5px_solid]">
          <span>{doc.tax ? "Total" : basePrice !== null ? "Base Price" : "Total"}</span>
          <span className="tabular-nums">{money(doc.total)}</span>
        </div>
      </div>

      {doc.optional.length > 0 ? (
        <section className="break-inside-avoid">
          <SectionTitle>Not included</SectionTitle>
          {doc.optional.map((i) => (
            <div key={i.id} className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2 text-sm">
              <span>{i.description}</span>
              <span className="tabular-nums">{doc.totalOnly ? "" : money(i.amount)}</span>
            </div>
          ))}
        </section>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1 text-slate-600">
      <span>{label}</span>
      <span className="tabular-nums text-slate-900">{value}</span>
    </div>
  );
}

function DivisionBlock({ doc, division: c, photoEdit }: { doc: ProposalDoc; division: ProposalDoc["categories"][number]; photoEdit?: PhotoEdit }) {
  const visible = c.divisions.filter((d) => d.show || d.items?.length);
  if (visible.length === 0) return null;
  return (
    <div>
      {doc.showCategories ? (
        <div className="flex items-baseline justify-between gap-4 border-l-[3px] border-t border-l-[var(--doc-accent)] border-t-slate-200 bg-[var(--doc-tint)] px-3 py-2 text-[13.5px] font-bold break-after-avoid">
          <span>{c.name}</span>
          <span className="tabular-nums">{doc.showCategoryAmounts ? money(c.amount) : ""}</span>
        </div>
      ) : null}
      {visible.map((d) => (
        <CategoryBlock key={d.id} doc={doc} d={d} indent={doc.showCategories} photoEdit={photoEdit} />
      ))}
    </div>
  );
}

function CategoryBlock({ doc, d, indent, photoEdit }: { doc: ProposalDoc; d: ProposalDoc["categories"][number]["divisions"][number]; indent: boolean; photoEdit?: PhotoEdit }) {
  return (
    <div className={cn("break-inside-avoid border-b border-slate-100 py-2.5 pr-3 text-[13.5px]", indent ? "pl-7" : "pl-3")}>
      {d.show ? (
        <>
          <div className="flex items-baseline justify-between gap-4">
            <h3>{d.name}</h3>
            <span className="tabular-nums">{d.showPrice ? money(d.amount) : ""}</span>
          </div>
          {doc.showSpecText && d.specText ? <p className="mt-0.5 max-w-[40rem] whitespace-pre-line text-[12.5px] leading-relaxed text-slate-500">{d.specText}</p> : null}
          {d.allowance !== null ? (
            <span className="mt-1 inline-block rounded border border-[var(--doc-accent)] px-1.5 text-[11px] font-semibold text-[var(--doc-accent)]">Allowance {money(d.allowance)}</span>
          ) : null}
        </>
      ) : null}
      {d.items?.length ? (
        <div className={cn("mt-1 space-y-0.5", d.show && "pl-4")}>
          {d.items.map((i) => (
            <div key={i.id} className="flex items-baseline justify-between gap-4 text-[13px] text-slate-600">
              <span>
                {i.description}
                {doc.showItemQty ? (
                  <span className="ml-2 text-xs text-slate-500">
                    {num(i.quantity)} {i.unit}
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums">{doc.showItemPrices ? money(i.amount) : ""}</span>
            </div>
          ))}
        </div>
      ) : null}
      {d.tbd ? (
        <div className="mt-1 flex items-baseline justify-between gap-4 pl-4 text-[13px] text-slate-600">
          {d.choice === "DECLINED" ? (
            <>
              <span>Not wanted by client</span>
              <span className="tabular-nums">{money(0)}</span>
            </>
          ) : d.choice ? (
            <>
              <span>
                Choice – <span className="font-medium text-slate-900">{d.choice.name}</span>
              </span>
              <span className="tabular-nums">{money(d.choice.price)}</span>
            </>
          ) : (
            <>
              <span>Choice – To be specified by client</span>
              <span>TBD</span>
            </>
          )}
        </div>
      ) : null}
      {d.show ? <Photos specId={d.id} photos={d.photos} edit={photoEdit} /> : null}
    </div>
  );
}

/** The category's pictures as a row of small thumbnails (they open full size); on your page, add and remove them here. */
function Photos({ specId, photos, edit }: { specId: string; photos: DocPhoto[]; edit?: PhotoEdit }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  if (!photos.length && !edit) return null;
  const ids = photos.map((p) => p.id);
  const save = (next: string[]) =>
    start(async () => {
      setErr(null);
      const r = await setProposalPhotos(edit!.projectId, edit!.estimateId, specId, next);
      if (!r.ok) setErr(r.error);
      else router.refresh();
    });
  const upload = (f: File | undefined) => {
    if (!f) return;
    start(async () => {
      setErr(null);
      const fd = new FormData();
      fd.set("file", await smaller(f));
      const r = await uploadProposalPhoto(edit!.projectId, edit!.estimateId, specId, fd);
      if (!r.ok) setErr(r.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  };
  const others = edit?.jobPhotos.filter((p) => !ids.includes(p.id)) ?? [];
  return (
    <div className="mt-2">
      <PhotoRow photos={photos}>
        {(p) =>
          edit ? (
            <button
              type="button"
              className="no-print absolute right-1 top-1 rounded bg-white/90 px-1.5 text-xs text-rose-700 shadow ring-1 ring-slate-200 hover:bg-white"
              onClick={() => save(ids.filter((x) => x !== p.id))}
              disabled={busy}
              aria-label="Take this picture off the proposal"
              title="Take it off the proposal (it stays in the job's files)"
            >
              ✕
            </button>
          ) : null
        }
      </PhotoRow>
      {edit ? (
        <div className="no-print">
          <button
            type="button"
            className="mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-800"
            onClick={() => setOpen((v) => !v)}
          >
            <ImagePlus className="h-3.5 w-3.5" /> Picture
          </button>
          {open ? (
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={buttonClasses("secondary", "sm")} onClick={() => input.current?.click()} disabled={busy}>
                  Upload a picture
                </button>
                <span className="text-xs text-slate-500">or pick one of this job&apos;s photos your client can see:</span>
                <button type="button" className="ml-auto text-xs text-slate-500 hover:text-slate-800" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
              <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => upload(e.target.files?.[0])} />
              {others.length ? (
                <div className="mt-2 flex max-h-56 flex-wrap gap-2 overflow-y-auto">
                  {others.map((p) => (
                    <button key={p.id} type="button" className="w-20" onClick={() => save([...ids, p.id])} disabled={busy} title={p.caption ?? "Add this picture"}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt={p.caption ?? ""} className="aspect-[4/3] w-full rounded border border-slate-200 object-cover hover:ring-2 hover:ring-blue-500" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">No photos on this job yet — upload one above.</p>
              )}
              {busy ? <p className="mt-1 text-xs text-slate-500">Saving…</p> : null}
            </div>
          ) : null}
          {err ? <p className="mt-1 text-xs text-rose-700">{err}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/** A big phone photo made smaller before it's sent (the proposal shows it small, and the PDF stays light to email). */
async function smaller(f: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    if (k === 1 && f.size < 1.5 * 1024 * 1024) return f;
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * k);
    c.height = Math.round(bmp.height * k);
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
    return blob ? new File([blob], f.name.replace(/\.[a-z0-9]+$/i, "") + ".jpg", { type: "image/jpeg" }) : f;
  } catch {
    return f;
  }
}

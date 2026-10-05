"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, SlidersHorizontal } from "lucide-react";
import { cn, money, num, fmtDate } from "@/lib/utils";
import { buildProposal, type ProposalDoc, type ProposalExtras, type ProposalOptions, type ProposalSpec } from "@/lib/proposal-options";
import { buttonClasses } from "@/components/ui";
import { LogoEditor } from "@/app/(app)/settings/logo-editor";
import { saveProposalOptions, setProjectCover } from "../../actions";
import { addDays } from "date-fns";

type Cover = { url: string | null; projectName: string; address: string; clientName: string | null; date: string; logoUrl: string | null };

/**
 * The proposal, with the options that decide what the client sees beside it (the
 * options don't print). Laid out the way your CoConstruct proposals read: logo and
 * RE: block, divisions with their categories' spec text, "Allowance: $X", "Option –
 * To be specified by client … TBD", the base price, an Allowance Summary page and
 * signatures. Changes show at once; "Save for this estimate" or "Save as my
 * default" keeps them.
 */
export function ProposalView({
  projectId,
  estimateId,
  specs,
  basePrice,
  extras,
  initial,
  isCustom,
  pricedOn,
  isAdmin,
  companyName,
  cover,
  header,
  footer,
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
  /** The proposal's date (yyyy-mm-dd) — "good for N days" counts from it. */
  pricedOn: string;
  isAdmin: boolean;
  companyName: string;
  cover: Cover;
  header: React.ReactNode;
  footer: React.ReactNode;
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
        <p className="-mt-1 text-xs text-slate-500">{isCustom ? "This estimate has its own options." : "Following your default options."}</p>

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
          <Check label="“Option – To be specified by client … TBD” under selections" checked={o.selectionTbd} onChange={(v) => set((p) => ({ ...p, selectionTbd: v }))} />
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
        <Group title="Tax">
          <p className="text-xs text-slate-500">Tax comes from the estimate&apos;s Markup, Margin &amp; Tax table — each tax row shows as its own line here.</p>
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
          <p className="text-xs text-slate-500">Prints &ldquo;Pricing … is good for N days, through (date)&rdquo; above the signatures. Leave it empty to leave it off.</p>
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

      <article className="proposal-doc mx-auto w-full min-w-0 max-w-4xl flex-1 rounded-xl border border-slate-200 bg-white p-10 text-slate-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        {o.cover ? <CoverPage cover={cover} /> : null}
        {/* Wrapped so the server-made header/footer are each an only child (no key needed). */}
        <div>{header}</div>
        <ProposalBody doc={doc} heading={o.heading || "Proposal"} basePrice={basePrice} />
        <div>{footer}</div>
        {o.validDays > 0 ? (
          <p className="mt-10 text-sm text-slate-700 break-inside-avoid">
            Pricing in this proposal is good for {o.validDays} days, through {fmtDate(addDays(localDay(pricedOn), o.validDays))}.
          </p>
        ) : null}
        <Signatures signer={o.signer.trim() || companyName} client={o.clientSignature ? (cover.clientName ?? "Client") : null} />
      </article>
    </div>
  );
}

/** "2026-10-04" as that day on this computer (no time-zone shift). */
function localDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
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
function CoverPicker({ projectId, url }: { projectId: string; url: string | null }) {
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
        <div className="no-print grid h-48 place-items-center rounded-lg border-2 border-dashed border-slate-200 text-sm text-slate-400">Add a cover picture in the options</div>
      )}
      <div className="mt-8 flex items-end justify-between gap-6">
        <div>
          <p className="text-3xl font-bold tracking-tight">{cover.projectName}</p>
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

/** Divisions → categories with their spec text, allowance and TBD lines, then the totals and the Allowance Summary. */
function ProposalBody({ doc, heading, basePrice }: { doc: ProposalDoc; heading: string; basePrice: number | null }) {
  const footRows = !doc.totalOnly && (doc.fee || doc.tax);
  return (
    <>
      <h2 className="mt-10 text-3xl font-bold tracking-tight">{heading}</h2>
      <div className="mt-4 border-t border-slate-300">
        {doc.categories.map((c) => (
          <DivisionBlock key={c.name} doc={doc} division={c} />
        ))}
      </div>

      <div className="mt-8 break-inside-avoid">
        {footRows ? <Row label="Subtotal" value={money(doc.subtotal)} /> : null}
        {doc.fee && !doc.totalOnly ? <Row label={`${doc.fee.label}${doc.fee.pct !== null ? ` (${num(doc.fee.pct, 1)}%)` : ""}`} value={money(doc.fee.amount)} /> : null}
        {doc.taxes.map((t, i) => (
          <Row key={i} label={`${t.label} (${num(t.pct, 3)}%)`} value={money(t.amount)} />
        ))}
        <div className="flex items-baseline justify-between gap-4 border-y border-slate-300 py-3 text-base font-bold">
          <span>{doc.tax ? "Total" : basePrice !== null ? "Base Price" : "Total"}</span>
          <span className="tabular-nums">{money(doc.total)}</span>
        </div>
      </div>

      {doc.allowances.length > 0 ? (
        <section className="mt-12 break-before-page print:mt-0">
          <h2 className="text-3xl font-bold tracking-tight">Allowance Summary</h2>
          <div className="mt-4 border-t border-slate-300">
            {doc.allowances.map((a) => (
              <div key={a.id} className="flex items-baseline justify-between gap-4 border-b border-slate-200 py-2.5 text-sm">
                <span>{a.name}</span>
                <span className="tabular-nums">{money(a.amount)}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-baseline justify-between gap-4 border-y border-slate-300 py-2.5 text-sm font-bold">
            <span>Total Allowance Items</span>
            <span className="tabular-nums">{money(doc.allowancesTotal)}</span>
          </div>
          <p className="mt-2 text-xs text-slate-500">These amounts are included above. Final cost is adjusted to the selections you make; any difference is credited or billed.</p>
        </section>
      ) : null}

      {doc.optional.length > 0 ? (
        <section className="mt-10 break-inside-avoid">
          <h3 className="text-lg font-semibold">Options not included</h3>
          <div className="mt-2 border-t border-slate-300">
            {doc.optional.map((i) => (
              <div key={i.id} className="flex items-baseline justify-between gap-4 border-b border-slate-200 py-2 text-sm">
                <span>{i.description}</span>
                <span className="tabular-nums">{doc.totalOnly ? "" : money(i.amount)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 py-2 text-sm text-slate-700">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function DivisionBlock({ doc, division: c }: { doc: ProposalDoc; division: ProposalDoc["categories"][number] }) {
  const visible = c.divisions.filter((d) => d.show || d.items?.length);
  if (!doc.showCategories && visible.length === 0) return null;
  return (
    <div>
      {doc.showCategories ? (
        <div className="flex items-baseline justify-between gap-4 border-b border-slate-300 py-3 font-semibold break-after-avoid">
          <span>{c.name}</span>
          <span className="tabular-nums">{doc.showCategoryAmounts ? money(c.amount) : ""}</span>
        </div>
      ) : null}
      {visible.map((d) => (
        <CategoryBlock key={d.id} doc={doc} d={d} indent={doc.showCategories} />
      ))}
    </div>
  );
}

function CategoryBlock({ doc, d, indent }: { doc: ProposalDoc; d: ProposalDoc["categories"][number]["divisions"][number]; indent: boolean }) {
  return (
    <div className={cn("break-inside-avoid border-b border-slate-200 py-4", indent && "pl-8")}>
      {d.show ? (
        <>
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="font-semibold">{d.name}</h3>
            <span className="text-sm tabular-nums">{d.showPrice ? money(d.amount) : ""}</span>
          </div>
          {doc.showSpecText && d.specText ? <p className="mt-2 max-w-[40rem] whitespace-pre-line text-sm leading-relaxed text-slate-700">{d.specText}</p> : null}
        </>
      ) : null}
      {d.items?.length ? (
        <div className={cn("mt-2 space-y-0.5", d.show && "pl-4")}>
          {d.items.map((i) => (
            <div key={i.id} className="flex items-baseline justify-between gap-4 text-[13px] text-slate-700">
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
      {d.allowance !== null ? <p className="mt-3 text-sm">Allowance: {money(d.allowance)}</p> : null}
      {d.tbd ? (
        <div className="mt-2 flex items-baseline justify-between gap-4 pl-8 text-sm text-slate-700">
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
              <span>Option – To be specified by client</span>
              <span>TBD</span>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Signatures({ signer, client }: { signer: string; client: string | null }) {
  const line = (who: string) => (
    <div className="grid grid-cols-[1fr_12rem] gap-6">
      <div>
        <div className="h-10 border-b border-slate-400" />
        <p className="mt-1 text-sm text-slate-700">{who}</p>
      </div>
      <div>
        <div className="h-10 border-b border-slate-400" />
        <p className="mt-1 text-sm text-slate-700">Date</p>
      </div>
    </div>
  );
  return (
    <section className="mt-12 break-inside-avoid">
      <h3 className="text-xl font-medium">Signatures</h3>
      <div className="mt-4 space-y-6">
        {line(`Builder: ${signer}`)}
        {client ? line(`Client: ${client}`) : null}
      </div>
    </section>
  );
}

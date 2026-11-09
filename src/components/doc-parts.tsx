import { cn } from "@/lib/utils";
import { termsBlocks } from "@/lib/proposal-options";

/**
 * The pieces every client document is made of (the proposal, change orders), so they read as a set:
 * the header with your logo, number, dates and status; From / Prepared for / Project; section titles;
 * table headings; terms; signature lines; the footer. Colors come from the company's main color
 * (documentColors) through the --doc-accent and --doc-tint variables set by `docColors`.
 */

/** The style that colors a document: put it on its outermost element. */
export const docColors = (c: { accent: string; tint: string }) => ({ "--doc-accent": c.accent, "--doc-tint": c.tint }) as React.CSSProperties;

export type DocPill = { label: string; tone: "draft" | "waiting" | "ok" | "no" | "void" };
const PILL: Record<DocPill["tone"], string> = {
  draft: "bg-slate-100 text-slate-600",
  waiting: "bg-amber-50 text-amber-800",
  ok: "bg-emerald-50 text-emerald-800",
  no: "bg-rose-50 text-rose-800",
  void: "bg-slate-100 text-slate-500",
};

export type DocParty = { label: string; name: string | null; lines: string[] };

/** Logo, what it is and its number, its dates and where it stands; then who it's from and for, and the job. */
export function DocHeader({
  logoUrl,
  companyName,
  kind,
  number,
  dates,
  pill,
  parties,
}: {
  logoUrl: string | null;
  companyName: string;
  kind: string;
  number: string;
  /** [label, value] — "Issued", "Aug 1, 2026". */
  dates: [string, string][];
  pill: DocPill;
  parties: DocParty[];
}) {
  return (
    <header className="break-inside-avoid">
      <div className="flex flex-wrap items-start justify-between gap-6">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={companyName} className="max-h-28 max-w-[15rem] object-contain" />
        ) : (
          <p className="font-serif text-3xl font-bold text-[var(--doc-accent)]">{companyName}</p>
        )}
        <div className="text-left sm:text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">{kind}</p>
          <p className="font-serif text-3xl leading-tight">No. {number}</p>
          {dates.length ? (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              {dates.map(([label, value]) => (
                <span key={label} className="block">
                  {label} <span className="text-slate-900">{value}</span>
                </span>
              ))}
            </p>
          ) : null}
          <span className={cn("mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider", PILL[pill.tone])}>{pill.label}</span>
        </div>
      </div>
      <div className="mt-6 h-[3px] bg-[var(--doc-accent)]" />
      <div className="mt-[3px] h-px bg-[var(--doc-accent)] opacity-35" />
      <div className="grid grid-cols-1 gap-5 py-5 text-[13px] leading-relaxed text-slate-600 sm:grid-cols-3 sm:gap-7">
        {parties.map((p) => (
          <Party key={p.label} {...p} />
        ))}
      </div>
    </header>
  );
}

function Party({ label, name, lines }: DocParty) {
  if (!name && lines.length === 0) return <div />;
  return (
    <div className="min-w-0 break-words">
      <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.16em] text-[var(--doc-accent)]">{label}</p>
      {name ? <p className="font-semibold text-slate-900">{name}</p> : null}
      {lines.map((l, i) => (
        <p key={i}>{l}</p>
      ))}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 mt-10 flex items-baseline gap-3 font-serif text-xl break-after-avoid after:h-px after:flex-1 after:bg-slate-200 after:content-['']">{children}</h2>
  );
}

/** A small uppercase column heading over a heavy rule. */
export function Th({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return (
    <span className={cn("border-b-[1.5px] border-slate-900 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500", right && "text-right", className)}>
      {children}
    </span>
  );
}

/**
 * Terms as written, made easy to read: paragraphs stay as typed, and a short line on its own just
 * above a paragraph (no period at its end) prints as that paragraph's heading.
 */
export function TermsText({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-slate-700">
      {termsBlocks(text).map((b, i) => (
        <div key={i} className="break-inside-avoid">
          {b.title ? <h3 className="text-[13.5px] font-semibold text-slate-900">{b.title}</h3> : null}
          {b.body ? <p className="whitespace-pre-line">{b.body}</p> : null}
        </div>
      ))}
    </div>
  );
}

/** The accepted-by box: what's being accepted, then the signature lines (or what's in their place). */
export function SignBox({ statement, children }: { statement: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 break-inside-avoid rounded-lg border border-slate-200 px-6 py-5">
      <p className="text-sm font-semibold">{statement}</p>
      {children}
    </section>
  );
}

/** One signature line: the name signed (once they have), who it is under it, and when. */
export function SignLine({ who, sub, signed, stamp, declined }: { who: string; sub?: string | null; signed?: string | null; stamp?: string | null; declined?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex h-14 items-end border-b border-slate-900 pb-1">
        {signed ? <span className="truncate text-2xl leading-none text-[#1b2a4a] [font-family:'Segoe_Script','Brush_Script_MT',cursive]">{signed}</span> : null}
      </div>
      <div className="mt-1 flex justify-between gap-3 text-xs text-slate-500">
        <span>
          <span className="font-semibold text-slate-900">{who}</span>
          {sub ? <span className="ml-1.5">{sub}</span> : null}
        </span>
        {stamp ? null : <span>Date</span>}
      </div>
      {stamp ? <p className={cn("mt-0.5 text-[11.5px]", declined ? "text-rose-700" : "text-emerald-700")}>{stamp}</p> : null}
    </div>
  );
}

export function DocFooter({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-10 flex flex-wrap justify-between gap-2 border-t border-slate-200 pt-2 text-[11px] text-slate-500">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

/** A row of small pictures that open full size. */
export function PhotoRow({ photos, children }: { photos: { id: string; url: string; caption: string | null }[]; children?: (p: { id: string }) => React.ReactNode }) {
  if (!photos.length) return null;
  return (
    <div className="flex flex-wrap gap-2.5">
      {photos.map((p) => (
        <figure key={p.id} className="relative m-0 w-[132px] max-w-[45%] print:w-[1.2in]">
          <a href={`${p.url}?open=1`} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption ?? ""} className="block aspect-[4/3] w-full rounded border border-slate-200 object-cover" />
          </a>
          {p.caption ? <figcaption className="mt-0.5 text-[11px] leading-tight text-slate-500">{p.caption}</figcaption> : null}
          {children?.(p)}
        </figure>
      ))}
    </div>
  );
}

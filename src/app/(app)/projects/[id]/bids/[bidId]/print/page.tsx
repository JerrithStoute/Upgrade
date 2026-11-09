import Link from "@/components/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { getBrand } from "@/lib/company-brand";
import { documentColors } from "@/lib/brand-style";
import { cn, fmtDate, num } from "@/lib/utils";
import { buttonClasses } from "@/components/ui";
import { DocFooter, DocHeader, SectionTitle, docColors } from "@/components/doc-parts";
import { isLadderLine } from "@/lib/bids";
import { asSent } from "@/lib/bid-beams";
import { PrintButton } from "../../../_components/print-button";

export const metadata = { title: "Request for prices" };

const UNIT_WORDS: Record<string, string> = {
  ea: "each",
  lf: "per lf",
  sf: "per sf",
  sy: "per sy",
  cy: "per cy",
  bf: "per bf",
  hr: "per hour",
  day: "per day",
  sq: "per square",
  ls: "lump sum",
  gal: "per gal",
  lb: "per lb",
  ton: "per ton",
};

const cityLine = (c: { city: string | null; state: string | null; zip: string | null } | null | undefined) =>
  c ? [[c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : "";

/** A blank for the vendor's price: "$ ____ each". */
function Blank({ unit }: { unit: string }) {
  return (
    <span className="flex min-w-[4.5rem] items-end gap-1 border-b border-slate-400 pb-px text-[10px] text-slate-400">
      $<span className="flex-1" />
      {unit}
    </span>
  );
}

/**
 * A bid as a sheet to print or save as PDF, in the same look as your proposals, POs and invoices: what
 * you need priced (Material list items with their quantities, or a sub's trades and the plans to price
 * from), a blank price beside each, your other lengths to price, and "Your quote" for how long their prices
 * hold. Their prices are typed in afterwards with "Prices" on the bid (or they send them online).
 */
export default async function BidPrintPage({ params }: { params: Promise<{ id: string; bidId: string }> }) {
  await requireView("estimates", { costs: "/dashboard" });
  const { id, bidId } = await params;
  const project = await getProject(id);
  const [bid, company, brand] = await Promise.all([
    db.bid.findFirst({ where: { id: bidId, projectId: project.id }, include: { lines: { orderBy: { sortOrder: "asc" } }, vendor: true } }),
    db.company.findFirst(),
    getBrand(),
  ]);
  if (!bid) notFound();
  const sub = bid.kind === "SUB";
  const items = bid.lines.filter((l) => !isLadderLine(l));
  const ladder = bid.lines.filter(isLadderLine);
  const codes = Array.from(new Map(items.map((l) => [l.codeKey, l.codeLabel])).entries());
  const planIds: string[] = (() => {
    try {
      const v = bid.planFileIds ? JSON.parse(bid.planFileIds) : [];
      return Array.isArray(v) ? v.map(String) : [];
    } catch {
      return [];
    }
  })();
  const plans = sub && planIds.length ? await db.fileAsset.findMany({ where: { id: { in: planIds }, projectId: project.id }, select: { id: true, name: true } }) : [];
  const companyName = company?.name ?? "Your Company";
  const v = bid.vendor;
  const site = [project.address, cityLine(project)].filter(Boolean).join(", ");
  const received = bid.status === "RECEIVED";
  const head = "border-b-[1.5px] border-slate-900 pb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-500";
  const cell = "border-b border-slate-100 py-2.5 align-bottom";

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href={`/projects/${project.id}/bids#bids`} className={buttonClasses("ghost", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Send to vendors
        </Link>
        <span className="text-sm text-slate-500">In the print window, choose &ldquo;Save as PDF&rdquo; to attach it to an email.</span>
        <span className="ml-auto">
          <PrintButton />
        </span>
      </div>

      <article
        className="proposal-doc mx-auto w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-sm sm:p-12 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
        style={docColors(documentColors(brand.color))}
      >
        <DocHeader
          logoUrl={brand.logoUrl}
          companyName={companyName}
          kind="Request for prices"
          number={`${bid.number}`}
          dates={[["Sent", fmtDate(bid.sentAt)], ...(bid.dueAt ? [["Prices needed by", fmtDate(bid.dueAt)] as [string, string]] : [])]}
          pill={received ? { label: "Prices in", tone: "ok" } : { label: "Waiting on your prices", tone: "waiting" }}
          parties={[
            { label: "From", name: companyName, lines: [company?.address, cityLine(company), company?.phone, company?.email].filter((x): x is string => !!x) },
            { label: "To", name: bid.vendorName, lines: v ? [v.contact, v.phone, v.email].filter((x): x is string => !!x) : [] },
            { label: "Job", name: project.name, lines: [site, `Job #${project.number}`].filter(Boolean) },
          ]}
        />

        {bid.notes ? <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{bid.notes}</p> : null}
        <p className="mt-2 text-xs text-slate-500">
          Write your prices in and email this back{company?.email ? (
            <>
              {" "}
              to <b className="text-slate-900">{company.email}</b>
            </>
          ) : null}
          , or use the link in our email.
        </p>

        {sub ? (
          <>
            {plans.length ? (
              <>
                <SectionTitle>Plans to price from</SectionTitle>
                <p className="text-[13.5px]">
                  {plans.map((p) => p.name).join(" · ")} <span className="text-xs text-slate-500">(open them from the link in our email)</span>
                </p>
              </>
            ) : null}
            <SectionTitle>Trades</SectionTitle>
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 text-[13.5px] sm:grid-cols-[1fr_auto_10rem]">
              <span className={head}>Trade</span>
              <span className={head}>Your price</span>
              <span className={cn(head, "hidden sm:block")}>Includes / excludes</span>
              {items.map((l) => (
                <div key={l.id} className="contents">
                  <span className={cell}>{l.name}</span>
                  <span className={cell}>
                    <Blank unit="lump sum" />
                  </span>
                  <span className={cn(cell, "hidden sm:block")}>
                    <span className="block h-[18px] border-b border-slate-200" />
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <SectionTitle>Items</SectionTitle>
            <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 text-[13.5px] sm:grid-cols-[1fr_auto_auto_auto_9rem]">
              <span className={head}>Item</span>
              <span className={cn(head, "text-right")}>Qty</span>
              <span className={cn(head, "hidden sm:block")}>Unit</span>
              <span className={head}>Your price</span>
              <span className={cn(head, "hidden sm:block")}>Substitute / note</span>
              {codes.map(([key, label]) => (
                <div key={key} className="contents">
                  <span className="col-span-full mt-0 border-l-[3px] border-l-[var(--doc-accent)] bg-[var(--doc-tint)] px-2.5 py-1.5 text-[13px] font-bold break-after-avoid">{label}</span>
                  {items
                    .filter((l) => l.codeKey === key)
                    .map((l) => {
                      const s = asSent(l);
                      return (
                        <div key={l.id} className="contents">
                          <span className={cn(cell, "pl-3")}>
                            {l.name}
                            {l.sku ? <span className="block text-[11.5px] text-slate-500">SKU {l.sku}</span> : null}
                          </span>
                          <span className={cn(cell, "text-right font-medium tabular-nums")}>
                            {num(s.quantity)}
                            <span className="ml-1 text-xs font-normal text-slate-500 sm:hidden">{s.unit}</span>
                          </span>
                          <span className={cn(cell, "hidden text-slate-600 sm:block")}>{s.unit}</span>
                          <span className={cell}>
                            <Blank unit={s.len ? "per beam" : (UNIT_WORDS[l.unit] ?? `per ${l.unit}`)} />
                          </span>
                          <span className={cn(cell, "hidden sm:block")}>
                            <span className="block h-[18px] border-b border-slate-200" />
                          </span>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {items.length} item{items.length === 1 ? "" : "s"} · quantities include waste · if you&apos;d quote a different product, note it next to the item.
            </p>
            {ladder.length ? (
              <section className="break-inside-avoid">
                <SectionTitle>Price list — other lengths</SectionTitle>
                <p className="text-xs text-slate-500">No quantity — just your price per board, so we can order the lengths that cost least.</p>
                <div className="mt-2 grid grid-cols-1 gap-x-8 sm:grid-cols-3">
                  {ladder.map((l) => (
                    <div key={l.id} className="flex items-end gap-2 py-1.5 text-[13.5px]">
                      <span className="w-24 shrink-0">{l.name}</span>
                      <span className="flex-1">
                        <Blank unit="each" />
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}

        <section className="mt-10 break-inside-avoid rounded-lg border border-slate-200 px-6 py-5">
          <p className="text-sm font-semibold">Your quote</p>
          <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-5 text-xs text-slate-500 sm:grid-cols-2">
            {["Prices good through", sub ? "Start date you can make" : "Delivery charge (if any)", "Quoted by", "Date"].map((label) => (
              <div key={label}>
                <div className="h-9 border-b border-slate-900" />
                <p className="mt-1">{label}</p>
              </div>
            ))}
          </div>
        </section>

        <DocFooter left={[companyName, company?.phone, company?.website].filter(Boolean).join(" · ")} right={`Request for prices No. ${bid.number} · Job #${project.number}`} />
      </article>
    </div>
  );
}

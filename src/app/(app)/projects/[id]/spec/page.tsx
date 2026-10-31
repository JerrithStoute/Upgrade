import { Fragment } from "react";
import { addDays } from "date-fns";
import { AlertTriangle, Calculator, Home, Pencil } from "lucide-react";
import Link from "@/components/link";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { specPicture } from "@/lib/spec";
import { carryToClosing, daysOnMarket, futureDrawInterest, offerMath, priceForProfit } from "@/lib/spec-math";
import { cn, costCodeLabel, dateInput, fmtDate, lineCost, money } from "@/lib/utils";
import { Badge, Button, ConfirmForm, SubmitButton } from "@/components/ui";
import { Tile } from "@/components/ui/tile";
import { CarryingForm } from "./carrying-form";
import { addCarrying, addLoanEntry, deleteCarrying, deleteLoanEntry, markSold, saveListing, setOfferStatus, setSpec, unmarkSold, updateCarrying } from "./actions";
import { ClosingLinesEditor } from "./closing-lines";
import { LoanEntryForm } from "./loan-entry-form";

const FREQ: Record<string, string> = { MONTHLY: "a month", YEARLY: "a year", ONCE: "once" };
const ENTRY: Record<string, string> = { DRAW: "Draw", PAYDOWN: "Paydown", RATE: "Rate change", ACTUAL: "Bank's interest" };
const OFFER_STATUS: Record<string, string> = { OPEN: "Open", COUNTERED: "Countered", ACCEPTED: "Accepted", REJECTED: "Rejected" };

const small = "!h-7 !px-2.5 !text-xs";
const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
const head = "flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-2.5";
const editLink = "inline-flex shrink-0 items-center gap-1 text-xs font-medium text-blue-700 hover:underline";
const plainBtn = "inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
// The forms here, at the size of the rest of the page.
const compact = "[&_.input]:!h-8 [&_.input]:!py-0 [&_.input]:text-sm [&_.label]:!normal-case [&_.label]:!tracking-normal";

/** A label and its value, like a sub's or client's page. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 border-t border-slate-100 py-1.5 text-sm first:border-t-0">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-slate-900">{children || <span className="text-slate-300">—</span>}</span>
    </div>
  );
}

/** The same row in Edit: the label, then its box. */
function EditRow({ label, top, children }: { label: string; top?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "grid gap-2 border-t border-slate-100 py-1 text-sm first:border-t-0",
        // A list (closing costs) goes under its label on a phone, where there's no room beside it.
        top ? "grid-cols-1 items-start sm:grid-cols-[7.5rem_minmax(0,1fr)]" : "grid-cols-[7.5rem_minmax(0,1fr)] items-center",
      )}
    >
      <span className={cn("text-slate-500", top && "pt-1.5")}>{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function MoneyBox({ name, label, defaultValue }: { name: string; label: string; defaultValue: string | number }) {
  return (
    <span className="relative inline-block w-32 align-middle">
      <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-sm text-slate-400">$</span>
      <input name={name} inputMode="decimal" defaultValue={defaultValue} aria-label={label} className="input !pl-6 text-right" />
    </span>
  );
}

function PctBox({ name, label, defaultValue }: { name: string; label: string; defaultValue: string | number }) {
  return (
    <span className="relative inline-block w-20 align-middle">
      <input name={name} inputMode="decimal" defaultValue={defaultValue} aria-label={label} className="input !pr-7 text-right" />
      <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-sm text-slate-400">%</span>
    </span>
  );
}

/**
 * A spec house: its listing, what it costs to hold, offers, and selling it. Each box shows its facts; Edit (and
 * Update, Mark sold…) opens the fields right there — ?edit=, ?offer=, ?sold= in the address — and saving closes it.
 */
export default async function SpecSalePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; offer?: string; sold?: string }> }) {
  const user = await requireView("budget");
  const canEdit = user.role === "ADMIN" || allows(user.access, "budget", 2);
  const { id } = await params;
  const q = await searchParams;
  const project = await getProject(id);
  if (!project.isSpec)
    return (
      <section className={card}>
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <Home className="h-8 w-8 text-slate-400" />
          <p className="font-medium text-slate-800">This job isn&apos;t marked as a spec house</p>
          <p className="max-w-md text-sm text-slate-500">A spec house is built to sell, with no client. Mark it to track its listing, carrying costs and offers.</p>
          <form action={setSpec}>
            <input type="hidden" name="projectId" value={project.id} />
            <Button type="submit" size="sm" className={small}>
              Mark as a spec house
            </Button>
          </form>
        </div>
      </section>
    );

  const today = new Date();
  const [p, codes, estimate, offers] = await Promise.all([
    specPicture(project.id, today),
    activeCostCodes(),
    db.estimate.findFirst({
      where: { projectId: project.id },
      orderBy: [{ approvedAt: { sort: "desc", nulls: "last" } }, { version: "desc" }],
      include: { items: { where: { isOptional: false } } },
    }),
    db.specOffer.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const estByCode = new Map<string, number>();
  for (const i of estimate?.items ?? []) if (i.costCodeId) estByCode.set(i.costCodeId, (estByCode.get(i.costCodeId) ?? 0) + lineCost(i));
  const codeChoices = codes.map((c) => ({ id: c.id, label: `${costCodeLabel(c)}${estByCode.get(c.id) ? ` — estimated ${money(estByCode.get(c.id), true)}` : ""}` }));
  const spec = p.spec;
  const sold = !!spec?.soldAt;
  const in30 = addDays(today, 30);
  const carry30 = carryToClosing(p.carrying, in30, p.stop);
  // Closing in 30 days: carrying to then, plus interest on draws still to come if the house isn't done.
  const cost30 = p.build + carry30 + (p.loanRate ? futureDrawInterest(p.toFinish, p.loanRate, today, in30) : 0);
  const breakEven = priceForProfit(0, p.sheet, in30, cost30);
  const atList = spec?.listPrice ? offerMath(spec.listPrice, p.sheet, in30, cost30) : null;
  const dom = spec?.listedAt ? daysOnMarket(spec.listedAt, spec.soldAt ?? today) : null;
  const accepted = offers.find((o) => o.status === "ACCEPTED");
  const base = `/projects/${project.id}`;
  // Estimate lines running out: a carrying cost's code charged (and running) to its estimate.
  const byCode = new Map<string, { label: string; toDate: number; est: number }>();
  for (const c of p.carrying)
    if (c.costCodeId && c.estimated) {
      const r = byCode.get(c.costCodeId) ?? { label: c.codeLabel ?? "", toDate: 0, est: c.estimated };
      r.toDate += c.toDate;
      byCode.set(c.costCodeId, r);
    }
  const runningOut = [...byCode.values()].filter((r) => r.toDate >= r.est * 0.9);
  const here = `${base}/spec`;
  const editing = canEdit ? q.edit : undefined;
  const pct = (n: number) => `${Number(n.toFixed(2))}%`;
  // Closing costs as a list with a total (at the list price, once there is one).
  const closing = p.sheet.lines.filter((l) => l.value);
  const closingPct = closing.filter((l) => l.kind === "PCT").reduce((n, l) => n + l.value, 0);
  const closingTotal = closing.reduce((n, l) => n + (l.kind === "PCT" ? (spec?.listPrice ? (spec.listPrice * l.value) / 100 : 0) : l.value), 0);

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-slate-900">Spec sale</h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {sold ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-800">Sold {fmtDate(spec!.soldAt)}</span>
            ) : spec?.listPrice ? (
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-800">On the market{dom != null ? ` · ${dom} days` : ""}</span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Not listed yet</span>
            )}
            {spec?.listPrice ? <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Listed at {money(spec.listPrice, true)}</span> : null}
            {sold && spec?.soldPrice ? <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">Sold for {money(spec.soldPrice, true)}</span> : null}
          </div>
        </div>
        {!sold ? (
          <Link href={`${base}/spec/offer`} className="inline-flex h-7 items-center gap-1 rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700">
            <Calculator className="h-3.5 w-3.5" /> Work out an offer
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Tile label="The house" value={money(p.build, true)} hint={`${money(p.buildSpent, true)} spent · the rest from the estimate`} />
        <Tile label="Carrying so far" value={money(p.carryingToDate, true)} hint={`${money(p.perDay)} a day · ${money(p.perDay * 30, true)} a month`} tone={p.perDay > 0 ? "warn" : undefined} />
        <Tile label="Break-even" value={breakEven ? money(Math.ceil(breakEven), true) : "—"} hint="Closing in 30 days, usual concessions" />
        <Tile
          label="Profit at list"
          value={atList ? money(atList.profit, true) : "—"}
          hint={atList ? `${((atList.margin ?? 0) * 100).toFixed(1)}% · closing in 30 days` : "No list price yet"}
          tone={atList ? (atList.profit >= 0 ? "good" : "bad") : undefined}
        />
      </div>
      {!p.hasEstimate ? <p className="text-sm text-amber-700">This job has no estimate, so &quot;the house&quot; is only what&apos;s been spent so far.</p> : null}
      {runningOut.map((r) => (
        <p key={r.label} className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {r.label}: {money(r.toDate, true)} so far of {money(r.est, true)} estimated{r.toDate > r.est ? " — over the estimate" : " — almost used up"}.
        </p>
      ))}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <section id="listing" className={cn(card, "scroll-mt-24")}>
          <header className={head}>
            <h2 className="text-sm font-semibold text-slate-900">Listing and selling costs</h2>
            {canEdit && editing !== "listing" ? (
              <Link href={`${here}?edit=listing#listing`} scroll={false} className={editLink}>
                <Pencil className="h-3 w-3" /> Edit
              </Link>
            ) : null}
          </header>
          {editing === "listing" ? (
            // The same rows as below, each with its box: editing looks like the page it changes.
            <form action={saveListing} className={cn("px-4 py-2", compact)}>
              <input type="hidden" name="projectId" value={project.id} />
              <EditRow label="List price">
                <MoneyBox name="listPrice" label="List price" defaultValue={spec?.listPrice ?? ""} />
              </EditRow>
              <EditRow label="Listed on">
                <input name="listedAt" type="date" className="input !w-40" defaultValue={dateInput(spec?.listedAt)} aria-label="Listed on" />
              </EditRow>
              <EditRow label="Listing agent">
                <PctBox name="listPct" label="Listing agent" defaultValue={p.sheet.listPct} />
              </EditRow>
              <EditRow label="Buyer's agent">
                <PctBox name="buyerPct" label="Buyer's agent" defaultValue={p.sheet.buyerPct} />
              </EditRow>
              <EditRow label="Concessions">
                <MoneyBox name="concessions" label="Concessions" defaultValue={p.sheet.concessions || ""} />
              </EditRow>
              <EditRow label="Closing costs" top>
                <ClosingLinesEditor initial={p.sheet.lines} />
              </EditRow>
              <EditRow label="Taxes a year">
                <MoneyBox name="annualTax" label="Property taxes a year" defaultValue={spec?.annualTax ?? ""} />
              </EditRow>
              <EditRow label="HOA a year">
                <MoneyBox name="hoaAnnual" label="HOA dues a year" defaultValue={spec?.hoaAnnual ?? ""} />
              </EditRow>
              <EditRow label="HOA paid through">
                <input name="hoaPaidThrough" type="date" className="input !w-40" defaultValue={dateInput(spec?.hoaPaidThrough)} aria-label="HOA paid through" />
              </EditRow>
              <EditRow label="Notes">
                <input name="notes" className="input" defaultValue={spec?.notes ?? ""} placeholder="Agent, MLS #, showing notes…" aria-label="Notes" />
              </EditRow>
              <p className="border-t border-slate-100 py-1.5 text-xs text-slate-500">
                Taxes: you credit the buyer Jan 1 → closing. HOA: if you&apos;ve paid ahead, the buyer pays back the days after closing (leave it blank if you pay monthly —
                that&apos;s a carrying cost).
              </p>
              <label className="flex items-center gap-2 border-t border-slate-100 py-1.5 text-xs text-slate-600">
                <input type="checkbox" name="makeDefault" className="h-3.5 w-3.5 rounded border-slate-300" /> Use these commissions, closing costs and concessions for my next spec
                houses
              </label>
              <div className="flex gap-1.5 border-t border-slate-100 pt-2 pb-1">
                <SubmitButton size="sm" className={small} pendingText="Saving…">
                  Save
                </SubmitButton>
                <Link href={`${here}#listing`} scroll={false} className={plainBtn}>
                  Cancel
                </Link>
              </div>
            </form>
          ) : (
            <div className="px-4 py-2">
              <Row label="List price">{spec?.listPrice ? money(spec.listPrice, true) : null}</Row>
              <Row label="Listed on">{spec?.listedAt ? fmtDate(spec.listedAt) : null}</Row>
              <Row label="Listing agent">{pct(p.sheet.listPct)}</Row>
              <Row label="Buyer's agent">{pct(p.sheet.buyerPct)}</Row>
              <Row label="Concessions">{p.sheet.concessions ? money(p.sheet.concessions, true) : null}</Row>
              <Row label="Closing costs">
                {closing.length ? (
                  <ul className="space-y-0.5">
                    {closing.map((l, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="min-w-0">{l.name}</span>
                        <span className="shrink-0 tabular-nums">
                          {l.kind === "PCT" ? (
                            <>
                              <span className="text-slate-500">{pct(l.value)}</span>
                              {spec?.listPrice ? ` ${money((spec.listPrice * l.value) / 100, true)}` : null}
                            </>
                          ) : (
                            money(l.value, true)
                          )}
                        </span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-3 border-t border-slate-100 pt-0.5 font-medium">
                      <span>Total{spec?.listPrice ? " at list price" : ""}</span>
                      <span className="tabular-nums">
                        {money(closingTotal, true)}
                        {!spec?.listPrice && closingPct ? <span className="font-normal text-slate-500"> + {pct(closingPct)} of the price</span> : null}
                      </span>
                    </li>
                    {!spec?.closingLines ? <li className="text-xs text-amber-700">Typical amounts — change them to your title company&apos;s.</li> : null}
                  </ul>
                ) : null}
              </Row>
              <Row label="Taxes a year">{spec?.annualTax ? money(spec.annualTax, true) : null}</Row>
              <Row label="HOA a year">{spec?.hoaAnnual ? money(spec.hoaAnnual, true) : null}</Row>
              <Row label="HOA paid through">{spec?.hoaPaidThrough ? fmtDate(spec.hoaPaidThrough) : null}</Row>
              <Row label="Notes">{spec?.notes}</Row>
            </div>
          )}
        </section>
        <section id="carrying" className={cn(card, "scroll-mt-24")}>
          <header className={head}>
            <h2 className="text-sm font-semibold text-slate-900">
              Carrying costs <span className="text-xs font-normal text-slate-500">charged to the Budget each month</span>
            </h2>
          </header>
          {p.carrying.length ? (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">What</th>
                  <th className="px-2 py-2 text-right font-medium">A day</th>
                  <th className="px-2 py-2 text-right font-medium">To date</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 border-t border-slate-100">
                {p.carrying.map((c) => (
                  <Fragment key={c.id}>
                    <tr id={`carry-${c.id}`} className="scroll-mt-24 align-top">
                      <td className="px-4 py-2">
                        <span className="font-medium text-slate-900">{c.name}</span>
                        <span className="block text-xs text-slate-500">
                          {c.kind === "INTEREST" ? `${money(c.balance, true)} at ${c.rate}%` : `${money(c.amount)} ${FREQ[c.frequency]}`} · {fmtDate(c.startDate, "MMM d, yyyy")}
                          {c.endDate ? ` – ${fmtDate(c.endDate, "MMM d, yyyy")}` : " on"}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {c.codeLabel ?? "No cost code"}
                          {c.estimated ? ` · estimated ${money(c.estimated, true)}` : ""}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">{c.perDay ? money(c.perDay) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        <span className="font-medium">{money(c.toDate, true)}</span>
                        <span className="block text-xs text-slate-500">{money(c.posted, true)} charged</span>
                      </td>
                      <td className="px-4 py-2">
                        {canEdit ? (
                          <div className="flex flex-col items-end gap-0.5">
                            {editing !== c.id ? (
                              <Link href={`${here}?edit=${c.id}#carry-${c.id}`} scroll={false} className="text-xs font-medium text-blue-700 hover:underline">
                                Edit
                              </Link>
                            ) : null}
                            <ConfirmForm
                              action={deleteCarrying}
                              hidden={{ projectId: project.id, id: c.id }}
                              message={`Remove ${c.name}? Its ${money(c.posted, true)} of charges come off the Budget too.`}
                              variant="ghost"
                            >
                              <span className="text-xs text-rose-600">Remove</span>
                            </ConfirmForm>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                    {editing === c.id ? (
                      <tr className="bg-slate-50/60">
                        <td colSpan={4} className="px-4 py-2.5">
                          <p className="mb-2 text-xs text-slate-500">
                            {c.kind === "INTEREST"
                              ? "The starting balance is what was owed before the draws you log. Log draws, paydowns and rate changes under the line — every month follows them."
                              : "Changes count from now on — months already charged keep what they were charged."}
                          </p>
                          <CarryingForm
                            action={updateCarrying}
                            projectId={project.id}
                            codes={codeChoices}
                            submitLabel="Save"
                            cancelHref={`${here}#carry-${c.id}`}
                            values={{ ...c, startDate: dateInput(new Date(c.startDate)), endDate: c.endDate ? dateInput(new Date(c.endDate)) : "" }}
                          />
                        </td>
                      </tr>
                    ) : null}
                    {c.kind === "INTEREST" ? (
                      <tr id={`loan-${c.id}`} className="scroll-mt-24 bg-slate-50/60">
                        <td colSpan={4} className="px-4 py-2">
                          <details open={c.entries.length === 0}>
                            <summary className="cursor-pointer text-xs font-medium text-blue-700">
                              Draws, paydowns, rate changes &amp; the bank&apos;s interest ({c.entries.length})
                            </summary>
                            <div className="mt-2 space-y-2">
                              {c.entries.length ? (
                                <table className="w-full text-xs">
                                  <tbody className="divide-y divide-slate-200">
                                    {c.entries.map((e) => (
                                      <tr key={e.id}>
                                        <td className="whitespace-nowrap py-1 pr-2">{e.kind === "ACTUAL" ? e.month : fmtDate(e.date, "MMM d, yyyy")}</td>
                                        <td className="py-1 pr-2">{ENTRY[e.kind]}</td>
                                        <td className="py-1 pr-2 text-right tabular-nums">
                                          {e.kind === "RATE" ? `${e.ratePct}%` : e.kind === "PAYDOWN" ? `− ${money(e.amount)}` : money(e.amount)}
                                        </td>
                                        <td className="py-1 pr-2 text-slate-500">{e.note}</td>
                                        <td className="py-1 text-right">
                                          {canEdit ? (
                                            <ConfirmForm action={deleteLoanEntry} hidden={{ projectId: project.id, id: e.id }} message="Remove this from the loan's log?" variant="ghost">
                                              <span className="text-xs text-rose-600">Remove</span>
                                            </ConfirmForm>
                                          ) : null}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              ) : (
                                <p className="text-xs text-slate-500">
                                  Log each draw as the bank funds it (and any you&apos;ve already taken). Interest is worked out on each day&apos;s balance. Type the bank&apos;s
                                  interest for a month to match your statement exactly.
                                </p>
                              )}
                              {canEdit ? <LoanEntryForm action={addLoanEntry} projectId={project.id} carryingCostId={c.id} today={dateInput(today)} /> : null}
                            </div>
                          </details>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 font-semibold">
                <tr>
                  <td className="px-4 py-2">Total</td>
                  <td className="px-2 py-2 text-right tabular-nums">{money(p.perDay)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    {money(p.carryingToDate, true)}
                    <span className="block text-xs font-normal text-slate-500">{money(p.carryingPosted, true)} charged</span>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          ) : (
            <p className="px-4 py-2.5 text-sm text-slate-500">
              None yet — add the construction loan&apos;s interest, insurance, HOA dues, utilities and anything else the house costs while it sits. (Property taxes go under Listing
              and selling costs — they&apos;re paid at closing.)
            </p>
          )}
          {canEdit ? (
            editing === "new" ? (
              <div id="new-carrying" className="scroll-mt-24 border-t border-dashed border-slate-200 px-4 py-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-slate-700">New carrying cost</h3>
                  <Link href={`${here}#carrying`} scroll={false} className="text-xs font-medium text-slate-500 hover:text-slate-800">
                    Cancel
                  </Link>
                </div>
                <CarryingForm
                  action={addCarrying}
                  projectId={project.id}
                  codes={codeChoices}
                  submitLabel="Add"
                  cancelHref={`${here}#carrying`}
                  values={{
                    name: "",
                    kind: "AMOUNT",
                    amount: 0,
                    frequency: "MONTHLY",
                    loanBalance: null,
                    ratePct: null,
                    startDate: dateInput(project.startDate ?? today),
                    endDate: "",
                    costCodeId: null,
                  }}
                />
              </div>
            ) : (
              <div className="border-t border-slate-100 px-4 py-2">
                <Link href={`${here}?edit=new#new-carrying`} scroll={false} className="text-xs font-medium text-blue-700 hover:underline">
                  + Add a carrying cost
                </Link>
              </div>
            )
          ) : null}
        </section>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <section id="offers" className={cn(card, "scroll-mt-24")}>
          <header className={head}>
            <h2 className="text-sm font-semibold text-slate-900">
              Offers <span className="text-xs font-normal text-slate-500">as worked out when they came in</span>
            </h2>
          </header>
          {offers.length ? (
            <ul className="divide-y divide-slate-100">
              {offers.map((o) => (
                <li key={o.id} className="px-4 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium text-slate-900">{money(o.price, true)}</span>
                      {o.buyer ? <span className="text-slate-600"> · {o.buyer}</span> : null}
                      <span className={cn("ml-2 font-medium", o.profit >= 0 ? "text-emerald-700" : "text-rose-700")}>{money(o.profit, true)} profit</span>
                      <span className="block text-xs text-slate-500">
                        {fmtDate(o.createdAt)} · closing {fmtDate(o.closingDate)}
                        {o.concessions ? ` · ${money(o.concessions, true)} concessions` : ""}
                        {o.repairs ? ` · ${money(o.repairs, true)} repairs` : ""}
                        {o.counterPrice ? ` · countered at ${money(o.counterPrice, true)}` : ""}
                        {o.note ? ` · ${o.note}` : ""}
                      </span>
                    </span>
                    <Badge status={o.status === "ACCEPTED" ? "APPROVED" : o.status === "REJECTED" ? "DECLINED" : o.status === "COUNTERED" ? "PENDING" : "OPEN"}>
                      {OFFER_STATUS[o.status]}
                    </Badge>
                    {!sold && canEdit && q.offer !== o.id ? (
                      <Link href={`${here}?offer=${o.id}#offers`} scroll={false} className="text-xs font-medium text-blue-700 hover:underline">
                        Update
                      </Link>
                    ) : null}
                  </div>
                  {!sold && canEdit && q.offer === o.id ? (
                    <form action={setOfferStatus} className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="id" value={o.id} />
                      <select name="status" defaultValue={o.status} className="input !h-7 !w-auto !py-0 text-xs" aria-label="Status">
                        {Object.entries(OFFER_STATUS).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <input name="counterPrice" inputMode="decimal" className="input !h-7 !w-28 !py-0 text-xs" placeholder="Counter $" defaultValue={o.counterPrice ?? ""} aria-label="Counter price" />
                      <SubmitButton size="sm" className={small} pendingText="Saving…">
                        Save
                      </SubmitButton>
                      <Link href={`${here}#offers`} scroll={false} className={plainBtn}>
                        Cancel
                      </Link>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-2.5 text-sm text-slate-500">No offers yet. {!sold ? "Work out an offer (top right) and save it here." : ""}</p>
          )}
        </section>
        <section id="sold" className={cn(card, "scroll-mt-24")}>
          <header className={head}>
            <h2 className="text-sm font-semibold text-slate-900">{sold ? "Sold" : "Sold it?"}</h2>
            {!sold && canEdit && q.sold !== "1" ? (
              <Link href={`${here}?sold=1#sold`} scroll={false} className="inline-flex h-7 items-center rounded-md bg-blue-600 px-2.5 text-xs font-medium text-white hover:bg-blue-700">
                Mark sold…
              </Link>
            ) : null}
          </header>
          {sold ? (
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span>
                Sold for <strong>{money(spec!.soldPrice, true)}</strong> on {fmtDate(spec!.soldAt)}.
              </span>
              {canEdit ? (
                <ConfirmForm action={unmarkSold} hidden={{ projectId: project.id }} message="Put it back on the market? The sale and its selling costs come off the Budget." variant="ghost">
                  <span className="text-xs text-blue-700">Back on the market</span>
                </ConfirmForm>
              ) : null}
            </div>
          ) : canEdit && q.sold === "1" ? (
            <form action={markSold} className={cn("grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3 sm:grid-cols-3", compact)}>
              <input type="hidden" name="projectId" value={project.id} />
              <label className="space-y-1">
                <span className="label">Sold for</span>
                <input name="soldPrice" inputMode="decimal" required className="input" defaultValue={accepted?.price ?? ""} placeholder="$" />
              </label>
              <label className="space-y-1">
                <span className="label">Closed on</span>
                <input name="soldAt" type="date" required className="input" defaultValue={dateInput(accepted?.closingDate ?? today)} />
              </label>
              <label className="space-y-1">
                <span className="label">Buyer&apos;s agent %</span>
                <input name="buyerPct" inputMode="decimal" className="input" defaultValue={accepted?.buyerPct || p.sheet.buyerPct} />
              </label>
              <label className="space-y-1">
                <span className="label">Concessions $</span>
                <input name="concessions" inputMode="decimal" className="input" defaultValue={accepted?.concessions || ""} placeholder="$0" />
              </label>
              <label className="space-y-1">
                <span className="label">Repairs $</span>
                <input name="repairs" inputMode="decimal" className="input" defaultValue={accepted?.repairs || ""} placeholder="$0" />
              </label>
              <label className="space-y-1">
                <span className="label">Title policy $ (if quoted)</span>
                <input name="titleQuote" inputMode="decimal" className="input" placeholder="uses the %" />
              </label>
              <div className="col-span-2 flex flex-wrap items-center gap-1.5 sm:col-span-3">
                <SubmitButton size="sm" className={small} pendingText="Saving…">
                  Mark sold
                </SubmitButton>
                <Link href={`${here}#sold`} scroll={false} className={plainBtn}>
                  Cancel
                </Link>
                {accepted ? <span className="text-xs text-slate-500">Filled in from the accepted offer.</span> : null}
              </div>
            </form>
          ) : (
            <p className="px-4 py-2.5 text-xs text-slate-500">
              {accepted ? "Opens a short form filled in from the accepted offer. " : ""}Carrying costs stop, and everything the sale cost — commissions, closing costs, the tax
              proration, concessions, repairs — goes on the Budget, so the job&apos;s profit is real.
            </p>
          )}
        </section>
      </div>

      {canEdit ? (
        <div className="text-xs text-slate-500">
          Not a spec house after all?{" "}
          <form action={setSpec} className="inline">
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="on" value="0" />
            <button type="submit" className="text-blue-700 hover:underline">
              Unmark it
            </button>
          </form>{" "}
          (its carrying-cost charges stay on the Budget).
        </div>
      ) : null}
    </div>
  );
}

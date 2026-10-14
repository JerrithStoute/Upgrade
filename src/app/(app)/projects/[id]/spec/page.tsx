import { Fragment } from "react";
import { addDays } from "date-fns";
import { AlertTriangle, Calculator, Home } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject, activeCostCodes } from "@/lib/projects";
import { specPicture } from "@/lib/spec";
import { carryToClosing, daysOnMarket, futureDrawInterest, offerMath, priceForProfit } from "@/lib/spec-math";
import { cn, costCodeLabel, dateInput, fmtDate, lineCost, money } from "@/lib/utils";
import { Badge, Button, ButtonLink, Card, CardBody, CardHeader, Collapsible, ConfirmForm, Stat, SubmitButton } from "@/components/ui";
import { CarryingForm } from "./carrying-form";
import { UnitInput } from "@/components/ui/unit-input";
import { addCarrying, addLoanEntry, deleteCarrying, deleteLoanEntry, markSold, saveListing, setOfferStatus, setSpec, unmarkSold, updateCarrying } from "./actions";
import { ClosingLinesEditor } from "./closing-lines";
import { LoanEntryForm } from "./loan-entry-form";

const FREQ: Record<string, string> = { MONTHLY: "a month", YEARLY: "a year", ONCE: "once" };
const ENTRY: Record<string, string> = { DRAW: "Draw", PAYDOWN: "Paydown", RATE: "Rate change", ACTUAL: "Bank's interest" };
const OFFER_STATUS: Record<string, string> = { OPEN: "Open", COUNTERED: "Countered", ACCEPTED: "Accepted", REJECTED: "Rejected" };

/** A spec house: its listing, what it costs to hold, offers, and selling it. */
export default async function SpecSalePage({ params }: { params: Promise<{ id: string }> }) {
  await requireView("budget");
  const { id } = await params;
  const project = await getProject(id);
  if (!project.isSpec)
    return (
      <Card>
        <CardBody className="flex flex-col items-center gap-3 py-10 text-center">
          <Home className="h-8 w-8 text-slate-400" />
          <p className="font-medium text-slate-800">This job isn&apos;t marked as a spec house</p>
          <p className="max-w-md text-sm text-slate-500">A spec house is built to sell, with no client. Mark it to track its listing, carrying costs and offers.</p>
          <form action={setSpec}>
            <input type="hidden" name="projectId" value={project.id} />
            <Button type="submit">Mark as a spec house</Button>
          </form>
        </CardBody>
      </Card>
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            Spec sale{" "}
            {sold ? <Badge status="APPROVED">Sold {fmtDate(spec!.soldAt)}</Badge> : spec?.listPrice ? <Badge status="OPEN">On the market</Badge> : <Badge>Not listed yet</Badge>}
          </h2>
          <p className="text-sm text-slate-500">
            {spec?.listPrice ? `Listed at ${money(spec.listPrice, true)}` : "Fill in the listing below"}
            {dom != null ? ` · ${dom} days on the market` : ""}
            {sold && spec?.soldPrice ? ` · sold for ${money(spec.soldPrice, true)}` : ""}
          </p>
        </div>
        {!sold ? (
          <ButtonLink href={`${base}/spec/offer`}>
            <Calculator className="h-4 w-4" /> Work out an offer
          </ButtonLink>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="The house" value={money(p.build, true)} hint={`${money(p.buildSpent, true)} spent · the rest from the estimate`} />
        <Stat
          label="Carrying so far"
          value={money(p.carryingToDate, true)}
          hint={`${money(p.perDay)} a day · ${money(p.perDay * 30, true)} a month`}
          tone={p.perDay > 0 ? "warn" : "default"}
        />
        <Stat label="Break-even" value={breakEven ? money(Math.ceil(breakEven), true) : "—"} hint="Closing in 30 days, usual concessions" />
        <Stat
          label="Profit at list"
          value={atList ? money(atList.profit, true) : "—"}
          hint={atList ? `${((atList.margin ?? 0) * 100).toFixed(1)}% · closing in 30 days` : "No list price yet"}
          tone={atList ? (atList.profit >= 0 ? "good" : "bad") : "default"}
        />
      </div>
      {!p.hasEstimate ? <p className="text-sm text-amber-700">This job has no estimate, so &quot;the house&quot; is only what&apos;s been spent so far.</p> : null}
      {runningOut.map((r) => (
        <p key={r.label} className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {r.label}: {money(r.toDate, true)} so far of {money(r.est, true)} estimated{r.toDate > r.est ? " — over the estimate" : " — almost used up"}.
        </p>
      ))}

      <Card>
        <div id="carrying" className="scroll-mt-24" />
        <CardHeader
          title="Carrying costs"
          description="What the house costs to hold. Each month that's over is charged to the Budget under its cost code; offers count what's charged plus what's still to come up to the closing date."
        />
        <CardBody className="space-y-4">
          {p.carrying.length ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">What</th>
                    <th className="px-3 py-2 font-medium">Terms</th>
                    <th className="px-3 py-2 text-right font-medium">A day</th>
                    <th className="px-3 py-2 text-right font-medium">Charged</th>
                    <th className="px-3 py-2 text-right font-medium">To date</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {p.carrying.map((c) => (
                    <Fragment key={c.id}>
                      <tr className="align-top">
                        <td className="px-3 py-2">
                          <span className="font-medium text-slate-900">{c.name}</span>
                          <span className="block text-xs text-slate-500">
                            {c.codeLabel ?? "No cost code"}
                            {c.estimated ? ` · estimated ${money(c.estimated, true)}` : ""}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">
                          {c.kind === "INTEREST" ? `Balance ${money(c.balance, true)} at ${c.rate}%` : `${money(c.amount)} ${FREQ[c.frequency]}`}
                          <span className="block">
                            {fmtDate(c.startDate, "MMM d, yyyy")}
                            {c.endDate ? ` – ${fmtDate(c.endDate, "MMM d, yyyy")}` : " on"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{c.perDay ? money(c.perDay) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(c.posted, true)}</td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums">{money(c.toDate, true)}</td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1">
                            <details className="relative">
                              <summary className="cursor-pointer list-none rounded px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50 [&::-webkit-details-marker]:hidden">
                                Edit
                              </summary>
                              <div className="absolute right-0 z-20 mt-1 w-[min(46rem,90vw)] rounded-lg border border-slate-200 bg-white p-4 shadow-xl">
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
                                  values={{ ...c, startDate: dateInput(new Date(c.startDate)), endDate: c.endDate ? dateInput(new Date(c.endDate)) : "" }}
                                />
                              </div>
                            </details>
                            <ConfirmForm
                              action={deleteCarrying}
                              hidden={{ projectId: project.id, id: c.id }}
                              message={`Remove ${c.name}? Its ${money(c.posted, true)} of charges come off the Budget too.`}
                              variant="ghost"
                            >
                              <span className="text-xs text-rose-600">Remove</span>
                            </ConfirmForm>
                          </div>
                        </td>
                      </tr>
                      {c.kind === "INTEREST" ? (
                        <tr id={`loan-${c.id}`} className="scroll-mt-24 bg-slate-50/60">
                          <td colSpan={6} className="px-3 py-2">
                            <details open={c.entries.length === 0}>
                              <summary className="cursor-pointer text-xs font-medium text-blue-700">
                                Draws, paydowns, rate changes &amp; the bank&apos;s interest ({c.entries.length})
                              </summary>
                              <div className="mt-2 space-y-3">
                                {c.entries.length ? (
                                  <table className="w-full max-w-2xl text-xs">
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
                                            <ConfirmForm
                                              action={deleteLoanEntry}
                                              hidden={{ projectId: project.id, id: e.id }}
                                              message="Remove this from the loan's log?"
                                              variant="ghost"
                                            >
                                              <span className="text-xs text-rose-600">Remove</span>
                                            </ConfirmForm>
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
                                <LoanEntryForm action={addLoanEntry} projectId={project.id} carryingCostId={c.id} today={dateInput(today)} />
                              </div>
                            </details>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={2}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(p.perDay)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(p.carryingPosted, true)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(p.carryingToDate, true)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              None yet — add the construction loan&apos;s interest, insurance, HOA dues, utilities and anything else the house costs while it sits. (Property taxes go under Listing
              &amp; selling costs — they&apos;re paid at closing.)
            </p>
          )}
          <Collapsible summary="Add a carrying cost" defaultOpen={!p.carrying.length}>
            <CarryingForm
              action={addCarrying}
              projectId={project.id}
              codes={codeChoices}
              submitLabel="Add"
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
          </Collapsible>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Listing & selling costs"
          description="Everything that comes off the price at closing — commissions, each closing cost, prorations. Tick the box and your numbers fill in for the next spec house."
        />
        <CardBody>
          <form action={saveListing} className="space-y-5">
            <input type="hidden" name="projectId" value={project.id} />
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Listing</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-3">
                <UnitInput label="List price" name="listPrice" prefix="$" width="w-32" defaultValue={spec?.listPrice ?? ""} />
                <label className="space-y-1">
                  <span className="label">Listed on</span>
                  <input name="listedAt" type="date" className="input !w-40" defaultValue={dateInput(spec?.listedAt)} />
                </label>
                <UnitInput label="Listing agent" name="listPct" suffix="%" width="w-20" defaultValue={p.sheet.listPct} />
                <UnitInput label="Buyer's agent" name="buyerPct" suffix="%" width="w-20" defaultValue={p.sheet.buyerPct} />
                <UnitInput label="Usual concessions" name="concessions" prefix="$" width="w-28" defaultValue={p.sheet.concessions || ""} />
              </div>
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Closing costs</h3>
              <ClosingLinesEditor initial={p.sheet.lines} />
              {!spec?.closingLines ? <p className="text-xs text-amber-700">These start at typical amounts — change them to your title company&apos;s numbers.</p> : null}
            </section>
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Prorations at closing</h3>
              <div className="flex flex-wrap gap-x-4 gap-y-3">
                <UnitInput label="Property taxes a year" name="annualTax" prefix="$" width="w-28" defaultValue={spec?.annualTax ?? ""} />
                <UnitInput label="HOA dues a year" name="hoaAnnual" prefix="$" width="w-28" defaultValue={spec?.hoaAnnual ?? ""} />
                <label className="space-y-1">
                  <span className="label">HOA paid through</span>
                  <input name="hoaPaidThrough" type="date" className="input !w-40" defaultValue={dateInput(spec?.hoaPaidThrough)} />
                </label>
              </div>
              <p className="text-xs text-slate-500">
                Taxes: you credit the buyer Jan 1 → closing. HOA: if you&apos;ve paid ahead, the buyer pays back the days after closing (leave blank if you pay monthly —
                that&apos;s a carrying cost).
              </p>
            </section>
            <label className="block max-w-xl space-y-1">
              <span className="label">Notes</span>
              <input name="notes" className="input" defaultValue={spec?.notes ?? ""} placeholder="Agent, MLS #, showing notes…" />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <SubmitButton size="sm">Save</SubmitButton>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input type="checkbox" name="makeDefault" className="h-4 w-4 rounded border-slate-300" /> Use these commissions, closing costs and concessions for my next spec
                houses
              </label>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <div id="offers" className="scroll-mt-24" />
        <CardHeader title="Offers" description="Each offer as it was worked out when it came in." />
        {offers.length ? (
          <ul className="divide-y divide-slate-100">
            {offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
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
                {!sold ? (
                  <form action={setOfferStatus} className="flex items-center gap-1">
                    <input type="hidden" name="projectId" value={project.id} />
                    <input type="hidden" name="id" value={o.id} />
                    <select name="status" defaultValue={o.status} className="input !h-8 !w-auto !py-0 text-xs" aria-label="Status">
                      {Object.entries(OFFER_STATUS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                    <input
                      name="counterPrice"
                      inputMode="decimal"
                      className="input !h-8 w-28 text-xs"
                      placeholder="Counter $"
                      defaultValue={o.counterPrice ?? ""}
                      aria-label="Counter price"
                    />
                    <Button type="submit" size="sm" variant="secondary">
                      Set
                    </Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <CardBody>
            <p className="text-sm text-slate-500">No offers yet.</p>
          </CardBody>
        )}
      </Card>

      <Card>
        <CardHeader
          title={sold ? "Sold" : "Sold it?"}
          description={
            sold
              ? undefined
              : "Carrying costs stop, and everything the sale cost — commissions, closing costs, the tax proration, concessions, repairs — goes on the Budget, so the job's profit is real."
          }
        />
        <CardBody>
          {sold ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>
                Sold for <strong>{money(spec!.soldPrice, true)}</strong> on {fmtDate(spec!.soldAt)}.
              </span>
              <ConfirmForm
                action={unmarkSold}
                hidden={{ projectId: project.id }}
                message="Put it back on the market? The sale and its selling costs come off the Budget."
                variant="ghost"
              >
                Back on the market
              </ConfirmForm>
            </div>
          ) : (
            <form action={markSold} className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
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
              <div className="sm:col-span-3 lg:col-span-6">
                <SubmitButton size="sm" variant="success" pendingText="Saving…">
                  Mark sold
                </SubmitButton>
                {accepted ? <span className="ml-3 text-xs text-slate-500">Filled in from the accepted offer.</span> : null}
              </div>
            </form>
          )}
        </CardBody>
      </Card>

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
    </div>
  );
}

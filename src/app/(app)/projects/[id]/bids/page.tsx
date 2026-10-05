import Link from "next/link";
import { AlertTriangle, ArrowLeft, Check, Download, FileSpreadsheet, Lock, Pencil, Printer } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { bidComparison, codeGroups, isLadderLine, overWarnings, OVER_WARNING, priceLadders } from "@/lib/bids";
import { vendorCodes } from "@/lib/vendors";
import { cn, fmtDate, money } from "@/lib/utils";
import { Card, CardBody, CardHeader, ConfirmForm, EmptyState, SubmitButton, buttonClasses } from "@/components/ui";
import { RequestBids } from "./_components/request-bids";
import { ImportButton } from "./_components/import-button";
import { EmailPreview } from "./_components/email-preview";
import { companyLines } from "@/lib/company";
import { deleteBid, importBid, quickAddVendor, requestBids, takeBids } from "./actions";

export const metadata = { title: "Send to vendors" };

function pctText(p: number) {
  return `${p >= 0 ? "+" : "−"}${Math.round(Math.abs(p) * 100)}%`;
}

/**
 * Bids for the job: ask vendors for prices on the Material list (by cost code), bring their
 * files back, compare them at today's quantities, and take one per cost code.
 */
export default async function BidsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    made?: string;
    imported?: string;
    priced?: string;
    blank?: string;
    ladder?: string;
    taken?: string;
    items?: string;
    skipped?: string;
    scope?: string;
    error?: string;
  }>;
}) {
  await requireStaff();
  const { id } = await params;
  const q = await searchParams;
  const project = await getProject(id);
  const [cmp, vendors, company] = await Promise.all([bidComparison(project.id), db.vendor.findMany({ orderBy: { name: "asc" } }), db.company.findFirst()]);
  const groups = codeGroups(cmp.lines).map((g) => ({
    codeKey: g.codeKey,
    codeLabel: g.codeLabel,
    items: cmp.lines.filter((l) => l.codeKey === g.codeKey).map((l) => ({ key: l.key, name: l.name, quantity: l.quantity, unit: l.unit, extended: l.extended })),
  }));
  const warnings = overWarnings(cmp);
  const ladders = await priceLadders(project.id, cmp.lines);
  const locked = !!project.pricesLockedAt;
  const base = `/projects/${project.id}/bids`;
  const importedBid = q.imported ? cmp.bids.find((b) => b.id === q.imported) : null;
  const from = companyLines(company);
  const address = [project.address, [project.city, project.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  /** The email to a vendor about a bid — shown to you first (EmailPreview), then opened in your email program. */
  const emailFor = (b: (typeof cmp.bids)[number], contact: string | null) => {
    const items = b.lines.filter((l) => !isLadderLine(l));
    const ladder = b.lines.length - items.length;
    const codes = Array.from(new Set(items.map((l) => l.codeLabel)));
    return {
      subject: `Request for prices — Job #${project.number} ${project.name} (Bid #${b.number})`,
      body: [
        `Hello${contact ? ` ${contact.split(" ")[0]}` : ""},`,
        "",
        `Please send us your prices for the attached list — ${items.length} item${items.length === 1 ? "" : "s"} (${codes.join(", ")}).`,
        ...(ladder ? ["At the end there's a short price list of other lumber lengths — just a price per board, so we can order the lengths that cost least."] : []),
        "Just fill in your price per unit (the yellow column in the Excel file, or write it on the PDF) and send it back.",
        ...(b.notes ? ["", b.notes] : []),
        "",
        `Job #${project.number} — ${project.name}`,
        ...(address ? [`Deliver to: ${address}`] : []),
        "",
        "Thank you,",
        ...from,
      ].join(String.fromCharCode(10)),
    };
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/projects/${project.id}/materials`} className={buttonClasses("ghost", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Material list
        </Link>
        <h2 className="text-lg font-semibold text-slate-900">Send to vendors</h2>
        <span className="text-sm text-slate-500">— ask vendors for prices, bring them back, compare, and take one per cost code.</span>
      </div>

      {q.error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">{q.error}</p> : null}
      {q.made ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Sent to {q.made} vendor{q.made === "1" ? "" : "s"} — below, download the Excel file (or Print / PDF) and email it. When the vendor sends it back, their file is saved to
          Files → Bids.
        </p>
      ) : null}
      {importedBid ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Bid #{importedBid.number} ({importedBid.vendorName}) is back: {q.priced} item{q.priced === "1" ? "" : "s"} priced
          {Number(q.blank) > 0 ? `, ${q.blank} left blank` : ""}
          {Number(q.ladder) > 0 ? `, plus ${q.ladder} length${q.ladder === "1" ? "" : "s"} on the price list` : ""}. The file is in Files → Bids.
        </p>
      ) : null}
      {q.taken ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Took {q.taken} bid{q.taken === "1" ? "" : "s"} — {q.items} price{q.items === "1" ? "" : "s"}{" "}
          {q.scope === "COMPANY"
            ? locked
              ? "into the Item List (this job's prices are locked — Price review brings them in)"
              : "into the Item List for every job"
            : "on this job only"}
          .
          {Number(q.skipped) > 0
            ? ` ${q.skipped} line${q.skipped === "1" ? " isn't" : "s aren't"} an Item List item — price ${q.skipped === "1" ? "it" : "them"} on the takeoff.`
            : ""}
        </p>
      ) : null}

      {warnings.length ? (
        <div className="space-y-1.5">
          {warnings.map((w, i) => (
            <p key={i} className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <b>{w.codeLabel}:</b> Bid #{w.bidNumber} from {w.vendorName} came back <b>{pctText(w.pct)}</b> over the bid you took (same items, today&apos;s quantities).
              </span>
            </p>
          ))}
        </div>
      ) : null}

      {locked ? (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            Prices locked {fmtDate(project.pricesLockedAt!)} (proposal sent). New bids are re-bids, for seeing if you&apos;re over or under — you get a warning when one comes back{" "}
            {Math.round(OVER_WARNING * 100)}%+ over the bid you took.
          </span>
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="What to send, and who to"
          description="Each vendor gets the items you pick with quantities, as an Excel file (prices come back in by themselves) and a sheet you can print or save as PDF."
        />
        <CardBody>
          {groups.length ? (
            <RequestBids
              action={requestBids}
              addVendor={quickAddVendor}
              projectId={project.id}
              groups={groups}
              ladders={ladders}
              vendors={vendors.map((v) => ({ id: v.id, name: v.name, email: v.email, codes: vendorCodes(v) }))}
              locked={locked}
            />
          ) : (
            <EmptyState icon={FileSpreadsheet} title="Nothing to send yet" description="The Material list is empty — measure takeoffs with items on them first." />
          )}
        </CardBody>
      </Card>

      <Card>
        <div id="bids" className="scroll-mt-40" />
        <CardHeader
          title="Sent"
          description="Download each file and email it to the vendor. When they send it back, upload it on its row (or anywhere — the file knows which bid it is)."
          actions={cmp.bids.length ? <ImportButton action={importBid} projectId={project.id} /> : null}
        />
        {cmp.bids.length === 0 ? (
          <CardBody>
            <p className="text-sm text-slate-500">No bids yet.</p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Bid</th>
                  <th className="px-4 py-2">Vendor</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Files</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...cmp.bids].reverse().map((b) => {
                  const items = b.lines.filter((l) => !isLadderLine(l));
                  const ladder = b.lines.length - items.length;
                  const priced = items.filter((l) => l.unitPrice != null).length;
                  const v = vendors.find((x) => x.id === b.vendorId);
                  return (
                    <tr key={b.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="font-medium text-slate-900">#{b.number}</span>
                        <span className="block text-xs text-slate-500">sent {fmtDate(b.sentAt)}</span>
                        {b.afterLock ? <span className="mt-0.5 inline-block rounded-full bg-amber-50 px-2 text-[11px] font-medium text-amber-800">re-bid</span> : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-900">{b.vendorName}</span>
                        <span className="block text-xs text-slate-500">
                          {Array.from(new Set(items.map((l) => l.codeLabel))).join(" · ")} · {items.length} items
                          {ladder ? ` + ${ladder} lengths priced per board` : ""}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {b.status === "RECEIVED" ? (
                          <span className="text-emerald-700">
                            <Check className="mr-1 inline h-3.5 w-3.5" />
                            Back {b.receivedAt ? fmtDate(b.receivedAt) : ""}
                            <span className={cn("block text-xs", priced < items.length ? "text-amber-700" : "text-slate-500")}>
                              {priced} of {items.length} priced
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-500">Waiting</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <a href={`${base}/${b.id}/excel`} className="flex items-center gap-1 font-medium text-blue-700 hover:underline">
                          <Download className="h-3.5 w-3.5" /> Excel file
                        </a>
                        <Link href={`${base}/${b.id}/print`} className="mt-1 flex items-center gap-1 font-medium text-blue-700 hover:underline">
                          <Printer className="h-3.5 w-3.5" /> Print / PDF
                        </Link>
                        {b.returnFileId ? (
                          <a href={`/api/files/${b.returnFileId}?download=1`} className="mt-1 flex items-center gap-1 text-slate-600 hover:underline">
                            <Download className="h-3.5 w-3.5" /> Returned file
                          </a>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <EmailPreview
                            to={v?.email ?? ""}
                            {...emailFor(b, v?.contact ?? null)}
                            excelHref={`${base}/${b.id}/excel`}
                            printHref={`${base}/${b.id}/print`}
                            vendorName={b.vendorName}
                            bidNumber={b.number}
                          />
                          <ImportButton action={importBid} projectId={project.id} bidId={b.id} label="Import…" variant="ghost" />
                          <Link href={`${base}/${b.id}`} className={buttonClasses("ghost", "sm")} title="See the lines, or type in prices the vendor gave you another way">
                            <Pencil className="h-3.5 w-3.5" /> Prices
                          </Link>
                          <ConfirmForm
                            action={deleteBid}
                            hidden={{ projectId: project.id, bidId: b.id }}
                            message={`Delete bid #${b.number} (${b.vendorName})? A file they sent back stays in Files → Bids; prices you already took from it stay.`}
                            variant="ghost"
                          >
                            <span className="text-xs text-rose-600">Delete</span>
                          </ConfirmForm>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card>
        <div id="compare" className="scroll-mt-40" />
        <CardHeader
          title="Compare and take"
          description="Each bid's total for a cost code at today's quantities. Pick the one to use for each cost code, choose where its prices go, and take them."
        />
        {cmp.columns.length === 0 ? (
          <CardBody>
            <p className="text-sm text-slate-500">Bids show up here once they&apos;re back.</p>
          </CardBody>
        ) : (
          <form action={takeBids}>
            <input type="hidden" name="projectId" value={project.id} />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium uppercase tracking-wide">Cost code</th>
                    <th className="px-4 py-2 text-right font-medium uppercase tracking-wide">This job now</th>
                    {cmp.columns.map((c) => (
                      <th key={c.id} className="px-4 py-2 text-right font-medium">
                        <span className="block font-semibold text-slate-700">{c.vendorName}</span>#{c.number}
                        {c.afterLock ? " · re-bid" : ""}
                        {c.receivedAt ? ` · ${fmtDate(c.receivedAt)}` : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cmp.rows.map((r) => {
                    const complete = Object.entries(r.cells).filter(([, c]) => c.priced >= r.items);
                    const low = complete.length ? Math.min(...complete.map(([, c]) => c.total)) : null;
                    return (
                      <tr key={r.codeKey} className="align-top">
                        <td className="px-4 py-2.5">
                          <span className="font-medium text-slate-900">{r.codeLabel}</span>
                          <span className="block text-xs text-slate-500">
                            {r.items} item{r.items === 1 ? "" : "s"}
                            {r.awardBidId
                              ? ` · took #${cmp.columns.find((c) => c.id === r.awardBidId)?.number ?? "?"} ${r.awardScope === "COMPANY" ? "(Item List)" : "(this job)"}`
                              : ""}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{money(r.current)}</td>
                        {cmp.columns.map((c) => {
                          const cell = r.cells[c.id];
                          const vs = r.versusAward[c.id];
                          const taken = r.awardBidId === c.id;
                          if (!cell)
                            return (
                              <td key={c.id} className="px-4 py-2.5 text-right text-xs text-slate-300">
                                —
                              </td>
                            );
                          return (
                            <td key={c.id} className={cn("px-4 py-2.5 text-right", taken && "bg-blue-50/60")}>
                              <label className="inline-flex cursor-pointer items-center gap-2">
                                <span
                                  className={cn(
                                    "tabular-nums",
                                    low != null && cell.priced >= r.items && Math.abs(cell.total - low) < 0.005 ? "font-semibold text-emerald-700" : "text-slate-800",
                                  )}
                                >
                                  {money(cell.total)}
                                </span>
                                <input
                                  type="radio"
                                  name={`pick:${r.codeKey}`}
                                  value={c.id}
                                  defaultChecked={taken}
                                  className="h-4 w-4"
                                  aria-label={`Use ${c.vendorName} #${c.number} for ${r.codeLabel}`}
                                />
                              </label>
                              {cell.priced < r.items ? (
                                <span className="block text-[11px] text-amber-700">
                                  {cell.priced} of {r.items} priced
                                </span>
                              ) : null}
                              {cell.substitutes ? (
                                <span className="block text-[11px] text-slate-500">
                                  {cell.substitutes} substitute{cell.substitutes === 1 ? "" : "s"}
                                </span>
                              ) : null}
                              {taken ? <span className="block text-[11px] font-medium text-blue-700">taken</span> : null}
                              {vs != null ? (
                                <span className={cn("block text-[11px] font-medium", vs >= OVER_WARNING ? "text-rose-700" : vs > 0 ? "text-amber-700" : "text-emerald-700")}>
                                  {pctText(vs)} vs taken
                                </span>
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 px-4 py-3">
              <label className="text-sm text-slate-700" htmlFor="take-scope">
                Put the prices on
              </label>
              <select id="take-scope" name="scope" className="input !w-auto" defaultValue="JOB">
                <option value="JOB">This job only</option>
                <option value="COMPANY">The Item List — every job</option>
              </select>
              <SubmitButton pendingText="Taking…">Take the picked bids</SubmitButton>
              <span className="text-xs text-slate-500">
                {locked
                  ? "Prices are locked: “This job only” changes this job's prices; “Item List” updates the company prices and leaves this job as it is."
                  : "“This job only” keeps them on this job (pinned). “Item List” updates the company prices and the item's vendor — every unlocked job follows."}{" "}
                Green = lowest complete bid. The estimate updates the next time it&apos;s opened.
              </span>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

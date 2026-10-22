import Link from "@/components/link";
import { AlertTriangle, ArrowLeft, Check, Download, Eye, FileSpreadsheet, FileText, Lock, Pencil, Printer, Replace } from "lucide-react";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { activeCostCodes, getProject } from "@/lib/projects";
import { bidComparison, codeGroups, isLadderLine, overWarnings, OVER_WARNING, priceLadders } from "@/lib/bids";
import { vendorCodes } from "@/lib/vendors";
import { cn, fmtDate, money } from "@/lib/utils";
import { substituteLength } from "@/lib/takeoff";
import { Card, CardBody, CardHeader, ConfirmForm, EmptyState, SubmitButton, buttonClasses } from "@/components/ui";
import { RequestBids } from "./_components/request-bids";
import { ImportButton } from "./_components/import-button";
import { EmailPreview } from "./_components/email-preview";
import { companyLines } from "@/lib/company";
import { bidEmailText, emailedBids, subBidEmailText } from "@/lib/bid-email";
import { planChoices, readPlanIds, subComparison } from "@/lib/sub-bids";
import { codeLabelOf } from "@/lib/takeoff-materials";
import { SendToSubs } from "./_components/send-to-subs";
import { makeBidLink } from "@/lib/bid-link";
import { appUrl } from "@/lib/mail";
import { EmailAllButton } from "./_components/email-all";
import { deleteBid, importBid, quickAddVendor, quickEditVendor, requestBids, requestSubBids, takeBids, takeSubBids } from "./actions";

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
    subs?: string;
    /** Bids whose email window opens by itself (just made by Send to subs). */
    open?: string;
    subTaken?: string;
    items?: string;
    skipped?: string;
    scope?: string;
    error?: string;
    subbed?: string;
    kept?: string;
    /** Taking bids with substitutes on them: what you picked, waiting on "use theirs / keep mine". */
    confirm?: string;
  }>;
}) {
  await requireView("estimates", { costs: "/dashboard" });
  const { id } = await params;
  const q = await searchParams;
  const project = await getProject(id);
  const [cmp, vendors, company, subCmp, plans, costCodes] = await Promise.all([
    bidComparison(project.id),
    db.vendor.findMany({ orderBy: { name: "asc" } }),
    db.company.findFirst(),
    subComparison(project.id),
    planChoices(project.id),
    activeCostCodes(),
  ]);
  const groups = codeGroups(cmp.lines).map((g) => ({
    codeKey: g.codeKey,
    codeLabel: g.codeLabel,
    items: cmp.lines
      .filter((l) => l.codeKey === g.codeKey)
      .map((l) => ({ key: l.key, name: l.name, quantity: l.quantity, unit: l.unit, extended: l.extended })),
  }));
  const warnings = overWarnings(cmp);
  const ladders = await priceLadders(project.id, cmp.lines);
  const locked = !!project.pricesLockedAt;
  const base = `/projects/${project.id}/bids`;
  const openNow = new Set((q.open ?? "").split(",").filter(Boolean));
  const importedBid = q.imported ? cmp.bids.find((b) => b.id === q.imported) : null;
  const from = companyLines(company);
  const address = [project.address, [project.city, project.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  // "Take the picked bids" found substitutes: they're asked about here before anything is priced.
  const confirm = (() => {
    try {
      const v = q.confirm ? (JSON.parse(q.confirm) as { picks: { codeKey: string; bidId: string }[]; scope: string; reapply: boolean }) : null;
      return v && Array.isArray(v.picks) && v.picks.length ? v : null;
    } catch {
      return null;
    }
  })();
  const subLines = confirm
    ? await db.bidLine.findMany({
        where: { OR: confirm.picks.map((p) => ({ bidId: p.bidId, codeKey: p.codeKey })), unitPrice: { not: null }, substitute: { not: null } },
        orderBy: [{ codeLabel: "asc" }, { sortOrder: "asc" }],
        include: { bid: { select: { number: true, vendorName: true } } },
      })
    : [];
  /** The email to a vendor about a bid — shown to you first (EmailPreview), then sent from here (or opened in your email program). */
  const emailFor = (b: (typeof cmp.bids)[number], contact: string | null) =>
    b.kind === "SUB"
      ? subBidEmailText({ bid: b, project, address, contact, from, plans: readPlanIds(b.planFileIds).length })
      : bidEmailText({ bid: b, project, address, contact, from, standard: company?.bidMessage });
  // Which bids were emailed from here, when, and to whom (the job's activity).
  const emailed = emailedBids(
    await db.activity.findMany({
      where: { projectId: project.id, type: "bid.emailed" },
      orderBy: { createdAt: "desc" },
      select: { description: true, createdAt: true },
    }),
  );
  const waitingToEmail = cmp.bids.filter((b) => b.status !== "RECEIVED" && !emailed.has(b.number)).length;
  // Each bid's link for the vendor to type prices online (in its email; no sign-in).
  const onlineUrls = new Map(await Promise.all(cmp.bids.map(async (b) => [b.id, appUrl(`/prices/${await makeBidLink(b.id, b.companyId)}`)] as const)));

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
      {confirm && subLines.length ? (
        <form action={takeBids} id="substitutes" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="scope" value={confirm.scope} />
          {confirm.reapply ? <input type="hidden" name="reapply" value="1" /> : null}
          {confirm.picks.map((p) => (
            <input key={p.codeKey} type="hidden" name={`pick:${p.codeKey}`} value={p.bidId} />
          ))}
          <p className="flex items-center gap-1.5 font-semibold text-amber-950">
            <Replace className="h-4 w-4" />{" "}
            {subLines.length === 1 ? "A vendor quoted a different product" : `Vendors quoted a different product on ${subLines.length} lines`}
          </p>
          <p className="text-sm text-amber-900">
            Their price is for what they quoted, not what you asked for. Use theirs and this job orders their product, at their price (swap back any time on the
            Material list) — or keep yours and leave that line&apos;s price out.
          </p>
          <ul className="mt-2 divide-y divide-amber-200/70">
            {subLines.map((l) => {
              const length = substituteLength(l.name, l.substitute!);
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block text-slate-900">
                      You asked for <span className="font-medium">{l.name}</span> — they quoted <span className="font-medium">{l.substitute}</span> at{" "}
                      <span className="font-medium">
                        {money(l.unitPrice!)}/{l.unit}
                      </span>
                    </span>
                    <span className="block text-xs text-slate-500">
                      Bid #{l.bid.number} {l.bid.vendorName} · {l.codeLabel}
                      {length ? ` · same board at ${length}' — pieces cut from ${l.name.replace(/^.* × /, "")} come from ${length}' boards` : ""}
                      {l.note ? ` · “${l.note}”` : ""}
                    </span>
                  </span>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-slate-800">
                    <input type="radio" name={`sub:${l.id}`} value="use" required className="h-4 w-4" /> Use theirs
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-1.5 font-medium text-slate-800">
                    <input type="radio" name={`sub:${l.id}`} value="keep" required className="h-4 w-4" /> Keep mine
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-2 flex items-center gap-2">
            <SubmitButton pendingText="Taking…">Take the bids</SubmitButton>
            <Link href={`${base}#compare`} className={buttonClasses("ghost", "sm")}>
              Cancel
            </Link>
          </div>
        </form>
      ) : null}
      {q.made && q.subs ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Made {q.made} sub bid{q.made === "1" ? "" : "s"} — {q.made === "1" ? "its email is open" : "their emails open one after another"}: read it over and
          click Send. Closed one by mistake? Click Email on its row below. Whatever they send back goes in Files → Bids.
        </p>
      ) : null}
      {q.subTaken ? <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">{q.subTaken}</p> : null}
      {q.made && !q.subs ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          Sent to {q.made} vendor{q.made === "1" ? "" : "s"} — below, download the Excel file (or Print / PDF) and email it. When the vendor sends it back,
          their file is saved to Files → Bids.
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
          .{Number(q.subbed) > 0 ? ` ${q.subbed} substitute${q.subbed === "1" ? "" : "s"} used — see Substitutions on the Material list.` : ""}
          {Number(q.kept) > 0 ? ` ${q.kept} substitute${q.kept === "1" ? "" : "s"} turned down (kept your item's price).` : ""}
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
                <b>{w.codeLabel}:</b> Bid #{w.bidNumber} from {w.vendorName} came back <b>{pctText(w.pct)}</b> over the bid you took (same items, today&apos;s
                quantities).
              </span>
            </p>
          ))}
        </div>
      ) : null}

      {locked ? (
        <p className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            Prices locked {fmtDate(project.pricesLockedAt!)} (proposal sent). New bids are re-bids, for seeing if you&apos;re over or under — you get a warning
            when one comes back {Math.round(OVER_WARNING * 100)}%+ over the bid you took.
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
              editVendor={quickEditVendor}
              projectId={project.id}
              groups={groups}
              ladders={ladders}
              vendors={vendors.map((v) => ({ id: v.id, name: v.name, email: v.email, contact: v.contact, phone: v.phone, codes: vendorCodes(v) }))}
              locked={locked}
            />
          ) : (
            <EmptyState
              icon={FileSpreadsheet}
              title="Nothing to send yet"
              description="The Material list is empty — measure takeoffs with items on them first."
            />
          )}
        </CardBody>
      </Card>

      <Card>
        <div id="subs" className="scroll-mt-40" />
        <CardHeader
          title="Send to subs"
          description="Ask subs to bid a whole trade from the plans: they get a link to the plans and send their price (and their own quote) back on it. Or they email you their quote — add it on their row."
        />
        <CardBody>
          <SendToSubs
            action={requestSubBids}
            addVendor={quickAddVendor}
            editVendor={quickEditVendor}
            projectId={project.id}
            codes={costCodes.map((c) => ({ id: c.id, label: codeLabelOf(c) }))}
            vendors={vendors.map((v) => ({ id: v.id, name: v.name, email: v.email, contact: v.contact, phone: v.phone, codes: vendorCodes(v) }))}
            plans={plans}
          />
        </CardBody>
      </Card>

      <Card>
        <div id="bids" className="scroll-mt-40" />
        <CardHeader
          title="Sent"
          description="Email each bid to its vendor from here (the Excel file goes with it), or all of them at once. When they send it back, upload it on its row (or anywhere — the file knows which bid it is)."
          actions={
            cmp.bids.length ? (
              <>
                {waitingToEmail ? <EmailAllButton projectId={project.id} count={waitingToEmail} /> : null}
                <ImportButton action={importBid} projectId={project.id} />
              </>
            ) : null
          }
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
                  const sub = b.kind === "SUB";
                  const planCount = sub ? readPlanIds(b.planFileIds).length : 0;
                  return (
                    <tr key={b.id} className="align-top">
                      <td className="whitespace-nowrap px-4 py-2.5">
                        <span className="font-medium text-slate-900">#{b.number}</span>
                        <span className="block text-xs text-slate-500">made {fmtDate(b.sentAt)}</span>
                        {emailed.get(b.number) ? (
                          <span className="block text-xs text-emerald-700" title={`Emailed to ${emailed.get(b.number)!.to}`}>
                            emailed {fmtDate(emailed.get(b.number)!.at)}
                          </span>
                        ) : (
                          <span className="block text-xs text-amber-700">not emailed</span>
                        )}
                        {b.afterLock ? (
                          <span className="mt-0.5 inline-block rounded-full bg-amber-50 px-2 text-[11px] font-medium text-amber-800">re-bid</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-slate-900">{b.vendorName}</span>
                        {sub ? <span className="ml-1.5 rounded-full bg-violet-50 px-2 text-[11px] font-medium text-violet-800">sub</span> : null}
                        <span className="block text-xs text-slate-500">
                          {Array.from(new Set(items.map((l) => l.codeLabel))).join(" · ")}
                          {sub ? (b.dueAt ? ` · due ${fmtDate(b.dueAt)}` : "") : ` · ${items.length} items`}
                          {ladder ? ` + ${ladder} lengths priced per board` : ""}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {b.status === "RECEIVED" ? (
                          <span className="text-emerald-700">
                            <Check className="mr-1 inline h-3.5 w-3.5" />
                            Back {b.receivedAt ? fmtDate(b.receivedAt) : ""}
                            <span className={cn("block text-xs", priced < items.length ? "text-amber-700" : "text-slate-500")}>
                              {sub ? money(items.reduce((n, l) => n + (l.unitPrice ?? 0) * l.quantity, 0)) : `${priced} of ${items.length} priced`}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-500">Waiting</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        {sub ? (
                          <span className="flex items-center gap-1 text-slate-600">
                            <FileText className="h-3.5 w-3.5" /> {planCount ? `${planCount} plan file${planCount === 1 ? "" : "s"}` : "No plans"}
                          </span>
                        ) : (
                          <>
                            <a href={`${base}/${b.id}/excel`} className="flex items-center gap-1 font-medium text-blue-700 hover:underline">
                              <Download className="h-3.5 w-3.5" /> Excel file
                            </a>
                            <a
                              href={`${base}/${b.id}/pdf`}
                              target="_blank"
                              rel="noopener"
                              className="mt-1 flex items-center gap-1 font-medium text-blue-700 hover:underline"
                            >
                              <Printer className="h-3.5 w-3.5" /> PDF
                            </a>
                          </>
                        )}
                        {b.returnFileId || b.status === "RECEIVED" ? (
                          <Link
                            href={`${base}/${b.id}/reply`}
                            className="mt-1 flex items-center gap-1 font-medium text-emerald-700 hover:underline"
                            title="Their prices as they sent them"
                          >
                            <Eye className="h-3.5 w-3.5" /> What they sent
                          </Link>
                        ) : null}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <EmailPreview
                            projectId={project.id}
                            bidId={b.id}
                            emailedTo={emailed.get(b.number)?.to ?? null}
                            to={v?.email ?? ""}
                            {...emailFor(b, v?.contact ?? null)}
                            excelHref={sub ? null : `${base}/${b.id}/excel`}
                            pdfHref={sub ? null : `${base}/${b.id}/pdf`}
                            sub={sub}
                            autoOpen={openNow.has(b.id)}
                            onlineUrl={onlineUrls.get(b.id) ?? ""}
                            vendorName={b.vendorName}
                            bidNumber={b.number}
                          />
                          <ImportButton action={importBid} projectId={project.id} bidId={b.id} label="Add what they sent…" variant="ghost" />
                          <Link
                            href={`${base}/${b.id}`}
                            className={buttonClasses("ghost", "sm")}
                            title={sub ? "Type in the price they gave you another way" : "See the lines, or type in prices the vendor gave you another way"}
                          >
                            <Pencil className="h-3.5 w-3.5" /> {sub ? "Price" : "Prices"}
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
                                    low != null && cell.priced >= r.items && Math.abs(cell.total - low) < 0.005
                                      ? "font-semibold text-emerald-700"
                                      : "text-slate-800",
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
                                <span
                                  className={cn(
                                    "block text-[11px] font-medium",
                                    vs >= OVER_WARNING ? "text-rose-700" : vs > 0 ? "text-amber-700" : "text-emerald-700",
                                  )}
                                >
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

      {subCmp.rows.length ? (
        <Card>
          <div id="subcompare" className="scroll-mt-40" />
          <CardHeader
            title="Compare subs"
            description="Each sub's price for each trade. Pick one per trade and take it — and put its price in the budget if you want."
          />
          {subCmp.columns.length === 0 ? (
            <CardBody>
              <p className="text-sm text-slate-500">Subs&apos; bids show up here once they&apos;re back.</p>
            </CardBody>
          ) : (
            <form action={takeSubBids}>
              <input type="hidden" name="projectId" value={project.id} />
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs text-slate-500">
                    <tr>
                      <th className="px-4 py-2 font-medium uppercase tracking-wide">Trade</th>
                      {subCmp.columns.map((c) => (
                        <th key={c.id} className="px-4 py-2 text-right font-medium">
                          <span className="block font-semibold text-slate-700">{c.vendorName}</span>#{c.number}
                          {c.receivedAt ? ` · ${fmtDate(c.receivedAt)}` : ""}
                          <Link href={`${base}/${c.id}/reply`} className="ml-1 font-medium text-blue-700 hover:underline">
                            see it
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {subCmp.rows.map((r) => {
                      const totals = Object.values(r.cells).map((c) => c.total);
                      const low = totals.length ? Math.min(...totals) : null;
                      return (
                        <tr key={r.codeKey} className="align-top">
                          <td className="px-4 py-2.5">
                            <span className="font-medium text-slate-900">{r.codeLabel}</span>
                            {r.awardBidId ? (
                              <span className="block text-xs text-slate-500">
                                took #{subCmp.columns.find((c) => c.id === r.awardBidId)?.number ?? "?"}
                                {r.awardScope === "BUDGET" ? " · in the budget" : ""}
                              </span>
                            ) : null}
                          </td>
                          {subCmp.columns.map((c) => {
                            const cell = r.cells[c.id];
                            const taken = r.awardBidId === c.id;
                            if (!cell)
                              return (
                                <td key={c.id} className="px-4 py-2.5 text-right text-xs text-slate-300">
                                  —
                                </td>
                              );
                            return (
                              <td key={c.id} className={cn("max-w-56 px-4 py-2.5 text-right", taken && "bg-blue-50/60")}>
                                <label className="inline-flex cursor-pointer items-center gap-2">
                                  <span
                                    className={cn(
                                      "tabular-nums",
                                      low != null && Math.abs(cell.total - low) < 0.005 ? "font-semibold text-emerald-700" : "text-slate-800",
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
                                {cell.note ? <span className="mt-0.5 block text-left text-[11px] leading-snug text-slate-500">{cell.note}</span> : null}
                                {taken ? <span className="block text-[11px] font-medium text-blue-700">taken</span> : null}
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
                <label className="inline-flex items-center gap-1.5 text-sm text-slate-700">
                  <input type="checkbox" name="budget" value="1" defaultChecked className="h-4 w-4 rounded border-slate-300" /> Put the price in the budget
                </label>
                <SubmitButton pendingText="Taking…">Take the picked bids</SubmitButton>
                <span className="text-xs text-slate-500">
                  The budget: the price goes on that cost code&apos;s line in the draft estimate (one line — the takeoff stops changing it). A sent or approved
                  estimate isn&apos;t changed. Green = lowest. Taking a bid closes its online page; Purchasing can make the PO from it.
                </span>
              </div>
            </form>
          )}
        </Card>
      ) : null}
    </div>
  );
}

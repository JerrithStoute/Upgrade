import Link from "@/components/link";
import { CheckCircle2, ClipboardList, FileWarning, Pencil, Plus, Truck, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { codeLabelOf } from "@/lib/takeoff-materials";
import { Button, ButtonLink, Collapsible, ConfirmForm, EmptyState, PageHeader, SubmitButton, TBody, THead, Table, Td, Th, Tr, buttonClasses } from "@/components/ui";
import { vendorCodes } from "@/lib/vendors";
import { paperworkWarning, type PaperLine } from "@/lib/paperwork";
import { vendorsPaperwork } from "@/lib/paperwork-server";
import { companyClock } from "@/lib/company-zone";
import { fmtDate } from "@/lib/utils";
import { createVendor, deleteVendor, importVendors, setBidMessage } from "./actions";
import { requireView } from "@/lib/auth";

/** What the paste box shows before you paste. */
const PASTE_EXAMPLE = ["Beaumont Lumber, Mike, mike@beaumontlumber.com, 409-555-0100", "BMC, bids@bmc.com"].join(String.fromCharCode(10));

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ added?: string; updated?: string; same?: string; error?: string; bidMessage?: string }> }) {
  await requireView("lists");
  const { added, updated, same, error, bidMessage } = await searchParams;
  const today = (await companyClock()).now;
  const [vendors, costCodes, paper, company] = await Promise.all([
    db.vendor.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { bids: true, logins: true } } } }),
    db.costCode.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true } }),
    vendorsPaperwork(undefined, today),
    db.company.findFirst({ select: { bidMessage: true } }),
  ]);
  const paperOf = new Map(paper.map((p) => [p.vendor.id, p]));
  const codes = [...costCodes.map((c) => ({ id: c.id, label: codeLabelOf(c) })), { id: "none", label: "No cost code" }];
  const labelOf = new Map(codes.map((c) => [c.id, c.label]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Subs & vendors"
        description="Who you buy from and hire, and the paperwork you need from each."
        actions={
          <ButtonLink href="/vendors/paperwork" variant="secondary">
            <ClipboardList className="h-4 w-4" /> Paperwork settings
          </ButtonLink>
        }
      />
      <p className="text-sm text-slate-600">
        You don&apos;t have to set them up first: a vendor is added the first time you type one (sending to vendors, a PO, an item&apos;s Vendor box), or with{" "}
        <strong>+ New vendor…</strong> at the bottom of any vendor list. Change a name here and it changes everywhere.
      </p>
      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">{error}</p> : null}
      {added != null ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          {added} vendor{added === "1" ? "" : "s"} added
          {Number(updated) > 0 ? `, ${updated} you already had got missing details filled in` : ""}
          {Number(same) > 0 ? `, ${same} you already had were left as they are` : ""}.
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Collapsible
          defaultOpen={false}
          summary={
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add a vendor
            </span>
          }
        >
          <form action={createVendor} className="flex flex-wrap items-center gap-1.5">
            <input name="name" required className="input !h-8 !w-64 !py-0 text-sm" placeholder="Smith Framing" aria-label="New vendor's name" />
            <SubmitButton size="sm" pendingText="Adding…">
              Add and open
            </SubmitButton>
            <span className="w-full text-xs text-slate-500">Their page opens to fill in the rest: contact, address, paperwork…</span>
          </form>
        </Collapsible>
        <Collapsible
          defaultOpen={false}
          summary={
            <span className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Have a list? Paste or upload it (optional)
            </span>
          }
        >
          <form action={importVendors} className="space-y-3">
            <p className="text-xs text-slate-500">
              Copy the rows from Excel (or any list) and paste them, or upload a CSV or Excel file — an export from QuickBooks or CoConstruct works. One vendor per line, name
              first; emails and phone numbers are picked out wherever they are. A heading row (Name, Contact, Email, Phone) is used if there is one. Vendors you already have are
              kept — only their blank details are filled in.
            </p>
            <textarea name="paste" rows={5} className="input font-mono text-xs" placeholder={PASTE_EXAMPLE} aria-label="Pasted vendor list" />
            <div className="flex flex-wrap items-center gap-3">
              <input type="file" name="file" accept=".csv,.txt,.xlsx" className="text-xs" aria-label="Vendor list file" />
              <SubmitButton pendingText="Adding…">Add vendors</SubmitButton>
            </div>
          </form>
        </Collapsible>
      </div>

      <form action={setBidMessage} className="space-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <p className="font-medium text-slate-800">Your bid email message</p>
        <p className="text-xs text-slate-500">
          Your words in the middle of every bid email. The greeting (&ldquo;Hello Pat,&rdquo;), the bid&apos;s own note, the job, the delivery address and your signature are
          filled in around them for each bid. Leave it blank to use the built-in message. You can also set it from any bid&apos;s email: &ldquo;Use as my standard
          message&rdquo;.
        </p>
        <textarea
          name="bidMessage"
          rows={4}
          className="input"
          defaultValue={company?.bidMessage ?? ""}
          placeholder="Please send your prices for the attached list by Friday. Prices good for 30 days, delivered to the job site — call before you come."
        />
        <div className="flex items-center gap-3">
          <Button type="submit" size="sm" variant="secondary">
            Save
          </Button>
          {bidMessage ? <span className="text-xs text-emerald-700">Saved — bid emails start with it now.</span> : null}
        </div>
      </form>

      {vendors.length === 0 ? (
        <EmptyState icon={Truck} title="No vendors yet" description="They'll show up here as you send your first bids — or add one, or paste your list, above." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Vendor</Th>
              <Th>Contact</Th>
              <Th>Cost codes</Th>
              <Th>Paperwork</Th>
              <Th right>Bids</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {vendors.map((v) => (
                <Tr key={v.id}>
                  <Td>
                    <Link id={`vendor-${v.id}`} href={`/vendors/${v.id}`} className="scroll-mt-24 font-medium text-slate-900 hover:text-blue-700">
                      {v.name}
                    </Link>
                    {v.notes ? <span className="block text-xs text-slate-500">{v.notes}</span> : null}
                  </Td>
                  <Td className="text-xs text-slate-600">
                    {[v.contact, v.email, v.phone].filter(Boolean).map((x) => (
                      <span key={x} className="block">
                        {x}
                      </span>
                    ))}
                  </Td>
                  <Td className="max-w-md text-xs text-slate-600">
                    {vendorCodes(v)
                      .map((id) => labelOf.get(id))
                      .filter(Boolean)
                      .join(" · ") || <span className="text-slate-400">—</span>}
                  </Td>
                  <Td className="text-xs">
                    <PaperworkChip href={`/vendors/${v.id}`} lines={paperOf.get(v.id)?.lines ?? []} toConfirm={paperOf.get(v.id)?.toConfirm ?? 0} logins={v._count.logins} />
                  </Td>
                  <Td right className="text-xs text-slate-500">
                    {v._count.bids}
                  </Td>
                  <Td right>
                    <div className="flex justify-end gap-1">
                      <Link href={`/vendors/${v.id}?edit=1`} className={buttonClasses("ghost", "sm")}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Link>
                      <ConfirmForm action={deleteVendor} hidden={{ id: v.id }} message={`Delete "${v.name}"? Their bids stay on your jobs.`} variant="ghost">
                        <span className="text-xs text-rose-600">Delete</span>
                      </ConfirmForm>
                    </div>
                  </Td>
                </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function PaperworkChip({ href, lines, toConfirm, logins }: { href: string; lines: PaperLine[]; toConfirm: number; logins: number }) {
  const needed = lines.filter((l) => l.needed);
  const warning = paperworkWarning(lines, (d) => fmtDate(d, "MMM d"));
  return (
    <Link href={href} className="block hover:underline">
      {!needed.length ? (
        <span className="text-slate-400">Nothing needed</span>
      ) : warning ? (
        <span className="flex items-start gap-1 text-amber-700">
          <FileWarning className="mt-px h-3.5 w-3.5 shrink-0" /> {warning}
        </span>
      ) : (
        <span className="flex items-center gap-1 text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> All in
        </span>
      )}
      {toConfirm ? <span className="block text-sky-700">{toConfirm} sent to look over</span> : null}
      {logins ? (
        <span className="block text-slate-500">
          {logins} portal login{logins === 1 ? "" : "s"}
        </span>
      ) : null}
    </Link>
  );
}

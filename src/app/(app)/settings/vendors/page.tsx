import Link from "next/link";
import { Pencil, Plus, ShieldAlert, ShieldCheck, Truck, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { codeLabelOf } from "@/lib/takeoff-materials";
import { Button, Collapsible, ConfirmForm, EmptyState, Field, FormGrid, SubmitButton, TBody, THead, Table, Td, Th, Tr, buttonClasses } from "@/components/ui";
import { CodePicker } from "@/components/code-picker";
import { vendorCodes } from "@/lib/vendors";
import { COVERAGE_TYPES, coverageWarning, parseRequired, vendorsCoverage } from "@/lib/purchasing";
import { fmtDate } from "@/lib/utils";
import { createVendor, deleteVendor, importVendors, setRequiredCoverage, updateVendor } from "./actions";

/** What the paste box shows before you paste. */
const PASTE_EXAMPLE = ["Beaumont Lumber, Mike, mike@beaumontlumber.com, 409-555-0100", "BMC, bids@bmc.com"].join(String.fromCharCode(10));

type VendorValues = { id: string; name: string; contact: string | null; email: string | null; phone: string | null; notes: string | null; costCodeIds: string | null };

function VendorForm({ action, values, codes }: { action: (fd: FormData) => Promise<void>; values?: VendorValues; codes: { id: string; label: string }[] }) {
  const p = (k: string) => `vendor-${values?.id ?? "new"}-${k}`;
  return (
    <form action={action} className="space-y-4">
      {values ? <input type="hidden" name="id" value={values.id} /> : null}
      <FormGrid className="md:grid-cols-4">
        <Field label="Vendor" htmlFor={p("name")} className="md:col-span-2">
          <input id={p("name")} name="name" required className="input" defaultValue={values?.name} placeholder="Beaumont Lumber" />
        </Field>
        <Field label="Contact" htmlFor={p("contact")}>
          <input id={p("contact")} name="contact" className="input" defaultValue={values?.contact ?? ""} placeholder="Who you send bids to" />
        </Field>
        <Field label="Phone" htmlFor={p("phone")}>
          <input id={p("phone")} name="phone" className="input" defaultValue={values?.phone ?? ""} />
        </Field>
        <Field label="Email" htmlFor={p("email")} className="md:col-span-2">
          <input id={p("email")} name="email" type="email" className="input" defaultValue={values?.email ?? ""} placeholder="bids@vendor.com" />
        </Field>
        <Field label="Notes" htmlFor={p("notes")} className="md:col-span-2">
          <input id={p("notes")} name="notes" className="input" defaultValue={values?.notes ?? ""} placeholder="Delivery days, account #…" />
        </Field>
      </FormGrid>
      <Field label="Cost codes they bid" hint="Picked for them when you request bids on a job — you can always change it there.">
        <CodePicker idPrefix={p("codes")} codes={codes} picked={values ? vendorCodes(values) : []} />
      </Field>
      <div className="flex items-center gap-2">
        <SubmitButton>{values ? "Save vendor" : "Add vendor"}</SubmitButton>
        {values ? (
          <Link href="/settings/vendors" className={buttonClasses("ghost")}>
            Cancel
          </Link>
        ) : null}
      </div>
    </form>
  );
}

export default async function VendorsPage({ searchParams }: { searchParams: Promise<{ edit?: string; added?: string; updated?: string; same?: string; error?: string }> }) {
  const { edit, added, updated, same, error } = await searchParams;
  const [vendors, costCodes, coverage, company] = await Promise.all([
    db.vendor.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { bids: true, logins: true } } } }),
    db.costCode.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }, { name: "asc" }], select: { id: true, code: true, name: true } }),
    vendorsCoverage(),
    db.company.findFirst({ select: { requiredCoverage: true } }),
  ]);
  const coverageOf = new Map(coverage.map((c) => [c.vendor.id, c.state]));
  const required = parseRequired(company?.requiredCoverage);
  const codes = [...costCodes.map((c) => ({ id: c.id, label: codeLabelOf(c) })), { id: "none", label: "No cost code" }];
  const labelOf = new Map(codes.map((c) => [c.id, c.label]));

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-600">
        The suppliers you ask for prices. You don&apos;t have to set them up first: a vendor is added here the first time you type one — when you <strong>send to vendors</strong>{" "}
        from a job&apos;s Material list, or in an item&apos;s Vendor box on the Item List. Change a name here and it changes everywhere.
      </p>
      {error ? <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800">{error}</p> : null}
      {added != null ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
          {added} vendor{added === "1" ? "" : "s"} added
          {Number(updated) > 0 ? `, ${updated} you already had got missing details filled in` : ""}
          {Number(same) > 0 ? `, ${same} you already had were left as they are` : ""}.
        </p>
      ) : null}
      <div className="grid gap-3 lg:grid-cols-2">
        <Collapsible
          defaultOpen={false}
          summary={
            <span className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add a vendor
            </span>
          }
        >
          <VendorForm action={createVendor} codes={codes} />
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

      <form action={setRequiredCoverage} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <span className="font-medium text-slate-800">Insurance every sub needs:</span>
        {COVERAGE_TYPES.filter((t) => t.value !== "OTHER").map((t) => (
          <label key={t.value} className="flex items-center gap-1.5 text-slate-700">
            <input type="checkbox" name="type" value={t.value} defaultChecked={required.includes(t.value)} className="h-4 w-4 rounded border-slate-300" />
            {t.label}
          </label>
        ))}
        <Button type="submit" size="sm" variant="secondary">
          Save
        </Button>
        <span className="text-xs text-slate-500">Open a vendor to add their certificates and portal logins.</span>
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
              <Th>Insurance</Th>
              <Th right>Bids</Th>
              <Th />
            </tr>
          </THead>
          <TBody>
            {vendors.map((v) =>
              edit === v.id ? (
                <tr key={v.id} id={`vendor-${v.id}`}>
                  <td colSpan={6} className="bg-slate-50/50 px-4 py-4">
                    <VendorForm action={updateVendor} values={v} codes={codes} />
                  </td>
                </tr>
              ) : (
                <Tr key={v.id}>
                  <Td>
                    <Link id={`vendor-${v.id}`} href={`/settings/vendors/${v.id}`} className="scroll-mt-24 font-medium text-slate-900 hover:text-blue-700">
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
                    <InsuranceChip href={`/settings/vendors/${v.id}`} state={coverageOf.get(v.id) ?? null} logins={v._count.logins} />
                  </Td>
                  <Td right className="text-xs text-slate-500">
                    {v._count.bids}
                  </Td>
                  <Td right>
                    <div className="flex justify-end gap-1">
                      <Link href={`/settings/vendors?edit=${v.id}#vendor-${v.id}`} className={buttonClasses("ghost", "sm")}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Link>
                      <ConfirmForm action={deleteVendor} hidden={{ id: v.id }} message={`Delete "${v.name}"? Their bids stay on your jobs.`} variant="ghost">
                        <span className="text-xs text-rose-600">Delete</span>
                      </ConfirmForm>
                    </div>
                  </Td>
                </Tr>
              ),
            )}
          </TBody>
        </Table>
      )}
    </div>
  );
}

function InsuranceChip({ href, state, logins }: { href: string; state: Awaited<ReturnType<typeof vendorsCoverage>>[number]["state"]; logins: number }) {
  return (
    <Link href={href} className="block hover:underline">
      {!state ? (
        <span className="text-slate-400">Not tracked</span>
      ) : state.ok ? (
        <span className="flex items-center gap-1 text-emerald-700">
          <ShieldCheck className="h-3.5 w-3.5" /> Covered
        </span>
      ) : (
        <span className="flex items-start gap-1 text-amber-700">
          <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" /> {coverageWarning(state, (d) => fmtDate(d, "MMM d"))}
        </span>
      )}
      {state?.unconfirmed ? <span className="block text-sky-700">{state.unconfirmed} to confirm</span> : null}
      {logins ? (
        <span className="block text-slate-500">
          {logins} portal login{logins === 1 ? "" : "s"}
        </span>
      ) : null}
    </Link>
  );
}

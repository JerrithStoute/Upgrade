import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import { db } from "@/lib/db";
import { cn, dateInput, fmtDate, money } from "@/lib/utils";
import { COVERAGE_TYPES, PO_STATUS_LABEL, SOON_DAYS, coverageLabel, coverageWarning, poTotal, vendorCoverage } from "@/lib/purchasing";
import { Badge, Button, Card, CardBody, CardHeader, ConfirmForm, SubmitButton, Table, THead, TBody, Tr, Th, Td } from "@/components/ui";
import { addInsurance, confirmInsurance, createVendorLogin, deleteInsurance, deleteVendorLogin, setInsuranceRequired, updateVendorLogin } from "../actions";

export default async function VendorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vendor = await db.vendor.findUnique({
    where: { id },
    include: {
      insurance: { orderBy: [{ type: "asc" }, { expiresAt: "desc" }] },
      logins: { orderBy: { name: "asc" }, select: { id: true, name: true, email: true, active: true } },
      purchaseOrders: { orderBy: { number: "desc" }, include: { lines: true, project: { select: { id: true, name: true } } } },
      _count: { select: { bills: true } },
    },
  });
  if (!vendor) notFound();
  const [coverage, company] = await Promise.all([vendorCoverage(vendor.id), db.company.findFirst({ select: { requiredCoverage: true } })]);
  const workPos = vendor.purchaseOrders.filter((p) => !p.bidId && p.status !== "VOID").length;
  const autoNeeds = workPos > 0 || vendor.insurance.length > 0;
  const today = new Date();
  const day = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const soon = new Date(day.getTime() + SOON_DAYS * 86400000);
  const required = (company?.requiredCoverage ?? "").split(",").filter(Boolean);

  return (
    <div className="space-y-5">
      <div>
        <Link href={`/settings/vendors#vendor-${vendor.id}`} className="text-xs text-slate-500 hover:text-slate-800">
          ← Vendors
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">{vendor.name}</h2>
        <p className="text-xs text-slate-500">
          {[vendor.contact, vendor.email, vendor.phone].filter(Boolean).join(" · ") || "No contact details"} ·{" "}
          <Link href={`/settings/vendors?edit=${vendor.id}#vendor-${vendor.id}`} className="text-blue-700 hover:underline">
            Edit details
          </Link>
        </p>
      </div>

      <Card>
        <CardHeader
          title="Insurance"
          description={`Certificates of insurance (COI). You're warned ${SOON_DAYS} days before one runs out — here, on their POs, on bills, and on the dashboard.`}
          actions={
            <form action={setInsuranceRequired} className="flex items-center gap-2">
              <input type="hidden" name="vendorId" value={vendor.id} />
              <label className="text-xs text-slate-600" htmlFor="ins-req">
                Need their insurance?
              </label>
              <select
                id="ins-req"
                name="value"
                className="input !h-8 !w-auto !py-0 text-xs"
                defaultValue={vendor.insuranceRequired == null ? "auto" : vendor.insuranceRequired ? "yes" : "no"}
              >
                <option value="auto">Automatic ({autoNeeds ? "yes" : "no"} — on once they&apos;re on a PO for work)</option>
                <option value="yes">Yes</option>
                <option value="no">No (a supplier)</option>
              </select>
              <Button type="submit" size="sm" variant="secondary">
                Save
              </Button>
            </form>
          }
        />
        <CardBody className="space-y-4">
          {coverage ? (
            coverage.ok ? (
              <p className="flex items-center gap-2 text-sm text-emerald-800">
                <ShieldCheck className="h-4 w-4" /> Covered: {required.map(coverageLabel).join(", ") || "nothing required"}.
              </p>
            ) : (
              <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> {coverageWarning(coverage, (d) => fmtDate(d))}.
              </p>
            )
          ) : (
            <p className="text-sm text-slate-500">Not tracked for this vendor.</p>
          )}
          {coverage?.unconfirmed ? (
            <p className="text-sm text-sky-800">
              They uploaded {coverage.unconfirmed === 1 ? "a certificate" : `${coverage.unconfirmed} certificates`} — check the dates and confirm below.
            </p>
          ) : null}

          {vendor.insurance.length ? (
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Coverage</th>
                    <th className="px-3 py-2 font-medium">Carrier · policy</th>
                    <th className="px-3 py-2 font-medium">Expires</th>
                    <th className="px-3 py-2 font-medium">Certificate</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {vendor.insurance.map((c) => (
                    <tr key={c.id} className={cn(!c.confirmed && "bg-sky-50/50")}>
                      <td className="px-3 py-2 font-medium">{coverageLabel(c.type)}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">{[c.carrier, c.policyNumber].filter(Boolean).join(" · ") || "—"}</td>
                      <td
                        className={cn("px-3 py-2 whitespace-nowrap", c.expiresAt < day ? "font-semibold text-rose-700" : c.expiresAt <= soon ? "font-semibold text-amber-700" : "")}
                      >
                        {fmtDate(c.expiresAt)}
                        {c.expiresAt < day ? " (expired)" : c.expiresAt <= soon ? " (soon)" : ""}
                      </td>
                      <td className="px-3 py-2">
                        {c.storagePath ? (
                          <a
                            href={`/api/vendor-files/${c.id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                          >
                            <FileText className="h-3.5 w-3.5" /> {c.fileName ?? "Open"}
                          </a>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          {c.confirmed ? null : (
                            <form action={confirmInsurance} className="flex items-center gap-1">
                              <input type="hidden" name="id" value={c.id} />
                              <select name="type" defaultValue={c.type} className="input !h-8 !w-auto !py-0 text-xs" aria-label="Coverage">
                                {COVERAGE_TYPES.map((t) => (
                                  <option key={t.value} value={t.value}>
                                    {t.label}
                                  </option>
                                ))}
                              </select>
                              <input name="expiresAt" type="date" defaultValue={dateInput(c.expiresAt)} className="input !h-8 !w-auto !py-0 text-xs" aria-label="Expires" />
                              <Button type="submit" size="sm" variant="success">
                                Confirm
                              </Button>
                            </form>
                          )}
                          <ConfirmForm action={deleteInsurance} hidden={{ id: c.id }} message="Delete this certificate?" variant="ghost">
                            <span className="text-xs text-rose-600">Delete</span>
                          </ConfirmForm>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <form action={addInsurance} className="grid gap-2 rounded-lg border border-dashed border-slate-300 p-3 sm:grid-cols-2 lg:grid-cols-3">
            <input type="hidden" name="vendorId" value={vendor.id} />
            <p className="text-sm font-medium text-slate-800 sm:col-span-2 lg:col-span-3">Add a certificate</p>
            <select name="type" className="input" aria-label="Coverage" defaultValue={required.find((t) => coverage?.missing.includes(t)) ?? "GL"}>
              {COVERAGE_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input name="carrier" className="input" placeholder="Carrier" aria-label="Carrier" />
            <input name="policyNumber" className="input" placeholder="Policy #" aria-label="Policy number" />
            <label className="flex items-center gap-2 text-xs text-slate-600">
              Expires
              <input name="expiresAt" type="date" required className="input min-w-0 flex-1" />
            </label>
            <input name="file" type="file" accept=".pdf,image/*" className="self-center text-xs" aria-label="Certificate file" />
            <SubmitButton size="sm" pendingText="Adding…">
              Add
            </SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Portal logins"
          description="People at this vendor who can sign in: they see their POs (and accept them), their schedule items, upload bills and insurance. They never see your client prices or budgets."
        />
        <CardBody className="space-y-3">
          {vendor.logins.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
              {vendor.logins.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className={cn("min-w-0 flex-1", !u.active && "text-slate-400 line-through")}>
                    <span className="font-medium">{u.name}</span> <span className="text-xs text-slate-500">{u.email}</span>
                  </span>
                  <form action={updateVendorLogin} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={u.id} />
                    <input name="password" type="password" autoComplete="new-password" className="input !h-8 w-36 text-xs" placeholder="New password" aria-label="New password" />
                    <Button type="submit" size="sm" variant="secondary">
                      Set
                    </Button>
                  </form>
                  <form action={updateVendorLogin}>
                    <input type="hidden" name="id" value={u.id} />
                    <input type="hidden" name="toggle" value="1" />
                    <Button type="submit" size="sm" variant="ghost">
                      {u.active ? "Turn off" : "Turn on"}
                    </Button>
                  </form>
                  <ConfirmForm action={deleteVendorLogin} hidden={{ id: u.id }} message={`Remove ${u.name}'s login?`} variant="ghost">
                    <span className="text-xs text-rose-600">Remove</span>
                  </ConfirmForm>
                </li>
              ))}
            </ul>
          ) : null}
          <form action={createVendorLogin} className="grid gap-2 md:grid-cols-4">
            <input type="hidden" name="vendorId" value={vendor.id} />
            <input name="name" required className="input" placeholder="Name" aria-label="Name" />
            <input
              name="email"
              type="email"
              required
              className="input"
              placeholder="Email (they sign in with it)"
              aria-label="Email"
              defaultValue={vendor.logins.length ? "" : (vendor.email ?? "")}
            />
            <input name="password" type="password" required minLength={6} autoComplete="new-password" className="input" placeholder="Password (tell them)" aria-label="Password" />
            <SubmitButton pendingText="Adding…">Add login</SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Their POs"
          description={`${vendor.purchaseOrders.length} PO${vendor.purchaseOrders.length === 1 ? "" : "s"} · ${vendor._count.bills} bill${vendor._count.bills === 1 ? "" : "s"}`}
        />
        {vendor.purchaseOrders.length ? (
          <Table>
            <THead>
              <tr>
                <Th>PO</Th>
                <Th>Job</Th>
                <Th>Title</Th>
                <Th>Status</Th>
                <Th right>Total</Th>
              </tr>
            </THead>
            <TBody>
              {vendor.purchaseOrders.map((po) => (
                <Tr key={po.id}>
                  <Td className="font-mono text-xs">
                    <Link href={`/projects/${po.project.id}/purchasing/po/${po.id}`} className="text-blue-700 hover:underline">
                      PO-{po.number}
                    </Link>
                  </Td>
                  <Td className="text-xs">{po.project.name}</Td>
                  <Td>{po.title}</Td>
                  <Td>
                    <Badge status={po.status}>{PO_STATUS_LABEL[po.status]}</Badge>
                  </Td>
                  <Td right className="tabular-nums">
                    {money(poTotal(po.lines))}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        ) : (
          <CardBody>
            <p className="text-sm text-slate-500">None yet — make one from a job&apos;s Purchasing tab.</p>
          </CardBody>
        )}
      </Card>
    </div>
  );
}

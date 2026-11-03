import Link from "@/components/link";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { getBrand } from "@/lib/company-brand";
import { PrintLogo } from "@/components/brand-mark";
import { db } from "@/lib/db";
import { getPortalProject, portalHref, invoiceTotals } from "@/lib/portal";
import { cn, fmtDate, money, num, titleCase } from "@/lib/utils";
import { isOverdue } from "@/lib/finance";
import { Badge, Card, CardBody, CardHeader, PageHeader, Table, THead, TBody, Tr, Th, Td, TFoot } from "@/components/ui";
import { PrintButton } from "@/components/portal/print-button";

export const metadata = { title: "Invoice" };

export default async function PortalInvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireClient();
  const { id } = await params;
  const brand = await getBrand();
  const [invoice, company] = await Promise.all([
    db.invoice.findFirst({
      // Client view (you looking) can preview a draft; the client never sees one.
      where: { id, ...(user.preview ? {} : { status: { not: "DRAFT" } }), project: { clientId: user.clientId } },
      include: { items: { orderBy: { sortOrder: "asc" } }, payments: { orderBy: { date: "asc" } }, project: { include: { client: true } } },
    }),
    db.company.findFirst(),
  ]);
  if (!invoice) notFound();
  const project = await getPortalProject(user.clientId, invoice.projectId);
  const { total, paid, balance } = invoiceTotals(invoice);
  const client = invoice.project.client;
  const overdue = isOverdue(invoice) && balance > 0.005;
  const pill =
    invoice.status === "VOID"
      ? { label: "Void", tone: "bg-slate-100 text-slate-600" }
      : balance <= 0.005
        ? { label: "Paid", tone: "bg-emerald-50 text-emerald-800" }
        : overdue
          ? { label: "Overdue", tone: "bg-rose-50 text-rose-800" }
          : paid > 0.005
            ? { label: "Partly paid", tone: "bg-amber-50 text-amber-800" }
            : { label: "Due", tone: "bg-amber-50 text-amber-800" };
  const billTo = client
    ? [`${client.firstName} ${client.lastName}`, client.company, client.address, [client.city, client.state, client.zip].filter(Boolean).join(" ")].filter(Boolean)
    : [];

  return (
    <>
      {invoice.status === "DRAFT" ? (
        <p className="no-print mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>Draft</b> — your client can&apos;t see this yet. This is how it will look when you send it.
        </p>
      ) : null}
      {/* On screen: the short version first (beside the rest on a computer). Printing gets the full invoice below. */}
      <div className="space-y-4 print:hidden">
        <div className="flex items-center justify-between text-sm">
          <Link href={portalHref("/portal/invoices", project.id)} className="font-medium text-blue-700 hover:underline">
            ← Invoices
          </Link>
          <PrintButton label="Print / PDF" />
        </div>
        <div className="flex flex-col items-start gap-4 lg:flex-row">
          <aside className="w-full shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm lg:sticky lg:top-32 lg:w-80">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">Invoice #{invoice.number}</span>
              <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", pill.tone)}>{pill.label}</span>
            </div>
            <h1 className="mt-0.5 text-lg font-semibold text-slate-900">{invoice.title}</h1>
            <div className="mt-2 flex gap-6">
              <div>
                <p className="text-xs text-slate-500">{invoice.status === "VOID" ? "Total" : "Balance due"}</p>
                <p className="text-xl font-semibold tabular-nums text-slate-900">{money(invoice.status === "VOID" ? total : balance)}</p>
              </div>
              {invoice.dueDate && balance > 0.005 && invoice.status !== "VOID" ? (
                <div>
                  <p className="text-xs text-slate-500">Due</p>
                  <p className={cn("text-xl font-semibold", overdue ? "text-rose-700" : "text-slate-900")}>{fmtDate(invoice.dueDate, "MMM d")}</p>
                </div>
              ) : null}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Issued {fmtDate(invoice.issueDate, "MMM d")} · Total {money(total)} · Paid {money(paid)}
            </p>
            {invoice.notes ? <p className="mt-3 whitespace-pre-line border-t border-slate-100 pt-3 text-sm text-slate-700">{invoice.notes}</p> : null}
          </aside>

          <div className="w-full min-w-0 flex-1 space-y-4">
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <h2 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">What it&apos;s for</h2>
              <ul className="divide-y divide-slate-100 text-sm">
                {invoice.items.map((item) => (
                  <li key={item.id} className="flex items-baseline justify-between gap-3 px-4 py-2">
                    <span className="min-w-0 text-slate-800">
                      {item.description}
                      {item.quantity !== 1 ? (
                        <span className="text-xs text-slate-500">
                          {" "}
                          · {num(item.quantity)} × {money(item.unitPrice)}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-slate-900">{money(item.quantity * item.unitPrice)}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-3 border-t border-slate-300 px-4 py-2 font-semibold text-slate-900">
                  <span>Total</span>
                  <span className="tabular-nums">{money(total)}</span>
                </li>
              </ul>
            </section>
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              {invoice.payments.length ? (
                <>
                  <h2 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">Payments</h2>
                  <ul className="divide-y divide-slate-100 text-sm">
                    {invoice.payments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2">
                        <span className="text-slate-700">
                          {fmtDate(p.date, "MMM d, yyyy")} · {p.method === "ACH" ? "ACH" : titleCase(p.method)}
                          {p.reference ? ` · Ref ${p.reference}` : ""}
                        </span>
                        <span className="font-medium tabular-nums text-emerald-700">{money(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="px-4 py-2.5 text-sm text-slate-500">
                  <span className="font-semibold text-slate-900">Payments</span> · none yet
                </p>
              )}
            </section>
          </div>
        </div>
      </div>

      {/* Printed (and saved as PDF): the full invoice, as before. */}
      <div className="hidden print:block">
        <PageHeader
          breadcrumbs={[{ label: "Invoices", href: portalHref("/portal/invoices", project.id) }, { label: `#${invoice.number}` }]}
          title={`Invoice #${invoice.number}`}
          meta={<Badge status={invoice.status} />}
          description={invoice.title}
        />

        <div className="space-y-6">
          <Card>
            <CardBody className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              <div className="text-sm">
                <p className="label">From</p>
                <PrintLogo logoUrl={brand.logoUrl} className="max-h-12" />
                <p className="font-semibold text-slate-900">{company?.name ?? "Your Builder"}</p>
                {company?.address ? <p className="text-slate-600">{company.address}</p> : null}
                {company?.city ? <p className="text-slate-600">{[company.city, company.state, company.zip].filter(Boolean).join(" ")}</p> : null}
                {company?.phone ? <p className="text-slate-600">{company.phone}</p> : null}
                {company?.licenseNumber ? <p className="text-xs text-slate-500">License {company.licenseNumber}</p> : null}
              </div>
              <div className="text-sm">
                <p className="label">Bill to</p>
                {billTo.map((line, i) => (
                  <p key={i} className={i === 0 ? "font-semibold text-slate-900" : "text-slate-600"}>
                    {line}
                  </p>
                ))}
                <p className="mt-2 text-xs text-slate-500">
                  Project #{project.number} · {project.name}
                </p>
              </div>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:text-right">
                <dt className="text-slate-500">Invoice #</dt>
                <dd className="font-medium tabular-nums text-slate-900">{invoice.number}</dd>
                <dt className="text-slate-500">Issued</dt>
                <dd className="text-slate-900">{fmtDate(invoice.issueDate)}</dd>
                <dt className="text-slate-500">Due</dt>
                <dd className="text-slate-900">{fmtDate(invoice.dueDate)}</dd>
                <dt className="text-slate-500">Balance due</dt>
                <dd className={`text-lg font-semibold tabular-nums ${balance > 0.005 ? "text-amber-800" : "text-emerald-700"}`}>{money(balance)}</dd>
              </dl>
            </CardBody>
          </Card>

          <Table>
            <THead>
              <tr>
                <Th>Description</Th>
                <Th right>Qty</Th>
                <Th right>Unit price</Th>
                <Th right>Amount</Th>
              </tr>
            </THead>
            <TBody>
              {invoice.items.map((item) => (
                <Tr key={item.id}>
                  <Td>{item.description}</Td>
                  <Td right>{num(item.quantity)}</Td>
                  <Td right>{money(item.unitPrice)}</Td>
                  <Td right>{money(item.quantity * item.unitPrice)}</Td>
                </Tr>
              ))}
            </TBody>
            <TFoot>
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right">
                  Total
                </td>
                <Td right>{money(total)}</Td>
              </tr>
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right font-normal text-slate-600">
                  Payments received
                </td>
                <Td right className="font-normal text-slate-600">
                  −{money(paid)}
                </Td>
              </tr>
              <tr>
                <td colSpan={3} className="px-4 py-2 text-right font-semibold">
                  Balance due
                </td>
                <Td right className="font-semibold">
                  {money(balance)}
                </Td>
              </tr>
            </TFoot>
          </Table>

          <Card>
            <CardHeader
              title="Payments"
              description={invoice.payments.length ? `${invoice.payments.length} payment${invoice.payments.length === 1 ? "" : "s"} received` : "No payments recorded yet"}
            />
            {invoice.payments.length ? (
              <ul className="divide-y divide-slate-100 text-sm">
                {invoice.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between px-5 py-2.5">
                    <span className="text-slate-700">
                      {fmtDate(p.date)} · {p.method === "ACH" ? "ACH" : titleCase(p.method)}
                      {p.reference ? ` · Ref ${p.reference}` : ""}
                    </span>
                    <span className="font-medium tabular-nums text-emerald-700">{money(p.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </Card>

          {invoice.notes ? (
            <Card>
              <CardHeader title="Notes" />
              <CardBody>
                <p className="whitespace-pre-line text-sm text-slate-700">{invoice.notes}</p>
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

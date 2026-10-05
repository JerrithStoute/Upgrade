import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth";
import { getBrand } from "@/lib/company-brand";
import { PrintLogo } from "@/components/brand-mark";
import { db } from "@/lib/db";
import { getPortalProject, portalHref, invoiceTotals } from "@/lib/portal";
import { fmtDate, money, num, titleCase } from "@/lib/utils";
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
      <PageHeader
        breadcrumbs={[{ label: "Invoices", href: portalHref("/portal/invoices", project.id) }, { label: `#${invoice.number}` }]}
        title={`Invoice #${invoice.number}`}
        meta={<Badge status={invoice.status} />}
        description={invoice.title}
        actions={<PrintButton label="Print / Save PDF" />}
      />

      <div className="space-y-6">
        <Card>
          <CardBody className="grid gap-6 sm:grid-cols-3">
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
                    {fmtDate(p.date)} · {titleCase(p.method)}
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
    </>
  );
}

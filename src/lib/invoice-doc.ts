import "server-only";
import { db } from "./db";
import { getBrand } from "./company-brand";
import { documentColors } from "./brand-style";
import { contractValue } from "./projects";
import { contractStanding, invoiceTotal, isOverdue, paymentsTotal } from "./finance";

const cityLine = (c: { city: string | null; state: string | null; zip: string | null } | null | undefined) =>
  c ? [[c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : "";

/** Invoices that count as billed: sent ones, not drafts or voided ones. */
const BILLED = { notIn: ["DRAFT", "VOID"] };

/**
 * Everything the printed invoice shows — the same paper on your Print page and in the client's
 * portal: your letterhead, who it's billed to and the job, its lines and payments, where the
 * contract stands, and how to pay.
 */
export async function loadInvoiceDoc(projectId: string, invoiceId: string) {
  const [inv, company, brand] = await Promise.all([
    db.invoice.findFirst({
      where: { id: invoiceId, projectId },
      include: { items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }, payments: { orderBy: { date: "asc" } }, project: { include: { client: true } } },
    }),
    db.company.findFirst(),
    getBrand(),
  ]);
  if (!inv) return null;
  const project = inv.project;
  const client = project.client;
  const total = invoiceTotal(inv.items);
  const paid = paymentsTotal(inv.payments);
  const balance = inv.status === "VOID" ? 0 : total - paid;

  // The job's other billed invoices: the ones before this one, and every payment so far.
  const [contract, others] = await Promise.all([
    contractValue(projectId, project.contractAmount ?? 0),
    db.invoice.findMany({ where: { projectId, id: { not: inv.id }, status: BILLED }, include: { items: true, payments: true } }),
  ]);
  const before = others
    .filter((o) => o.issueDate < inv.issueDate || (o.issueDate.getTime() === inv.issueDate.getTime() && o.number < inv.number))
    .reduce((n, o) => n + invoiceTotal(o.items), 0);
  const paidSoFar = others.reduce((n, o) => n + paymentsTotal(o.payments), 0) + (inv.status === "VOID" ? 0 : paid);
  const standing = contract > 0 && inv.status !== "VOID" ? contractStanding(contract, before, total, paidSoFar) : null;

  const overdue = isOverdue(inv) && balance > 0.005;
  const lastPaid = inv.payments.at(-1)?.date ?? null;
  return {
    inv,
    items: inv.items.map((i) => ({ id: i.id, description: i.description, quantity: i.quantity, unitPrice: i.unitPrice })),
    payments: inv.payments.map((p) => ({ id: p.id, date: p.date, method: p.method, reference: p.reference, amount: p.amount })),
    total,
    paid,
    balance,
    overdue,
    lastPaid,
    standing,
    colors: documentColors(brand.color),
    company: {
      name: company?.name ?? "Your Company",
      logoUrl: brand.logoUrl,
      lines: [company?.address, cityLine(company), company?.phone, company?.email, company?.licenseNumber ? `License ${company.licenseNumber}` : null].filter(
        (x): x is string => !!x,
      ),
      footer: [company?.name ?? "Your Company", company?.phone, company?.website].filter((x): x is string => !!x).join(" · "),
      paymentInstructions: company?.paymentInstructions ?? null,
    },
    client: client ? `${client.firstName} ${client.lastName}`.trim() : null,
    clientLines: client ? [client.company, client.address, cityLine(client), client.phone, client.email].filter((x): x is string => !!x) : [],
    project: { name: project.name, number: project.number, address: [project.address, cityLine(project)].filter(Boolean).join(", ") },
  };
}
export type InvoiceDoc = NonNullable<Awaited<ReturnType<typeof loadInvoiceDoc>>>;

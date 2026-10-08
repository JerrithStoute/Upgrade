import "server-only";
import { db } from "./db";
import { getBrand } from "./company-brand";
import { costCodeLabel } from "./utils";
import { poTotal } from "./purchasing";

const cityLine = (c: { city: string | null; state: string | null; zip: string | null } | null | undefined) =>
  c ? [[c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : "";

/** Everything a printed PO shows: your letterhead, who it's to, the job, scope, lines and total. */
export async function loadPoDoc(where: { id: string; projectId?: string; vendorId?: string }) {
  const [po, company, brand] = await Promise.all([
    db.purchaseOrder.findFirst({
      where,
      include: { lines: { orderBy: { sortOrder: "asc" }, include: { costCode: true } }, project: true, vendor: true },
    }),
    db.company.findFirst(),
    getBrand(),
  ]);
  if (!po) return null;
  const v = po.vendor;
  return {
    po,
    total: poTotal(po.lines),
    lines: po.lines.map((l) => ({
      id: l.id,
      description: l.description,
      code: l.costCode ? costCodeLabel(l.costCode) : null,
      quantity: l.quantity,
      unit: l.unit,
      unitCost: l.unitCost,
    })),
    company: {
      name: company?.name ?? "Your Company",
      lines: [company?.address, cityLine(company), company?.phone, company?.email].filter((x): x is string => !!x),
      logoUrl: brand.logoUrl,
    },
    to: { name: po.vendorName, lines: v ? [v.contact, v.phone, v.email].filter((x): x is string => !!x) : [] },
    project: { name: po.project.name, number: po.project.number, lines: [po.project.address, cityLine(po.project)].filter((x): x is string => !!x) },
  };
}
export type PoDoc = NonNullable<Awaited<ReturnType<typeof loadPoDoc>>>;

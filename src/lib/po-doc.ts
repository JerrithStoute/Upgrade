import "server-only";
import { db } from "./db";
import { getBrand } from "./company-brand";
import { costCodeLabel } from "./utils";
import { poTotal } from "./purchasing";
import { documentColors } from "./brand-style";
import { companyClock } from "./company-zone";

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
  const sender = po.sentById ? await db.user.findFirst({ where: { id: po.sentById }, select: { name: true } }) : null;
  const { dateTime } = await companyClock();
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
      footer: [company?.name ?? "Your Company", company?.phone, company?.website].filter((x): x is string => !!x).join(" · "),
      phone: company?.phone ?? null,
      // Where the vendor sends their bill.
      billTo: [company?.email, [company?.address, cityLine(company)].filter(Boolean).join(", ")].filter((x): x is string => !!x),
      terms: company?.poTerms ?? null,
    },
    colors: documentColors(brand.color),
    sentBy: sender?.name ?? null,
    sentWhen: po.sentAt ? dateTime(po.sentAt) : null,
    respondedWhen: po.respondedAt ? dateTime(po.respondedAt) : null,
    to: { name: po.vendorName, lines: v ? [v.contact, v.phone, v.email].filter((x): x is string => !!x) : [] },
    siteAddress: [po.project.address, cityLine(po.project)].filter(Boolean).join(", "),
    project: { name: po.project.name, number: po.project.number, lines: [po.project.address, cityLine(po.project)].filter((x): x is string => !!x) },
  };
}
export type PoDoc = NonNullable<Awaited<ReturnType<typeof loadPoDoc>>>;

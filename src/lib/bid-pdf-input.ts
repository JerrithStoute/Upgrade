import "server-only";
import { db } from "./db";
import { readUpload } from "./uploads";
import { documentColors } from "./brand-style";
import { fmtDate } from "./utils";
import type { BidPdfInput } from "./bid-pdf";

const cityLine = (c: { city: string | null; state: string | null; zip: string | null } | null | undefined) =>
  c ? [[c.city, c.state].filter(Boolean).join(", "), c.zip].filter(Boolean).join(" ") : "";

type Company = {
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  brandColor: string | null;
  logoPath: string | null;
  logoType: string | null;
} | null;

/**
 * What the bid's PDF is drawn from — the same as its Print page: your logo and color, who it's from and
 * to, the job, when it was sent and when prices are needed, and its lines. `replyTo`: where they send it back.
 */
export async function bidPdfInput(
  bid: BidPdfInput["bid"] & { vendorId: string | null; sentAt: Date; dueAt: Date | null },
  project: { number: number; name: string; address: string | null; city: string | null; state: string | null; zip: string | null },
  company: Company,
  replyTo: string | null,
): Promise<BidPdfInput> {
  const vendor = bid.vendorId ? await db.vendor.findFirst({ where: { id: bid.vendorId }, select: { contact: true, phone: true, email: true } }) : null;
  let logo: BidPdfInput["logo"] = null;
  if (company?.logoPath && /png|jpe?g/.test(company.logoType ?? company.logoPath)) {
    try {
      const bytes = await readUpload(company.logoPath);
      logo = { bytes: new Uint8Array(bytes), png: /png/.test(company.logoType ?? company.logoPath) };
    } catch {
      logo = null;
    }
  }
  const name = company?.name ?? "Your Company";
  return {
    bid,
    project,
    company: {
      name,
      lines: [company?.address, cityLine(company), company?.phone, company?.email].filter((x): x is string => !!x),
      footer: [name, company?.phone, company?.website].filter((x): x is string => !!x).join(" · "),
    },
    vendorLines: vendor ? [vendor.contact, vendor.phone, vendor.email].filter((x): x is string => !!x) : [],
    site: [project.address, cityLine(project)].filter(Boolean).join(", "),
    sent: fmtDate(bid.sentAt),
    due: bid.dueAt ? fmtDate(bid.dueAt) : null,
    replyTo: replyTo ?? company?.email ?? null,
    accent: documentColors(company?.brandColor).accent,
    logo,
  };
}

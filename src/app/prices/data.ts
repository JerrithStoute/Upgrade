import "server-only";
import { db } from "@/lib/db";
import { readBidLink } from "@/lib/bid-link";
import { runAsCompany } from "@/lib/tenant";

/**
 * The bid behind a vendor's price link, read as its company (there's no sign-in here): the lines, the
 * job and who's asking — or null when the link is no good. `closed`: a bid has been taken for every
 * cost code on it, so prices can't change any more.
 */
export async function bidForLink(token: string) {
  const link = await readBidLink(token);
  if (!link) return null;
  return runAsCompany(link.companyId, async () => {
    const bid = await db.bid.findUnique({
      where: { id: link.bidId },
      include: { lines: { orderBy: { sortOrder: "asc" } }, project: { select: { id: true, number: true, name: true, address: true, city: true, state: true } } },
    });
    if (!bid) return null;
    const [company, awards] = await Promise.all([
      db.company.findFirst({ select: { name: true, phone: true, email: true } }),
      db.bidAward.findMany({ where: { projectId: bid.projectId }, select: { codeKey: true } }),
    ]);
    const taken = new Set(awards.map((a) => a.codeKey));
    const codes = new Set(bid.lines.map((l) => l.codeKey));
    const closed = codes.size > 0 && [...codes].every((c) => taken.has(c));
    return { ...link, bid, company, closed };
  });
}

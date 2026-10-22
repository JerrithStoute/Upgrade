import "server-only";
import { db } from "@/lib/db";
import { readBidLink } from "@/lib/bid-link";
import { runAsCompany } from "@/lib/tenant";
import { readPlanIds } from "@/lib/sub-bids";

/**
 * The bid behind a vendor's price link, read as its company (there's no sign-in here): the lines, the
 * job and who's asking — or null when the link is no good. `closed`: this bid has been taken, so its
 * prices can't change any more.
 */
export async function bidForLink(token: string) {
  const link = await readBidLink(token);
  if (!link) return null;
  return runAsCompany(link.companyId, async () => {
    const bid = await db.bid.findUnique({
      where: { id: link.bidId },
      include: {
        lines: { orderBy: { sortOrder: "asc" } },
        project: { select: { id: true, number: true, name: true, address: true, city: true, state: true } },
      },
    });
    if (!bid) return null;
    const planIds = bid.kind === "SUB" ? readPlanIds(bid.planFileIds) : [];
    const [company, awards, plans] = await Promise.all([
      db.company.findFirst({ select: { name: true, phone: true, email: true } }),
      db.bidAward.findMany({ where: { bidId: bid.id }, select: { id: true } }),
      // A sub's bid: the job's files picked to go with it (still on the job).
      planIds.length
        ? db.fileAsset.findMany({
            where: { id: { in: planIds }, projectId: bid.projectId },
            select: { id: true, name: true, mimeType: true, size: true, storagePath: true },
          })
        : Promise.resolve([]),
    ]);
    // Closed once THIS bid has been taken — not when another vendor's was taken for the same cost code
    // (concrete from one supplier, the rest of 2102 from the lumber yard: both get answered).
    const closed = awards.length > 0;
    return { ...link, bid, company, closed, plans: planIds.flatMap((id) => plans.filter((f) => f.id === id)) };
  });
}

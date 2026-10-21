"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { runAsCompany } from "@/lib/tenant";
import { isLadderLine, parsePrice } from "@/lib/bids";
import { logActivity } from "@/lib/activity";
import { emailBidAnswered } from "@/lib/notify";
import { clientIp } from "@/lib/security-log";
import { recordFailure, retryAfter } from "@/lib/rate-limit";
import { bidForLink } from "./data";

export type PricesState = { error?: string; ok?: string } | undefined;

/**
 * A vendor's prices, typed on the page their bid's email links to (no sign-in — the link is the key to
 * that one bid). Saved on the bid like a returned Excel file: a price per line (blank = no price),
 * anything offered instead, and the bid marked back. The team hears by email. Can be sent again,
 * changed, until a bid is taken.
 */
export async function submitBidPrices(_prev: PricesState, fd: FormData): Promise<PricesState> {
  // (A link is hard to guess, but a page anyone can reach gets a limit per address anyway.)
  const ipKey = `bid-prices:${await clientIp()}`;
  if (retryAfter(ipKey, 30) > 0) return { error: "Too many tries from here — wait a few minutes and send it again." };
  recordFailure(ipKey, 10 * 60 * 1000);

  const found = await bidForLink(String(fd.get("t") ?? ""));
  if (!found) return { error: "This link has expired or doesn't work any more — reply to the email instead." };
  if (found.closed) return { error: "This bid has already been decided — thank you. Reply to the email with any questions." };
  const message = String(fd.get("message") ?? "").trim().slice(0, 2000) || null;

  const result = await runAsCompany(found.companyId, async () => {
    const lines = found.bid.lines;
    let priced = 0;
    let total = 0;
    for (const l of lines) {
      const price = parsePrice(String(fd.get(`price_${l.id}`) ?? ""));
      const substitute = String(fd.get(`sub_${l.id}`) ?? "").trim().slice(0, 300) || null;
      if (price !== l.unitPrice || substitute !== l.substitute) await db.bidLine.update({ where: { id: l.id }, data: { unitPrice: price, substitute } });
      if (price != null && !isLadderLine(l)) {
        priced++;
        total += price * l.quantity;
      }
    }
    const anyPrice = lines.some((l) => parsePrice(String(fd.get(`price_${l.id}`) ?? "")) != null);
    if (!anyPrice) return null;
    await db.bid.update({ where: { id: found.bid.id }, data: { status: "RECEIVED", receivedAt: new Date() } });
    const items = lines.filter((l) => !isLadderLine(l)).length;
    await logActivity({
      projectId: found.bid.projectId,
      type: "bid.answered",
      description: `Bid #${found.bid.number} (${found.bid.vendorName}) back online — ${priced} of ${items} items priced${message ? ` · "${message}"` : ""}`,
    });
    await emailBidAnswered(found.bid.id, { priced, items, total, message }).catch((e) => console.error("Bid answered email not sent:", e));
    return { priced, items };
  });
  if (!result) return { error: "Type at least one price, then send." };
  revalidatePath(`/projects/${found.bid.projectId}/bids`);
  return { ok: `Sent — ${result.priced} of ${result.items} items priced. Thank you! You can change prices and send again until they decide.` };
}

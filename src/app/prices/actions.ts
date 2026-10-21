"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { runAsCompany } from "@/lib/tenant";
import { isLadderLine, parsePrice } from "@/lib/bids";
import { logActivity } from "@/lib/activity";
import { emailBidAnswered } from "@/lib/notify";
import { clientIp } from "@/lib/security-log";
import { recordFailure, retryAfter } from "@/lib/rate-limit";
import { checkUpload } from "@/lib/file-types";
import { saveUpload } from "@/lib/uploads";
import { bidForLink } from "./data";

export type PricesState = { error?: string; ok?: string } | undefined;

/** Their own paperwork (a quote PDF, a photo of it, their Excel file): up to 15 MB, those kinds only. */
const QUOTE_MAX = 15 * 1024 * 1024;
const QUOTE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];

/**
 * A vendor's prices, typed on the page their bid's email links to (no sign-in — the link is the key to
 * that one bid). Saved on the bid like a returned Excel file: a price per line (blank = no price),
 * anything offered instead, and the bid marked back — with their own paperwork attached, if they add it
 * (kept as what they sent back, in the job's Files → Bids). Prices, a file, or both. The team hears by
 * email. Can be sent again, changed, until a bid is taken.
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
  const lines = found.bid.lines;
  const prices = new Map(lines.map((l) => [l.id, parsePrice(String(fd.get(`price_${l.id}`) ?? ""))]));
  const anyPrice = [...prices.values()].some((p) => p != null);

  // Their paperwork: checked by what the file really is, before anything is saved.
  const upload = fd.get("quote");
  const file = upload instanceof File && upload.size > 0 ? upload : null;
  if (file) {
    if (file.size > QUOTE_MAX) return { error: `“${file.name}” is over 15 MB — send a smaller one, or reply to the email with it.` };
    const checked = checkUpload(Buffer.from(await file.arrayBuffer()), file.name, "document");
    if ("error" in checked || !QUOTE_TYPES.includes(checked.type)) return { error: `“${file.name}” can't be attached — it needs to be a PDF, a photo or an Excel file.` };
  }
  if (!anyPrice && !file) return { error: "Type at least one price (or attach your quote), then send." };

  const result = await runAsCompany(found.companyId, async () => {
    let priced = 0;
    let total = 0;
    if (anyPrice)
      for (const l of lines) {
        const price = prices.get(l.id) ?? null;
        const substitute = String(fd.get(`sub_${l.id}`) ?? "").trim().slice(0, 300) || null;
        if (price !== l.unitPrice || substitute !== l.substitute) await db.bidLine.update({ where: { id: l.id }, data: { unitPrice: price, substitute } });
        if (price != null && !isLadderLine(l)) {
          priced++;
          total += price * l.quantity;
        }
      }
    let fileName: string | null = null;
    if (file) {
      const meta = await saveUpload(file, found.bid.projectId, QUOTE_MAX, "document");
      const saved = await db.fileAsset.create({
        data: { ...meta, name: `Returned - ${found.bid.vendorName} - ${meta.name}`.slice(0, 200), projectId: found.bid.projectId, folder: "Bids", clientVisible: false },
      });
      fileName = meta.name;
      await db.bid.update({ where: { id: found.bid.id }, data: { returnFileId: saved.id } });
    }
    // Back once it has prices; a file alone waits for its prices to be typed in (Prices, with the file beside).
    if (anyPrice) await db.bid.update({ where: { id: found.bid.id }, data: { status: "RECEIVED", receivedAt: new Date() } });
    const items = lines.filter((l) => !isLadderLine(l)).length;
    await logActivity({
      projectId: found.bid.projectId,
      type: "bid.answered",
      description: `Bid #${found.bid.number} (${found.bid.vendorName}) back online — ${anyPrice ? `${priced} of ${items} items priced` : "no prices typed"}${fileName ? `, their quote attached (${fileName})` : ""}${message ? ` · "${message}"` : ""}`,
    });
    await emailBidAnswered(found.bid.id, { priced, items, total, message, file: fileName }).catch((e) => console.error("Bid answered email not sent:", e));
    return { priced, items };
  });
  revalidatePath(`/projects/${found.bid.projectId}/bids`);
  const what = anyPrice ? `${result.priced} of ${result.items} items priced${file ? ", your quote attached" : ""}` : "your quote attached";
  return { ok: `Sent — ${what}. Thank you! You can change it and send again until they decide.` };
}

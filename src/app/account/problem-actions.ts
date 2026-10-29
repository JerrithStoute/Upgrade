"use server";

import sharp from "sharp";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveProblemReport } from "@/lib/problems";
import { failures, recordFailure } from "@/lib/rate-limit";

/**
 * "Report a problem" (the top bar): a sentence, and a picture if they added one — to the Station's
 * Problems tab, and its owner's email (src/lib/problems.ts). The builder's team only.
 */
export async function reportProblem(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireStaff();
  const message = String(form.get("message") ?? "").trim();
  if (!message) return { ok: false, error: "Say what happened — a sentence is plenty." };
  if (message.length > 4000) return { ok: false, error: "That's a lot — could you shorten it a little?" };
  // (Plenty for anyone; a stuck button can't send a hundred.)
  if ((await failures(`problems.report:${me.id}`)) >= 20) return { ok: false, error: "That's a lot of reports in an hour — try again a little later, or email support@thebuilderstation.com." };
  await recordFailure(`problems.report:${me.id}`, 60 * 60 * 1000);

  // A picture: made smaller (and a JPEG), whatever it was.
  let screenshot: Buffer | null = null;
  const file = form.get("picture");
  if (file instanceof File && file.size > 0) {
    if (file.size > 15 * 1024 * 1024) return { ok: false, error: "That picture is over 15 MB — try a screenshot instead." };
    try {
      screenshot = await sharp(Buffer.from(await file.arrayBuffer()))
        .rotate()
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 75 })
        .toBuffer();
    } catch {
      return { ok: false, error: "That file isn't a picture we can read — a screenshot (PNG or JPG) works." };
    }
  }

  const company = await db.company.findFirst({ select: { name: true } });
  await saveProblemReport({
    who: { userId: me.id, userName: me.name, userEmail: me.email, builderId: me.companyId, builderName: company?.name ?? "(no name)" },
    page: String(form.get("page") ?? ""),
    message,
    screenshot,
    device: String(form.get("device") ?? ""),
  });
  return { ok: true };
}

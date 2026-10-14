"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { parseProposalOptions, proposalOptionsSchema } from "@/lib/proposal-options";
import { str } from "@/lib/utils";

/** What a new proposal shows — the same default "Save as my default" sets from a proposal. */
export const saveProposalDefaults = friendly(async function saveProposalDefaults(fd: FormData) {
  const admin = await requireAdmin();
  const on = (k: string) => fd.get(k) === "on";
  const company = await db.company.findFirst({ select: { proposalOptions: true } });
  const was = parseProposalOptions(company?.proposalOptions);
  const options = proposalOptionsSchema.parse({
    ...was,
    heading: str(fd, "heading") || "Proposal",
    cover: on("cover"),
    intro: { titled: on("introTitled"), title: str(fd, "introTitle") || "Notes" },
    categories: { show: on("categoriesShow"), subtotals: on("categoriesSubtotals") },
    divisions: { show: on("divisionsShow"), prices: on("divisionsPrices"), specText: on("divisionsSpecText") },
    allowanceInline: on("allowanceInline"),
    selectionTbd: on("selectionTbd"),
    items: { show: on("itemsShow"), qty: on("itemsQty"), prices: on("itemsPrices") },
    totalOnly: on("totalOnly"),
    allowances: on("allowances"),
    profit: { mode: str(fd, "profitMode") === "FEE" ? "FEE" : "BUILT_IN", label: str(fd, "profitLabel") || "Builder's fee", showPct: on("profitShowPct") },
    tax: { ...was.tax, on: str(fd, "tax") === "LINE", label: str(fd, "taxLabel") || "Sales tax" },
    validDays: Math.max(0, Math.min(365, Math.round(Number(str(fd, "validDays")) || 0))),
    signer: str(fd, "signer"),
    clientSignature: on("clientSignature"),
  });
  await db.company.updateMany({ data: { proposalOptions: JSON.stringify(options) } });
  await logActivity({ userId: admin.id, type: "company.updated", description: "Changed the proposal defaults" });
  revalidatePath("/settings/proposals");
  redirect("/settings/proposals?saved=1");
});

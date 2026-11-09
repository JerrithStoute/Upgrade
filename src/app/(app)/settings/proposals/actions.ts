"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { parseProposalOptions, proposalOptionsSchema } from "@/lib/proposal-options";
import { str } from "@/lib/utils";

/** A box's wording as typed (empty: none). */
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 20000) || null;

/** The payment rows as typed: a name and a % each; blank rows left off. */
function payRows(fd: FormData) {
  const labels = fd.getAll("payLabel").map((v) => String(v).trim().slice(0, 80));
  const pcts = fd.getAll("payPct").map((v) => Math.max(0, Math.min(100, Number(String(v).replace(/[^\d.]/g, "")) || 0)));
  return labels.map((label, i) => ({ label, pct: pcts[i] ?? 0 })).filter((r) => r.label || r.pct > 0);
}

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
    payments: { show: on("paymentsShow"), rows: payRows(fd) },
    terms: on("terms"),
  });
  const pct = Number(str(fd, "escalationPct"));
  await db.company.updateMany({
    data: {
      proposalOptions: JSON.stringify(options),
      ...(fd.has("proposalIntro") ? { proposalIntro: text(fd, "proposalIntro") } : {}),
      ...(fd.has("proposalTerms") ? { proposalTerms: text(fd, "proposalTerms") } : {}),
      ...(fd.has("escalationPct") && Number.isFinite(pct) ? { escalationPct: Math.max(0, Math.min(100, Math.round(pct * 10) / 10)) } : {}),
      ...(fd.has("escalationFrom") ? { escalationFrom: str(fd, "escalationFrom") === "SIGNED" ? "SIGNED" : "SENT" } : {}),
    },
  });
  await logActivity({ userId: admin.id, type: "company.updated", description: "Changed the proposal defaults" });
  revalidatePath("/settings/proposals");
  redirect("/settings/proposals?saved=1");
});

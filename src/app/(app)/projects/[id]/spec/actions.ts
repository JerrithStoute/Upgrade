"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { dayNo, netSheet, type Sheet } from "@/lib/spec-math";
import { SALE_VENDOR, parseLines, specDefaults, syncCarrying } from "@/lib/spec";
import { money, parseDateInput, str, strOrNull } from "@/lib/utils";

const page = (id: string) => `/projects/${id}/spec`;

function revalidate(id: string) {
  revalidatePath(`/projects/${id}`, "layout");
  revalidatePath("/spec");
  revalidatePath("/reports", "layout");
  revalidatePath("/dashboard");
}
const num = (fd: FormData, k: string, fallback = 0) => {
  const v = str(fd, k).replace(/[$,%\s]/g, "");
  if (v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`"${str(fd, k)}" isn't a number`);
  return n;
};
const numOrNull = (fd: FormData, k: string) => (str(fd, k).trim() === "" ? null : num(fd, k));

/** Marks a job as a spec house (or not). */
export const setSpec = friendly(async function setSpec(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const on = str(fd, "on") !== "0";
  await db.project.update({ where: { id: project.id }, data: { isSpec: on } });
  await logActivity({ projectId: project.id, userId: user.id, type: "spec", description: on ? "Marked a spec house" : "No longer a spec house" });
  revalidate(project.id);
  redirect(on ? page(project.id) : "/spec");
});

/** The listing and what it costs to sell; optionally your usual numbers for the next house. */
export const saveListing = friendly(async function saveListing(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const lines = parseLines(str(fd, "closingLines"));
  if (!lines) throw new Error("Check the closing cost lines");
  for (const l of lines) if (l.kind === "PCT" && (l.value < 0 || l.value > 10)) throw new Error(`${l.name}: a percentage between 0 and 10`);
  const data = {
    listPrice: numOrNull(fd, "listPrice"),
    listedAt: parseDateInput(fd.get("listedAt")),
    listPct: num(fd, "listPct"),
    buyerPct: num(fd, "buyerPct"),
    concessions: num(fd, "concessions"),
    closingLines: JSON.stringify(lines.filter((l) => l.name.trim())),
    annualTax: numOrNull(fd, "annualTax"),
    hoaAnnual: numOrNull(fd, "hoaAnnual"),
    hoaPaidThrough: parseDateInput(fd.get("hoaPaidThrough")),
    notes: strOrNull(fd, "notes"),
  };
  for (const k of ["listPct", "buyerPct"] as const) if (data[k] < 0 || data[k] > 10) throw new Error("Commissions should be between 0 and 10 percent");
  await db.specSale.upsert({ where: { projectId: project.id }, update: data, create: { projectId: project.id, ...data } });
  if (str(fd, "makeDefault") === "on") {
    const c = await db.company.findFirst({ select: { id: true } });
    if (c)
      await db.company.update({
        where: { id: c.id },
        data: { specDefaults: JSON.stringify({ listPct: data.listPct, buyerPct: data.buyerPct, concessions: data.concessions, closingLines: JSON.parse(data.closingLines) }) },
      });
  }
  revalidate(project.id);
  redirect(page(project.id));
});

function carryingFields(fd: FormData) {
  const name = str(fd, "name");
  if (!name) throw new Error("Name the carrying cost (e.g. Construction loan interest)");
  const kind = str(fd, "kind") === "INTEREST" ? "INTEREST" : "AMOUNT";
  const startDate = parseDateInput(fd.get("startDate"));
  if (!startDate) throw new Error("When does it start?");
  const endDate = parseDateInput(fd.get("endDate"));
  if (endDate && endDate < startDate) throw new Error("It can't end before it starts");
  const frequency = ["MONTHLY", "YEARLY", "ONCE"].includes(str(fd, "frequency")) ? str(fd, "frequency") : "MONTHLY";
  const loanBalance = kind === "INTEREST" ? num(fd, "loanBalance") : null;
  const ratePct = kind === "INTEREST" ? num(fd, "ratePct") : null;
  // A starting balance of $0 is fine — the money comes from the draws you log.
  if (kind === "INTEREST" && !(ratePct && ratePct > 0)) throw new Error("Interest needs the loan's rate (e.g. 8.5)");
  if (kind === "INTEREST" && (loanBalance ?? 0) < 0) throw new Error("The starting balance can't be below zero");
  return {
    name: name.slice(0, 120),
    kind,
    amount: kind === "INTEREST" ? 0 : num(fd, "amount"),
    frequency,
    loanBalance,
    ratePct,
    startDate,
    endDate,
    costCodeId: strOrNull(fd, "costCodeId"),
  };
}

export const addCarrying = friendly(async function addCarrying(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const data = carryingFields(fd);
  const last = await db.carryingCost.findFirst({ where: { projectId: project.id }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  await db.carryingCost.create({ data: { ...data, projectId: project.id, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  await syncCarrying(project.id);
  revalidate(project.id);
  redirect(`${page(project.id)}#carrying`);
});

/** Changes from now on — months already charged keep what they were charged. */
export const updateCarrying = friendly(async function updateCarrying(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const c = await db.carryingCost.findFirst({ where: { id: str(fd, "id"), projectId: project.id } });
  if (!c) throw new Error("Carrying cost not found");
  const data = carryingFields(fd);
  await db.carryingCost.update({ where: { id: c.id }, data });
  // Its charges move to the new cost code, if that changed.
  if (data.costCodeId !== c.costCodeId) await db.expense.updateMany({ where: { carryingCostId: c.id }, data: { costCodeId: data.costCodeId, vendor: data.name } });
  await syncCarrying(project.id);
  revalidate(project.id);
  redirect(`${page(project.id)}#carrying`);
});

/** Removes it — and its charges come off the Budget. */
export const deleteCarrying = friendly(async function deleteCarrying(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  await db.carryingCost.deleteMany({ where: { id: str(fd, "id"), projectId: project.id } });
  revalidate(project.id);
  redirect(`${page(project.id)}#carrying`);
});

type Result = { ok: true } | { ok: false; error: string };

/** Saves an offer as it was worked out in the calculator. */
export async function saveOffer(
  projectId: string,
  o: { buyer: string; price: number; closingDate: string; concessions: number; buyerPct: number; repairs: number; profit: number; note: string },
): Promise<Result> {
  const user = await requireStaff();
  if (!(o.price > 0)) return { ok: false, error: "Type the offer price" };
  const closing = parseDateInput(o.closingDate);
  if (!closing) return { ok: false, error: "When would it close?" };
  await db.specOffer.create({
    data: {
      projectId,
      buyer: o.buyer.trim() || null,
      price: o.price,
      closingDate: closing,
      concessions: o.concessions || 0,
      buyerPct: o.buyerPct || 0,
      repairs: o.repairs || 0,
      profit: Math.round(o.profit * 100) / 100,
      note: o.note.trim() || null,
      userId: user.id,
    },
  });
  await logActivity({ projectId, userId: user.id, type: "spec.offer", description: `Offer of ${money(o.price)}${o.buyer ? ` from ${o.buyer}` : ""} — ${money(o.profit)} profit` });
  revalidate(projectId);
  return { ok: true };
}

/** Countered / accepted / rejected. */
export const setOfferStatus = friendly(async function setOfferStatus(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const status = ["OPEN", "COUNTERED", "ACCEPTED", "REJECTED"].includes(str(fd, "status")) ? str(fd, "status") : "OPEN";
  await db.specOffer.updateMany({
    where: { id: str(fd, "id"), projectId: project.id },
    data: { status, counterPrice: status === "COUNTERED" ? numOrNull(fd, "counterPrice") : undefined },
  });
  revalidate(project.id);
  redirect(`${page(project.id)}#offers`);
});

/**
 * Sold: the price and date, carrying costs stop, and what selling cost (commissions,
 * closing costs, concessions, repairs) goes on the Budget — so the job's profit is real.
 */
export const markSold = friendly(async function markSold(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const spec = await db.specSale.findUnique({ where: { projectId: project.id } });
  if (!spec) throw new Error("Fill in the listing first");
  const price = num(fd, "soldPrice");
  if (!(price > 0)) throw new Error("What did it sell for?");
  const soldAt = parseDateInput(fd.get("soldAt")) ?? new Date();
  const defaults = await specDefaults();
  const sheet: Sheet = {
    listPct: spec.listPct,
    buyerPct: num(fd, "buyerPct", spec.buyerPct),
    lines: parseLines(spec.closingLines) ?? defaults.closingLines,
    concessions: num(fd, "concessions"),
    repairs: num(fd, "repairs"),
    annualTax: spec.annualTax,
    hoaAnnual: spec.hoaAnnual,
    hoaPaidThrough: spec.hoaPaidThrough,
    titleQuote: numOrNull(fd, "titleQuote"),
  };
  const { selling } = netSheet(price, sheet, soldAt);
  await db.$transaction([
    db.specSale.update({ where: { id: spec.id }, data: { soldPrice: price, soldAt } }),
    db.expense.deleteMany({ where: { projectId: project.id, vendor: SALE_VENDOR } }),
    db.expense.create({
      data: {
        projectId: project.id,
        date: soldAt,
        vendor: SALE_VENDOR,
        description: `Commissions, closing costs, prorations, concessions & repairs on the ${money(price)} sale`,
        category: "OTHER",
        amount: Math.round(selling * 100) / 100,
        status: "PAID",
        enteredById: user.id,
      },
    }),
    // Charges for months after it sold go.
    db.expense.deleteMany({ where: { projectId: project.id, carryingCostId: { not: null }, date: { gt: soldAt } } }),
  ]);
  await logActivity({ projectId: project.id, userId: user.id, type: "spec.sold", description: `Sold for ${money(price)}` });
  revalidate(project.id);
  redirect(page(project.id));
});

/** Back on the market: the sale and its selling costs come off. */
export const unmarkSold = friendly(async function unmarkSold(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  await db.$transaction([
    db.specSale.update({ where: { projectId: project.id }, data: { soldPrice: null, soldAt: null } }),
    db.expense.deleteMany({ where: { projectId: project.id, vendor: SALE_VENDOR } }),
  ]);
  await syncCarrying(project.id);
  revalidate(project.id);
  redirect(page(project.id));
});

/**
 * The construction loan's history: a draw, a paydown, a new rate (from a date), or the bank's
 * actual interest for a month (it replaces the program's figure for that month).
 */
export const addLoanEntry = friendly(async function addLoanEntry(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const cost = await db.carryingCost.findFirst({ where: { id: str(fd, "carryingCostId"), projectId: project.id, kind: "INTEREST" } });
  if (!cost) throw new Error("Loan not found");
  const kind = str(fd, "kind");
  if (!["DRAW", "PAYDOWN", "RATE", "ACTUAL"].includes(kind)) throw new Error("Pick what it is");
  const note = strOrNull(fd, "note")?.slice(0, 200) ?? null;
  if (kind === "ACTUAL") {
    const month = str(fd, "month");
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Which month is the bank's interest for?");
    const amount = num(fd, "amount");
    if (!(amount >= 0)) throw new Error("Type the bank's interest for the month");
    await db.loanEntry.deleteMany({ where: { carryingCostId: cost.id, kind: "ACTUAL", month } });
    await db.loanEntry.create({ data: { carryingCostId: cost.id, kind, month, amount, date: new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1), note } });
  } else {
    const date = parseDateInput(fd.get("date"));
    if (!date) throw new Error("When?");
    if (dayNo(date) < dayNo(cost.startDate)) throw new Error("That's before the loan's interest starts — change its From date first");
    if (kind === "RATE") {
      const ratePct = num(fd, "ratePct");
      if (!(ratePct > 0 && ratePct < 40)) throw new Error("Type the new rate, e.g. 8.75");
      await db.loanEntry.create({ data: { carryingCostId: cost.id, kind, date, ratePct, note } });
    } else {
      const amount = num(fd, "amount");
      if (!(amount > 0)) throw new Error(kind === "DRAW" ? "How much was drawn?" : "How much was paid down?");
      await db.loanEntry.create({ data: { carryingCostId: cost.id, kind, date, amount, note } });
    }
  }
  // A month already charged with no bank figure keeps its charge; a bank figure fixes it.
  await syncCarrying(project.id);
  revalidate(project.id);
  redirect(`${page(project.id)}#loan-${cost.id}`);
});

export const deleteLoanEntry = friendly(async function deleteLoanEntry(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const e = await db.loanEntry.findFirst({ where: { id: str(fd, "id"), carryingCost: { projectId: project.id } } });
  if (!e) throw new Error("Already gone");
  await db.loanEntry.delete({ where: { id: e.id } });
  revalidate(project.id);
  redirect(`${page(project.id)}#loan-${e.carryingCostId}`);
});

"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireEdit } from "@/lib/auth";
import { db } from "@/lib/db";
import { currentCompanyId } from "@/lib/tenant";
import { logActivity } from "@/lib/activity";
import { money, numField, str, strOrNull } from "@/lib/utils";
import { lineTotals } from "@/lib/finance";
import { copyIntoEstimate, copyIntoTemplate, createProjectEstimate, ensureEstimateSpecs, loadTemplate, nextSortOrder, pruneSelections, saveEstimateSheet } from "@/lib/estimate-lines";
import { saveSheetInput } from "@/lib/estimate-sheet";
import { learnDivisions } from "@/lib/estimate-categories";
import { estimateValues, saveEstimateValues, templateValues } from "@/lib/estimate-parameters";
import { saveCover } from "@/lib/project-cover";
import { deleteUpload, saveUpload } from "@/lib/uploads";
import { proposalOptionsSchema } from "@/lib/proposal-options";
import { priceSheetSchema } from "@/lib/price-sheet";
import { markupTableSchema } from "@/lib/markup";
import { takeBidSnapshot } from "@/lib/bid-snapshots";
import { clearJobNumbers } from "@/lib/template-numbers";
import { fillFromTakeoff, heldKey, lockAfterAutoChanges } from "@/lib/takeoff-data";
import { parseSnapshot } from "@/lib/takeoff-changes";
import { loadProposal } from "@/lib/proposal-data";
import { buildProposal } from "@/lib/proposal-options";
import { emailProposalToClient } from "@/lib/notify-client";

function estimatePath(projectId: string, estimateId?: string) {
  return `/projects/${projectId}/estimate${estimateId ? `?estimate=${estimateId}` : ""}`;
}

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/estimate`);
  revalidatePath(`/projects/${projectId}/budget`);
  revalidatePath(`/projects/${projectId}/invoices`);
  revalidatePath(`/projects/${projectId}/selections`);
  revalidatePath(`/projects/${projectId}`);
}

async function loadProject(projectId: string) {
  const project = await db.project.findUnique({ where: { id: projectId } });
  if (!project) throw new Error("Project not found");
  return project;
}

async function loadEstimate(projectId: string, estimateId: string) {
  await ensureEstimateSpecs(estimateId);
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId }, include: { items: true, specs: true } });
  if (!est) throw new Error("Estimate not found");
  return est;
}

async function loadDraftEstimate(projectId: string, estimateId: string) {
  const est = await loadEstimate(projectId, estimateId);
  if (est.status !== "DRAFT") throw new Error("Estimate is not editable");
  return est;
}

async function nextVersion(projectId: string) {
  const last = await db.estimate.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
  return (last?.version ?? 0) + 1;
}

export type SaveEstimateResult = { ok: true; estimateId: string; version: number; learned: string[] } | { ok: false; error: string };

/**
 * Saves the estimate sheet. "over" writes into this estimate (drafts only);
 * "new" makes the next version from what's on screen and leaves this one as it was.
 */
export async function saveEstimate(projectId: string, estimateId: string, raw: unknown, mode: "over" | "new"): Promise<SaveEstimateResult> {
  const user = await requireEdit("estimates", { costs: true });
  const parsed = saveSheetInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Some numbers on the sheet aren't valid — check the highlighted cells." };
  const input = parsed.data;
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId } });
  if (!est) return { ok: false, error: "Estimate not found" };
  if (mode === "over" && est.status !== "DRAFT") return { ok: false, error: `v${est.version} is ${est.status.toLowerCase()} — save it as a new version.` };
  if (mode === "over" && est.lockedAt) return { ok: false, error: `v${est.version} is locked — unlock it to save changes, or save them as a new version.` };
  // The Markup, Margin & Tax table: saved with the sheet (a new version starts from what's on screen).
  const header = {
    basePrice: input.basePrice,
    totalSqFt: input.totalSqFt,
    ...(input.markupTable ? { markupTable: JSON.stringify(input.markupTable) } : {}),
  };

  const saved = await db.$transaction(
    async (tx) => {
      if (mode === "over") {
        // Saved: the "what changed" note (and its copy of the last save) starts over.
        await tx.estimate.update({ where: { id: est.id }, data: { ...header, autoNote: null, autoBase: null } });
        await saveEstimateSheet(tx, est.id, est.id, input);
        if (input.parameterValues) await saveEstimateValues(tx, est.id, input.parameterValues);
        return est;
      }
      const created = await tx.estimate.create({
        data: {
          projectId,
          name: est.name,
          version: await nextVersion(projectId),
          status: "DRAFT",
          notes: est.notes,
          terms: est.terms,
          defaultMarkup: est.defaultMarkup,
          markupTable: est.markupTable,
          ...header,
        },
      });
      await saveEstimateSheet(tx, est.id, created.id, input);
      // Saved as a new version: it starts with the values on screen (a copy of this one).
      await saveEstimateValues(tx, created.id, input.parameterValues ?? (await estimateValues(est.id, tx)));
      return created;
    },
    { timeout: 60000 },
  );
  await logActivity({
    projectId,
    userId: user.id,
    type: mode === "over" ? "estimate.updated" : "estimate.version",
    description: mode === "over" ? `Estimate v${saved.version} saved` : `Estimate v${saved.version} created from v${est.version}`,
  });
  revalidate(projectId);
  // Arranging categories into divisions here updates your Settings (admins).
  const learned = user.role === "ADMIN" ? await learnDivisions(input.specs) : [];
  return { ok: true, estimateId: saved.id, version: saved.version, learned };
}

/** New estimate version — blank, or pre-filled from an estimate template. */
export const createEstimate = friendly(async function createEstimate(formData: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const projectId = str(formData, "projectId");
  await loadProject(projectId);
  const { estimate: est, template } = await createProjectEstimate(projectId, strOrNull(formData, "templateId"));
  // It starts with the job's takeoff on it (no sending needed).
  await fillFromTakeoff(projectId, est.id).catch(() => null);
  await logActivity({
    projectId,
    userId: user.id,
    type: "estimate.created",
    description: `Estimate v${est.version} created${template ? ` from template "${template.name}"` : ""}`,
  });
  revalidate(projectId);
  redirect(estimatePath(projectId, est.id));
});

export const updateEstimateDetails = friendly(async function updateEstimateDetails(formData: FormData) {
  await requireEdit("estimates", { costs: true });
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  await loadEstimate(projectId, id);
  const name = str(formData, "name");
  const data: { name?: string; notes?: string | null; terms?: string | null; defaultMarkup?: number } = {};
  if (formData.has("name")) data.name = name || "Estimate";
  if (formData.has("notes")) data.notes = strOrNull(formData, "notes");
  if (formData.has("terms")) data.terms = strOrNull(formData, "terms");
  if (formData.has("defaultMarkup")) data.defaultMarkup = numField(formData, "defaultMarkup", 20);
  await db.estimate.update({ where: { id }, data });
  revalidate(projectId);
  redirect(estimatePath(projectId, id));
});

export const markEstimateSent = friendly(async function markEstimateSent(formData: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, id);
  if (est.status !== "DRAFT") throw new Error("Only draft estimates can be sent");
  await db.estimate.update({ where: { id }, data: { status: "SENT", sentAt: new Date(), sentById: user.id } });
  // The client has a number now: the Material list as priced today is kept (escalation is measured from it).
  await takeBidSnapshot(projectId, id, "SENT", { userId: user.id }).catch((e) => console.error("Sent snapshot failed", e));
  const project = await loadProject(projectId);
  if (project.status === "LEAD" || project.status === "ESTIMATING") {
    await db.project.update({ where: { id: projectId }, data: { status: "PROPOSAL_SENT" } });
  }
  // It's in the client's portal now, and they're emailed (when there's an address for them).
  const shown = await loadProposal(projectId, id);
  const emailed = shown ? await emailProposalToClient(id, buildProposal(shown.specs, shown.options, shown.estimate.basePrice, shown.extras).total, user) : [];
  await logActivity({
    projectId,
    userId: user.id,
    type: "estimate.sent",
    description: `Estimate "${est.name}" v${est.version} marked sent${emailed.length ? ` — proposal emailed to ${emailed.join(", ")}` : " — not emailed (no email address for the client)"}`,
  });
  revalidate(projectId);
  redirect(estimatePath(projectId, id));
});

/**
 * A spec house has no client to approve it: its estimate is locked in as the budget in one
 * step — the Budget follows it. The job goes to In progress.
 */
export const estimateAsBudget = friendly(async function estimateAsBudget(formData: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, id);
  if (est.status === "APPROVED") return;
  const project = await loadProject(projectId);
  if (!project.isSpec) throw new Error("Only a spec house's estimate is used as the budget this way — a client's is sent and approved");
  const other = await db.estimate.findFirst({ where: { projectId, status: "APPROVED", id: { not: id } }, select: { name: true, version: true } });
  if (other) throw new Error(`"${other.name}" v${other.version} is already the budget — that one stays unless you change it back first`);
  await db.estimate.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), sentAt: est.sentAt ?? new Date() } });
  if (["LEAD", "ESTIMATING", "PROPOSAL_SENT"].includes(project.status)) await db.project.update({ where: { id: projectId }, data: { status: "IN_PROGRESS" } });
  const totals = lineTotals(est.items);
  await logActivity({
    projectId,
    userId: user.id,
    type: "estimate.approved",
    description: `Estimate "${est.name}" v${est.version} locked in as the budget (${money(totals.cost)} cost)`,
  });
  revalidate(projectId);
  revalidatePath(`/projects/${projectId}/budget`);
  revalidatePath(`/projects/${projectId}/spec`, "layout");
  redirect(estimatePath(projectId, id));
});

export const markEstimateApproved = friendly(async function markEstimateApproved(formData: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, id);
  if (est.status !== "SENT") throw new Error("Only sent estimates can be approved");
  await db.estimate.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date() } });
  // The Material list as priced the day it was signed.
  await takeBidSnapshot(projectId, id, "SIGNED", { userId: user.id }).catch((e) => console.error("Signed snapshot failed", e));
  const project = await loadProject(projectId);
  if (["LEAD", "ESTIMATING", "PROPOSAL_SENT"].includes(project.status)) {
    await db.project.update({ where: { id: projectId }, data: { status: "CONTRACTED" } });
  }
  const totals = lineTotals(est.items);
  await logActivity({
    projectId,
    userId: user.id,
    type: "estimate.approved",
    description: `Estimate "${est.name}" v${est.version} approved (${money(est.basePrice ?? totals.price)})`,
  });
  revalidate(projectId);
  redirect(estimatePath(projectId, id));
});

export const markEstimateDeclined = friendly(async function markEstimateDeclined(formData: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, id);
  if (est.status !== "SENT") throw new Error("Only sent estimates can be declined");
  await db.estimate.update({ where: { id }, data: { status: "DECLINED" } });
  await logActivity({ projectId, userId: user.id, type: "estimate.declined", description: `Estimate "${est.name}" v${est.version} declined` });
  revalidate(projectId);
  redirect(estimatePath(projectId, id));
});

/**
 * The next version, a copy of this one. "today" (Copy with today's prices): lines tied to the
 * Item List take its price now, and the takeoff's lines follow the takeoff as usual (items kept
 * at "This job only" keep theirs). "exact": every price stays as it was — the takeoff's lines
 * keep this version's prices while their quantities still follow the takeoff. Typed lines
 * keep their prices either way.
 */
export const createEstimateVersion = friendly(async function createEstimateVersion(formData: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const exact = str(formData, "prices") === "exact";
  const source = await loadEstimate(projectId, id);
  const version = await nextVersion(projectId);
  // The takeoff prices this version was priced at: what its takeoff lines were made of.
  const held: Record<string, number> = {};
  if (exact) for (const i of source.items) for (const r of parseSnapshot(i.takeoffSnapshot) ?? []) held[heldKey(r.d, r.u)] = r.c;
  const est = await db.$transaction(async (tx) => {
    const created = await tx.estimate.create({
      data: {
        projectId,
        name: source.name,
        version,
        status: "DRAFT",
        notes: source.notes,
        terms: source.terms,
        defaultMarkup: source.defaultMarkup,
        basePrice: source.basePrice,
        markupTable: source.markupTable,
        totalSqFt: source.totalSqFt,
        // (Nothing to keep when that version has no takeoff lines.)
        heldPrices: exact && Object.keys(held).length ? JSON.stringify(held) : null,
        heldFrom: exact && Object.keys(held).length ? source.version : null,
      },
    });
    await copyIntoEstimate(tx, created.id, source, { keepSelectionLinks: true });
    // A copy of a version carries that version's parameter values.
    await saveEstimateValues(tx, created.id, await estimateValues(source.id, tx));
    if (!exact) {
      // Lines picked from the Item List (not the takeoff's, which follow it by themselves) take its price today.
      const tied = await tx.estimateItem.findMany({
        where: { estimateId: created.id, materialItemId: { not: null }, takeoffRollup: null, takeoffConditionId: null },
        select: { id: true, unitCost: true, materialItem: { select: { unitCost: true } } },
      });
      for (const i of tied) {
        const list = i.materialItem?.unitCost ?? 0;
        if (list > 0 && Math.abs(list - i.unitCost) > 0.0001) await tx.estimateItem.update({ where: { id: i.id }, data: { unitCost: list } });
      }
    }
    return created;
  });
  await logActivity({
    projectId,
    userId: user.id,
    type: "estimate.version",
    description: `Estimate v${version} created from v${source.version} (${exact ? `v${source.version}'s prices` : "today's prices"})`,
  });
  revalidate(projectId);
  redirect(estimatePath(projectId, est.id));
});

/** A draft copied "exactly" lets go of the old prices: its takeoff lines take today's the next time it opens. */
export const takeTodaysPrices = friendly(async function takeTodaysPrices(formData: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const est = await loadDraftEstimate(projectId, id);
  await db.estimate.update({ where: { id }, data: { heldPrices: null, heldFrom: null } });
  await logActivity({ projectId, userId: user.id, type: "estimate.prices", description: `Estimate v${est.version} now uses today's prices` });
  revalidate(projectId);
  redirect(estimatePath(projectId, id));
});

export const deleteEstimate = friendly(async function deleteEstimate(formData: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, id);
  if (est.status !== "DRAFT") throw new Error("Only draft estimates can be deleted");
  // Its selections go with it unless another version has them, or something was done on them.
  const links = await db.estimateSpec.findMany({ where: { estimateId: id }, select: { selectionId: true } });
  await db.$transaction(async (tx) => {
    await tx.estimate.delete({ where: { id } });
    await pruneSelections(
      tx,
      links.map((l) => l.selectionId),
    );
  });
  await logActivity({ projectId, userId: user.id, type: "estimate.deleted", description: `Estimate v${est.version} deleted` });
  revalidate(projectId);
  redirect(estimatePath(projectId));
});

// --- Templates ----------------------------------------------------------------

/** Appends a template's spec items and lines to a draft estimate (e.g. a "Bathroom" template onto a kitchen job). */
export const addTemplateToEstimate = friendly(async function addTemplateToEstimate(formData: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const templateId = str(formData, "templateId");
  if (!templateId) throw new Error("Pick a template");
  const est = await loadDraftEstimate(projectId, estimateId);
  const template = await loadTemplate(templateId);
  // The template's parameter values fill in only the ones this estimate doesn't have yet.
  const values = { ...templateValues(template.paramValues), ...(await estimateValues(estimateId)) };
  await db.$transaction(
    async (tx) => {
      await saveEstimateValues(tx, estimateId, values);
      await copyIntoEstimate(tx, estimateId, template, { sortOffset: nextSortOrder(est), values });
    },
    { timeout: 30000 },
  );
  await logActivity({
    projectId,
    userId: user.id,
    type: "estimate.template_added",
    description: `Added template "${template.name}" (${template.items.length} lines) to estimate v${est.version}`,
  });
  revalidate(projectId);
  redirect(estimatePath(projectId, estimateId));
});

/**
 * Admins: copy this estimate (spec items, lines, notes, terms, markup) into a new template.
 * It keeps your formulas and typed unit costs and drops this job's numbers (clearJobNumbers):
 * quantities, allowances, the takeoff's totals and parameter values start blank for the next job.
 * The template is a copy: jobs made from it never change with it.
 */
export const saveEstimateAsTemplate = friendly(async function saveEstimateAsTemplate(formData: FormData) {
  const admin = await requireAdmin();
  const projectId = str(formData, "projectId");
  const estimateId = str(formData, "estimateId");
  const est = await loadEstimate(projectId, estimateId);
  const name = str(formData, "name") || est.name;
  const template = await db.$transaction(async (tx) => {
    const created = await tx.estimateTemplate.create({
      data: { name, notes: est.notes, terms: est.terms, defaultMarkup: est.defaultMarkup, markupTable: est.markupTable, paramValues: null },
    });
    const items = est.items.map((i) => ({ ...i, ...clearJobNumbers({ ...i, fromTakeoff: !!i.takeoffRollup || !!i.takeoffConditionId }) }));
    await copyIntoTemplate(tx, created.id, { ...est, items });
    return created;
  });
  await logActivity({
    userId: admin.id,
    type: "estimate_template.created",
    description: `Saved estimate v${est.version} as template "${name}"`,
  });
  revalidatePath("/catalog/estimate-templates");
  redirect(`/catalog/estimate-templates/${template.id}`);
});

// --- Proposal options ---------------------------------------------------------------

/**
 * What the proposal shows. "estimate": just this estimate. "default": your default for
 * every proposal (this estimate then follows it too). "reset": this estimate goes
 * back to following your default.
 */
export async function saveProposalOptions(
  projectId: string,
  estimateId: string,
  raw: unknown,
  scope: "estimate" | "default" | "reset",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireEdit("estimates", { costs: true });
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId }, select: { id: true } });
  if (!est) return { ok: false, error: "Estimate not found" };
  if (scope === "reset") {
    await db.estimate.update({ where: { id: est.id }, data: { proposalOptions: null } });
  } else {
    const parsed = proposalOptionsSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Those options couldn't be saved." };
    const json = JSON.stringify(parsed.data);
    if (scope === "estimate") await db.estimate.update({ where: { id: est.id }, data: { proposalOptions: json } });
    else {
      if (user.role !== "ADMIN") return { ok: false, error: "Only an admin can change the default for every proposal." };
      const company = await db.company.findFirst({ select: { id: true } });
      if (!company) return { ok: false, error: "Set up your company first (Settings)." };
      await db.$transaction([
        db.company.update({ where: { id: company.id }, data: { proposalOptions: json } }),
        db.estimate.update({ where: { id: est.id }, data: { proposalOptions: null } }),
      ]);
    }
  }
  revalidatePath(`/projects/${projectId}/estimate/${estimateId}/proposal`);
  return { ok: true };
}

/** The client's price change sheet: for this estimate, as the company default (admins), or back to the default. */
export async function savePriceSheet(
  projectId: string,
  estimateId: string,
  raw: unknown,
  scope: "estimate" | "default" | "reset",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireEdit("estimates", { costs: true });
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId }, select: { id: true } });
  if (!est) return { ok: false, error: "Estimate not found" };
  if (scope === "reset") await db.estimate.update({ where: { id: est.id }, data: { priceSheetOptions: null } });
  else {
    const parsed = priceSheetSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, error: "Those settings couldn't be saved." };
    // (A category left off one job means nothing on the next: the default never keeps them.)
    const json = JSON.stringify(scope === "default" ? { ...parsed.data, leaveOut: [] } : parsed.data);
    if (scope === "estimate") await db.estimate.update({ where: { id: est.id }, data: { priceSheetOptions: json } });
    else {
      if (user.role !== "ADMIN") return { ok: false, error: "Only an admin can change the default for every price change sheet." };
      await db.company.updateMany({ data: { priceSheetOptions: json } });
      // This sheet keeps what's left off it.
      await db.estimate.update({ where: { id: est.id }, data: { priceSheetOptions: parsed.data.leaveOut.length ? JSON.stringify({ ...parsed.data }) : null } });
    }
  }
  revalidatePath(`/projects/${projectId}/estimate/${estimateId}/price-change`);
  return { ok: true };
}

// --- Proposal cover picture ---------------------------------------------------------

/** Sets (form has "file") or removes (no file) the job's cover picture. */
export async function setProjectCover(projectId: string, fd: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireEdit("estimates", { costs: true });
  const project = await db.project.findUnique({ where: { id: projectId }, select: { coverPath: true } });
  if (!project) return { ok: false, error: "Project not found" };
  const file = fd.get("file");
  try {
    if (file instanceof File && file.size > 0) {
      const saved = await saveCover(projectId, file, project.coverPath);
      await db.project.update({ where: { id: projectId }, data: saved });
    } else {
      if (project.coverPath) await deleteUpload(project.coverPath);
      await db.project.update({ where: { id: projectId }, data: { coverPath: null, coverType: null } });
    }
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath(`/projects/${projectId}/estimate`, "layout");
  return { ok: true };
}

// --- Proposal introduction and terms -------------------------------------------------

/**
 * The proposal's introduction or terms, typed right on the proposal: for this estimate, or (admins)
 * as your standard one too — what new estimates start with. Proposals already made keep their own.
 */
export async function saveProposalText(
  projectId: string,
  estimateId: string,
  field: "intro" | "terms",
  text: string,
  scope: "estimate" | "default",
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireEdit("estimates", { costs: true });
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId }, select: { id: true } });
  if (!est) return { ok: false, error: "Estimate not found" };
  if (field !== "intro" && field !== "terms") return { ok: false, error: "That can't be saved." };
  const value = String(text ?? "").replace(/\r\n?/g, "\n").trim().slice(0, 20000) || null;
  if (scope === "default" && user.role !== "ADMIN") return { ok: false, error: "Only an admin can change your standard wording." };
  await db.estimate.update({ where: { id: est.id }, data: field === "intro" ? { notes: value } : { terms: value } });
  if (scope === "default") {
    await db.company.updateMany({ data: field === "intro" ? { proposalIntro: value } : { proposalTerms: value } });
    revalidatePath("/settings/proposals");
  }
  revalidatePath(`/projects/${projectId}/estimate/${estimateId}/proposal`);
  return { ok: true };
}

// --- Proposal pictures ----------------------------------------------------------------

/** The most pictures under one category on a proposal. */
const MAX_PROPOSAL_PHOTOS = 8;

const proposalSpec = (projectId: string, estimateId: string, specId: string) =>
  db.estimateSpec.findFirst({ where: { id: specId, estimateId, estimate: { projectId } }, select: { id: true, photos: true } });

/**
 * The pictures under a category on the proposal, in order (remove one, or add one of the job's photos).
 * Only this job's pictures your client may see are kept — the proposal shows them to the client.
 */
export async function setProposalPhotos(projectId: string, estimateId: string, specId: string, ids: string[]): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireEdit("estimates");
  const spec = await proposalSpec(projectId, estimateId, specId);
  if (!spec) return { ok: false, error: "That category isn't on this estimate any more." };
  const want = [...new Set((Array.isArray(ids) ? ids : []).map(String))].slice(0, MAX_PROPOSAL_PHOTOS);
  const ok = new Set(
    (await db.fileAsset.findMany({ where: { id: { in: want }, projectId, clientVisible: true, mimeType: { startsWith: "image/" } }, select: { id: true } })).map((f) => f.id),
  );
  await db.estimateSpec.update({ where: { id: spec.id }, data: { photos: want.filter((id) => ok.has(id)) } });
  revalidatePath(`/projects/${projectId}/estimate/${estimateId}/proposal`);
  return { ok: true };
}

/** A new picture under a category on the proposal: saved to the job's Photos (your client can see it) and added. */
export async function uploadProposalPhoto(projectId: string, estimateId: string, specId: string, fd: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireEdit("estimates");
  const spec = await proposalSpec(projectId, estimateId, specId);
  if (!spec) return { ok: false, error: "That category isn't on this estimate any more." };
  if (spec.photos.length >= MAX_PROPOSAL_PHOTOS) return { ok: false, error: `${MAX_PROPOSAL_PHOTOS} pictures is the most for one line.` };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Pick a picture first." };
  if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) return { ok: false, error: "Use a PNG, JPG or WebP picture." };
  try {
    const meta = await saveUpload(file, projectId, undefined, "photo");
    const asset = await db.fileAsset.create({ data: { ...meta, projectId, uploadedById: user.id, folder: "Photos", clientVisible: true } });
    await db.estimateSpec.update({ where: { id: spec.id }, data: { photos: [...spec.photos, asset.id] } });
    await logActivity({ projectId, userId: user.id, type: "file.uploaded", description: `Added a picture to the proposal (${meta.name})` });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath(`/projects/${projectId}/estimate/${estimateId}/proposal`);
  revalidatePath(`/projects/${projectId}/files`);
  return { ok: true };
}

// --- Markup, Margin & Tax --------------------------------------------------------------

/** "Save as my default": new estimates start with this table. */
export async function saveMarkupDefault(raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireEdit("estimates", { costs: true });
  const parsed = markupTableSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Check the table's rows" };
  const company = await db.company.findFirst({ select: { id: true } });
  if (!company) return { ok: false, error: "Set up your company first (Settings)." };
  await db.company.update({ where: { id: company.id }, data: { markupTable: JSON.stringify(parsed.data) } });
  return { ok: true };
}

/** This estimate version's parameter values — saved when you close the Parameters panel (each version has its own). */
export async function saveParameterValues(projectId: string, estimateId: string, raw: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireEdit("estimates", { costs: true });
  const parsed = saveSheetInput.shape.parameterValues.unwrap().safeParse(raw);
  if (!parsed.success) return { ok: false, error: "One of the numbers isn't valid." };
  const est = await db.estimate.findFirst({ where: { id: estimateId, projectId }, select: { id: true } });
  if (!est) return { ok: false, error: "Estimate not found" };
  await db.$transaction((tx) => saveEstimateValues(tx, est.id, parsed.data));
  revalidatePath(`/projects/${projectId}/estimate`);
  return { ok: true };
}

// --- Estimate lock and "what changed" ---------------------------------------------------

/** Locks a draft: no automatic updates from the takeoff and no edits until it's unlocked. */
export const lockEstimate = friendly(async function lockEstimate(formData: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const projectId = str(formData, "projectId");
  const id = str(formData, "id");
  const est = await loadEstimate(projectId, id);
  const locked = formData.get("lock") === "1";
  await db.estimate.update({ where: { id }, data: { lockedAt: locked ? new Date() : null } });
  await logActivity({
    projectId,
    userId: user.id,
    type: locked ? "estimate.locked" : "estimate.unlocked",
    description: `Estimate v${est.version} ${locked ? "locked" : "unlocked"}`,
  });
  revalidate(projectId);
  redirect(estimatePath(projectId, id));
});

/** Clears the "what changed" note (the changes stay — just the note goes). */
export async function dismissAutoNote(projectId: string, estimateId: string): Promise<{ ok: true }> {
  await requireEdit("estimates", { costs: true });
  // Without touching the estimate's "updated" time — that would reload the sheet and lose unsaved edits.
  const companyId = await currentCompanyId();
  await db.$transaction(async (tx) => tx.$executeRaw`UPDATE "Estimate" SET "autoNote" = NULL, "autoBase" = NULL WHERE "id" = ${estimateId} AND "projectId" = ${projectId} AND "companyId" = ${companyId}`);
  revalidatePath(`/projects/${projectId}/estimate`);
  return { ok: true };
}

/**
 * From the "what changed" note: lock the estimate, either putting it back to what you
 * last saved (what you bid) or keeping the takeoff's changes.
 */
export async function lockFromAutoNote(projectId: string, estimateId: string, keep: boolean): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireEdit("estimates", { costs: true });
  try {
    const { estimate, restored } = await lockAfterAutoChanges(projectId, estimateId, keep);
    await logActivity({
      projectId,
      userId: user.id,
      type: "estimate.locked",
      description: restored ? `Estimate v${estimate.version} put back to its last save and locked` : `Estimate v${estimate.version} locked with the takeoff's changes`,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't lock the estimate" };
  }
  revalidate(projectId);
  return { ok: true };
}

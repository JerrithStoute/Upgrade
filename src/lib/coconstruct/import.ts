import "server-only";
import { db } from "../db";
import { runAsCompany } from "../tenant";
import { nextProjectNumber } from "../projects";
import { newChangeOrder } from "../billing-flow";
import { startingTable } from "../markup";
import { allowanceAmount } from "../proposal-options";
import { deleteUpload, saveUpload } from "../uploads";
import { choiceOf, cents, estimateLines, plainName, type CcCategory, type CcEstimate, type CcItem, type CcPlan } from "./estimate";

/**
 * The Station's "Bring in a CoConstruct job": a job running in CoConstruct, made in one
 * builder's account the way it stands today — so they can carry on here.
 *
 * Made: the client (by name), the job (Contracted), the estimate (approved, at the price quoted —
 * its lines are the budget), its selections (open, chosen, or final), an approved change order for
 * each of CoConstruct's change orders, the final choices' over/under on a "Selections" change order
 * (approved, or a draft to approve yourself), the other choices' over/under on a draft "Selections"
 * change order, and the PDFs in the job's Files (team only). Cost codes are the builder's, matched
 * by code; a code they don't have is added.
 *
 * Never: invoices, payments or bills — those already sit in QuickBooks (CoConstruct sent them) and
 * come from there. Nothing is emailed to anyone.
 */

export type CcJob = {
  name: string;
  clientFirst: string;
  clientLast: string;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  /** The usual profit % (the estimate's default). */
  markupPct: number;
  /** The final choices' change order: approved (counts in the contract now) or a draft. */
  finalApproved: boolean;
};

const REASON = "Brought in from CoConstruct";
const day = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date());

export async function importCoConstructJob(companyId: string, est: CcEstimate, plan: CcPlan, job: CcJob, files: File[]) {
  return runAsCompany(companyId, async () => {
    const byRow = new Map(plan.categories.map((p) => [p.row, p]));
    const cats = est.categories.map((c) => ({ c, p: byRow.get(c.row) })).filter((x): x is { c: CcCategory; p: NonNullable<typeof x.p> } => !!x.p && x.p.role !== "SKIP");

    // Cost codes by code; any missing are added (under the division CoConstruct had them in).
    const codes = new Map<string, string>();
    for (const cc of await db.costCode.findMany({ select: { id: true, code: true } })) if (cc.code) codes.set(cc.code.trim(), cc.id);
    const codeOf = async (i: CcItem, division: string) => {
      if (!i.code) return null;
      const have = codes.get(i.code);
      if (have) return have;
      const made = await db.costCode.create({ data: { code: i.code, name: i.codeName || i.code, division: plainName(division) || "Other" } });
      codes.set(i.code, made.id);
      return made.id;
    };

    const client = await db.client.create({ data: { firstName: job.clientFirst.trim() || "Client", lastName: job.clientLast.trim(), source: "CoConstruct" } });
    const project = await db.project.create({
      data: {
        number: await nextProjectNumber(),
        name: job.name.trim(),
        status: "CONTRACTED",
        type: "NEW_HOME",
        clientId: client.id,
        address: job.address || null,
        city: job.city || null,
        state: job.state || null,
        zip: job.zip || null,
        contractAmount: plan.basePrice ?? 0,
      },
    });
    const saved: string[] = [];
    try {
      const now = new Date();
      const estimate = await db.estimate.create({
        data: {
          projectId: project.id,
          name: "Estimate",
          version: 1,
          status: "APPROVED",
          defaultMarkup: job.markupPct,
          markupTable: JSON.stringify(startingTable(job.markupPct)),
          basePrice: plan.basePrice,
          sentAt: now,
          approvedAt: now,
          notes: null,
        },
      });

      // The estimate: Division → Category → Items, and a selection for each category that is one.
      const finals: { sel: string; title: string; category: string; choice: string; price: number; allowance: number; code: string | null }[] = [];
      const chosen: typeof finals = [];
      let sort = 0;
      for (const { c, p } of cats.filter((x) => x.p.role === "ESTIMATE")) {
        const division = plainName(c.division);
        const isAllowance = c.isAllowance && p.selection;
        const spec = await db.estimateSpec.create({
          data: { estimateId: estimate.id, name: c.name, category: division, kind: p.selection ? "SELECTION" : "SPECIFICATION", isAllowance, sortOrder: sort++ },
        });
        const lines = estimateLines(c, p);
        const rows = [];
        for (const [k, i] of lines.entries())
          rows.push({
            estimateId: estimate.id,
            specId: spec.id,
            group: division,
            description: i.description || "Item",
            quantity: i.quantity,
            unit: i.unit,
            unitCost: i.unitCost,
            markupPct: i.markupPct,
            costType: i.costType,
            costCodeId: await codeOf(i, c.division),
            isAllowance,
            notes: i.notes,
            sortOrder: k,
          });
        if (rows.length) await db.estimateItem.createMany({ data: rows });
        if (!p.selection) continue;

        // Its allowance figured the way the selections page does (with or without profit, per the company).
        const company = await db.company.findFirst({ select: { allowanceProfit: true } });
        const allowance = isAllowance ? allowanceAmount(rows.map((r) => ({ ...r, isOptional: false })), company?.allowanceProfit ?? false) : 0;
        const ch = choiceOf(c, p);
        const sel = await db.selection.create({
          data: {
            projectId: project.id,
            title: c.name,
            category: division,
            allowance,
            status: !ch ? "PENDING" : p.status === "FINAL" ? "APPROVED" : "CHOSEN",
            chosenAt: ch ? now : null,
            approvedAt: ch && p.status === "FINAL" ? now : null,
            notes: REASON,
          },
        });
        await db.estimateSpec.update({ where: { id: spec.id }, data: { selectionId: sel.id } });
        if (ch) {
          const first = ch.name.split("\n")[0];
          const opt = await db.selectionOption.create({
            data: {
              selectionId: sel.id,
              name: first.length > 120 ? `${first.slice(0, 117)}…` : first,
              description: ch.name,
              price: ch.price,
              cost: ch.price,
            },
          });
          await db.selection.update({ where: { id: sel.id }, data: { chosenOptionId: opt.id } });
          const diff = cents(ch.price - allowance);
          if (diff)
            (p.status === "FINAL" ? finals : chosen).push({ sel: sel.id, title: c.name, category: division, choice: opt.name, price: ch.price, allowance, code: rows[0]?.costCodeId ?? null });
        }
      }

      // CoConstruct's change orders, approved, each with its lines (their profit in the lines).
      const approve = (id: string, when: Date) =>
        db.changeOrder.update({
          where: { id },
          data: { status: "APPROVED", sentAt: when, clientApproval: true, clientApprovedAt: when, decidedAt: when, decidedBy: `${job.clientFirst} ${job.clientLast}`.trim() },
        });
      const plain = { profitMode: "NONE", profitValue: 0, taxPct: 0 };
      for (const { c, p } of cats.filter((x) => x.p.role === "CO")) {
        const co = await newChangeOrder(project.id, { title: p.coTitle.trim() || plainName(c.name), reason: REASON, description: c.choice });
        await db.changeOrder.update({ where: { id: co.id }, data: plain });
        for (const [k, i] of c.items.filter((x) => !p.skip.includes(x.row)).entries())
          await db.changeOrderItem.create({
            data: {
              changeOrderId: co.id,
              kind: "LINE",
              description: i.description || "Item",
              quantity: i.quantity,
              unit: i.unit,
              unitCost: i.unitCost,
              markupPct: i.markupPct,
              clientPrice: i.price,
              costCodeId: await codeOf(i, c.division),
              sortOrder: k,
              taxed: false,
            },
          });
        await approve(co.id, day(p.coDate));
      }

      // The choices' over/under: final ones on one change order, the rest on the draft the app keeps in step.
      const selectionsCo = async (list: typeof finals, approved: boolean, auto: boolean) => {
        if (!list.length) return;
        const co = await newChangeOrder(project.id, { title: "Selections", reason: approved ? `${REASON} — final choices` : "Client selections", autoSelections: auto });
        await db.changeOrder.update({ where: { id: co.id }, data: plain });
        for (const [k, s] of list.entries())
          await db.changeOrderItem.create({
            data: {
              changeOrderId: co.id,
              kind: "SELECTION",
              selectionId: s.sel,
              category: s.category,
              description: s.title,
              choiceName: s.choice,
              clientPrice: s.price,
              allowance: s.allowance,
              quantity: 1,
              unit: "ls",
              unitCost: cents(s.price - s.allowance),
              markupPct: 0,
              costCodeId: s.code,
              taxed: false,
              sortOrder: k,
            },
          });
        if (approved) await approve(co.id, now);
      };
      await selectionsCo(finals, job.finalApproved, !job.finalApproved && !chosen.length);
      await selectionsCo(chosen, false, true);

      // The PDFs: in the job's Files, for the team.
      for (const f of files) {
        const meta = await saveUpload(f, project.id);
        saved.push(meta.storagePath);
        await db.fileAsset.create({ data: { projectId: project.id, ...meta, folder: "Documents", clientVisible: false } });
      }
    } catch (err) {
      // A bring-in that fails part-way leaves no half job behind.
      await db.project.delete({ where: { id: project.id } }).catch(() => {});
      await db.client.delete({ where: { id: client.id } }).catch(() => {});
      for (const key of saved) await deleteUpload(key).catch(() => {});
      throw err;
    }
    return { id: project.id, number: project.number, name: project.name };
  });
}

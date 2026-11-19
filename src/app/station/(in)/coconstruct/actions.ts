"use server";

import { systemDb } from "@/lib/db";
import { getStationUser, stationLog } from "@/lib/station-auth";
import { readSheet } from "@/lib/coconstruct/xlsx";
import { guessPlan, parseEstimate, planTotals, type CcEstimate, type CcPlan } from "@/lib/coconstruct/estimate";
import { importCoConstructJob } from "@/lib/coconstruct/import";

/** The estimate export, read; with what each category looks like it is. */
export type CcPreview = { error?: string; est?: CcEstimate; plan?: CcPlan; markupPct?: number; jobName?: string; clientFirst?: string; clientLast?: string };

async function stationOwner() {
  const me = await getStationUser();
  return me?.role === "OWNER" ? me : null;
}

async function readEstimate(fd: FormData) {
  const f = fd.get("estimate");
  if (!(f instanceof File) || f.size === 0) throw new Error("Add the estimate export (the Excel file)");
  if (!/\.xlsx$/i.test(f.name)) throw new Error("The estimate export is the Excel file (.xlsx)");
  return { est: parseEstimate(readSheet(Buffer.from(await f.arrayBuffer()))), name: f.name };
}

/** "Estimate - Floyd and Charlee Jordan 2026-11-19 0838.xlsx" → the client's names. */
function namesFrom(file: string) {
  const who = file.replace(/\.xlsx$/i, "").replace(/^estimate\s*-\s*/i, "").replace(/\s+\d{4}-\d{2}-\d{2}.*$/, "").trim();
  const parts = who.split(/\s+/);
  const last = parts.length > 1 ? parts.pop()! : "";
  return { first: parts.join(" "), last };
}

export async function previewCoConstruct(fd: FormData): Promise<CcPreview> {
  if (!(await stationOwner())) return { error: "Only the Station's owner can bring in jobs" };
  try {
    const { est, name } = await readEstimate(fd);
    // The usual profit: the % most of the lines carry.
    const count = new Map<number, number>();
    for (const c of est.categories) for (const i of c.items) if (i.markupPct > 0) count.set(i.markupPct, (count.get(i.markupPct) ?? 0) + 1);
    const markupPct = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 15;
    const plan: CcPlan = { categories: est.categories.map((c) => guessPlan(c, markupPct)), basePrice: null };
    const n = namesFrom(name);
    return { est, plan, markupPct, jobName: n.last ? `${n.last}` : n.first, clientFirst: n.first, clientLast: n.last };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That file couldn't be read" };
  }
}

export type CcBringIn = { error?: string; done?: string };

export async function bringInCoConstruct(fd: FormData): Promise<CcBringIn> {
  const me = await stationOwner();
  if (!me) return { error: "Only the Station's owner can bring in jobs" };
  const companyId = String(fd.get("builder") ?? "");
  const company = companyId ? await systemDb.company.findUnique({ where: { id: companyId }, select: { name: true } }) : null;
  if (!company) return { error: "Pick the builder it goes to" };
  const jobName = String(fd.get("jobName") ?? "").trim();
  if (!jobName) return { error: "Give the job its name (the same as in QuickBooks)" };
  try {
    const { est } = await readEstimate(fd);
    let plan: CcPlan;
    try {
      plan = JSON.parse(String(fd.get("plan") ?? "")) as CcPlan;
    } catch {
      return { error: "Read the file again — the choices didn't come through" };
    }
    const rows = new Set(est.categories.map((c) => c.row));
    if (!Array.isArray(plan.categories) || plan.categories.some((p) => !rows.has(p.row))) return { error: "The file changed — read it again" };
    const files = fd.getAll("pdfs").filter((f): f is File => f instanceof File && f.size > 0);
    const markupPct = Number(fd.get("markupPct"));
    const made = await importCoConstructJob(
      companyId,
      est,
      plan,
      {
        name: jobName,
        clientFirst: String(fd.get("clientFirst") ?? ""),
        clientLast: String(fd.get("clientLast") ?? ""),
        address: String(fd.get("address") ?? "") || null,
        city: String(fd.get("city") ?? "") || null,
        state: String(fd.get("state") ?? "") || null,
        zip: String(fd.get("zip") ?? "") || null,
        markupPct: Number.isFinite(markupPct) && markupPct >= 0 ? markupPct : 15,
        finalApproved: fd.get("finalApproved") === "on",
      },
      files,
    );
    const t = planTotals(est, plan);
    await stationLog(me.id, "job.imported", `Brought in CoConstruct job ${made.name} for ${company.name} as #${made.number} (contract ${t.contract.toFixed(2)})`, companyId);
    return { done: `Brought in as #${made.number} ${made.name} for ${company.name}.` };
  } catch (err) {
    console.error("Bring in a CoConstruct job:", err);
    return { error: err instanceof Error ? err.message : "It didn't work" };
  }
}

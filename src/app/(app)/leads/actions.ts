"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEdit } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { leadName, leadToJob, logLead, syncLeadStages } from "@/lib/leads";
import { LEAD_STAGES, stageLabel } from "@/lib/leads-math";
import { PROJECT_TYPES } from "@/lib/constants";
import { fmtDate, parseDateInput, str, strOrNull } from "@/lib/utils";

type Result = { ok: true; stage: string; note?: string } | { ok: false; error: string };

function revalidate(id?: string) {
  revalidatePath("/leads", "layout");
  if (id) revalidatePath(`/leads/${id}`);
  revalidatePath("/dashboard");
  revalidatePath("/todos");
  revalidatePath("/projects");
  revalidatePath("/reports", "layout");
  revalidatePath("/schedule/calendar");
}

function leadFields(fd: FormData) {
  const firstName = str(fd, "firstName");
  const company = strOrNull(fd, "company");
  if (!firstName && !company) throw new Error("Give the lead a name");
  const email = strOrNull(fd, "email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error(`"${email}" doesn't look like an email — it needs an @ and a dot, like name@gmail.com. Fix it or leave it blank.`);
  const jobType = str(fd, "jobType");
  const value = str(fd, "value") === "" ? null : Number(str(fd, "value").replace(/[$,]/g, ""));
  return {
    firstName: firstName || (company ?? ""),
    lastName: str(fd, "lastName"),
    company,
    email,
    phone: strOrNull(fd, "phone"),
    address: strOrNull(fd, "address"),
    city: strOrNull(fd, "city"),
    state: strOrNull(fd, "state"),
    zip: strOrNull(fd, "zip"),
    title: strOrNull(fd, "title"),
    jobType: (PROJECT_TYPES as readonly string[]).includes(jobType) ? jobType : "REMODEL",
    value: value != null && Number.isFinite(value) ? value : null,
    source: strOrNull(fd, "source"),
    notes: strOrNull(fd, "notes"),
    ownerId: strOrNull(fd, "ownerId"),
  };
}

/** A follow-up: a To-Do tied to the lead (it shows in To-Dos, on the Dashboard and the calendar). */
async function addFollowUp(leadId: string, name: string, date: Date, note: string | null, assigneeId: string | null, userId: string) {
  await db.todo.create({
    data: { leadId, title: `Follow up: ${name}${note ? ` — ${note}` : ""}`, dueDate: date, assigneeId, createdById: userId, priority: "NORMAL" },
  });
}

/** A problem with what was typed in the lead form: shown on the form (what you typed stays). */
export type LeadFormState = { error: string } | null;
const problem = (e: unknown): LeadFormState => ({ error: e instanceof Error ? e.message : "Check the lead" });

export async function createLead(_prev: LeadFormState, fd: FormData): Promise<LeadFormState> {
  const user = await requireEdit("leads");
  let data: ReturnType<typeof leadFields>;
  try {
    data = leadFields(fd);
  } catch (e) {
    return problem(e);
  }
  const last = await db.lead.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const lead = await db.lead.create({ data: { ...data, ownerId: data.ownerId ?? user.id, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  await logLead(lead.id, "STAGE", `Lead added${data.source ? ` (${data.source})` : ""}`, user.id);
  const follow = parseDateInput(fd.get("followUp"));
  if (follow) await addFollowUp(lead.id, leadName(lead), follow, strOrNull(fd, "followNote"), lead.ownerId, user.id);
  await logActivity({ userId: user.id, type: "lead.created", description: `New lead: ${leadName(lead)}${data.title ? ` — ${data.title}` : ""}` });
  revalidate();
  redirect(`/leads/${lead.id}`);
}

/** Info edited in place on the lead's page: saved, and you stay there. */
export async function updateLead(_prev: LeadFormState, fd: FormData): Promise<LeadFormState> {
  await requireEdit("leads");
  const id = str(fd, "id");
  let data: ReturnType<typeof leadFields>;
  try {
    data = leadFields(fd);
  } catch (e) {
    return problem(e);
  }
  const lead = await db.lead.update({ where: { id }, data });
  // A job's client keeps its source in step.
  if (lead.clientId && data.source) await db.client.update({ where: { id: lead.clientId }, data: { source: data.source } });
  revalidate(id);
  return null;
}

/**
 * Moves a lead to a stage (the board's drag, or the lead's buttons). Moving to Estimate (or
 * Won) makes it a job if it isn't one; once it's a job, its stage follows the job — moving it
 * sets the job's status. Lost needs a reason.
 */
export async function moveLead(id: string, stage: string, lostReason?: string): Promise<Result> {
  const user = await requireEdit("leads");
  const lead = await db.lead.findUnique({ where: { id } });
  if (!lead) return { ok: false, error: "Lead not found" };
  if (stage !== "LOST" && !LEAD_STAGES.some((s) => s.key === stage)) return { ok: false, error: "Unknown stage" };
  if (stage === lead.stage) return { ok: true, stage };
  const now = new Date();
  let note: string | undefined;

  if (stage === "LOST") {
    const reason = (lostReason ?? "").trim();
    if (!reason) return { ok: false, error: "Why was it lost?" };
    await db.lead.update({ where: { id }, data: { stage: "LOST", stageAt: now, lostAt: now, lostReason: reason.slice(0, 200) } });
    await logLead(id, "STAGE", `Lost — ${reason}`, user.id);
  } else {
    if (lead.projectId && (stage === "INQUIRY" || stage === "MEETING")) return { ok: false, error: "It's a job now — it can't go back before Estimate" };
    let projectId = lead.projectId;
    if (!projectId && (stage === "ESTIMATE" || stage === "PROPOSAL" || stage === "WON")) {
      const p = await leadToJob(id, user.id);
      projectId = p.id;
      note = `It's job #${p.number} now — estimate it there.`;
    }
    if (projectId) {
      const status = { ESTIMATE: "ESTIMATING", PROPOSAL: "PROPOSAL_SENT", WON: "CONTRACTED" }[stage]!;
      await db.project.update({ where: { id: projectId }, data: { status } });
    }
    await db.lead.update({
      where: { id },
      data: { stage, stageAt: now, lostAt: null, lostReason: null, ...(stage === "WON" && !lead.wonAt ? { wonAt: now } : {}) },
    });
    await logLead(id, "STAGE", lead.stage === "LOST" ? `Reopened — ${stageLabel(stage)}` : `Moved to ${stageLabel(stage)}`, user.id);
    // The job may say otherwise (an estimate already sent): it wins.
    await syncLeadStages();
  }
  revalidate(id);
  const after = await db.lead.findUnique({ where: { id }, select: { stage: true } });
  if (after && after.stage !== stage && stage !== "LOST") note = `Its job puts it at ${stageLabel(after.stage)}.`;
  return { ok: true, stage: after?.stage ?? stage, note };
}

/** The lead page's stage buttons and Lost form. */
export const moveLeadForm = friendly(async function moveLeadForm(fd: FormData) {
  const id = str(fd, "id");
  const r = await moveLead(id, str(fd, "stage"), str(fd, "reason") || str(fd, "otherReason"));
  if (!r.ok) throw new Error(r.error);
  redirect(`/leads/${id}${r.note ? `?note=${encodeURIComponent(r.note)}` : ""}`);
});

/** A call, email, meeting or note in the lead's log. */
export const addLeadEntry = friendly(async function addLeadEntry(fd: FormData) {
  const user = await requireEdit("leads");
  const id = str(fd, "id");
  const text = str(fd, "text");
  if (!text) throw new Error("Type what happened");
  const kind = ["CALL", "EMAIL", "MEETING", "NOTE"].includes(str(fd, "kind")) ? str(fd, "kind") : "NOTE";
  await logLead(id, kind, text.slice(0, 4000), user.id);
  revalidate(id);
  redirect(`/leads/${id}#log`);
});

/** The next follow-up: a To-Do for whoever's doing it. */
export const setFollowUp = friendly(async function setFollowUp(fd: FormData) {
  const user = await requireEdit("leads");
  const id = str(fd, "id");
  const lead = await db.lead.findUniqueOrThrow({ where: { id } });
  const date = parseDateInput(fd.get("date"));
  if (!date) throw new Error("When?");
  const note = strOrNull(fd, "note");
  await addFollowUp(id, leadName(lead), date, note, strOrNull(fd, "assigneeId") ?? lead.ownerId ?? user.id, user.id);
  await logLead(id, "NOTE", `Follow-up set for ${fmtDate(date)}${note ? ` — ${note}` : ""}`, user.id);
  revalidate(id);
  redirect(`/leads/${id}`);
});

/** Done with a follow-up: what happened goes in the log, and it asks for the next one. */
export const completeFollowUp = friendly(async function completeFollowUp(fd: FormData) {
  const user = await requireEdit("leads");
  const id = str(fd, "id");
  const todo = await db.todo.findFirst({ where: { id: str(fd, "todoId"), leadId: id } });
  if (!todo) throw new Error("Follow-up not found");
  await db.todo.update({ where: { id: todo.id }, data: { status: "DONE", completedAt: new Date() } });
  const result = strOrNull(fd, "result");
  await logLead(id, str(fd, "kind") || "CALL", `${todo.title.replace(/^Follow up: [^—]*(— )?/, "") || "Followed up"}${result ? ` → ${result}` : ""}`, user.id);
  revalidate(id);
  redirect(`/leads/${id}?next=1#follow-up`);
});

/** The meeting: on the lead, and a To-Do on that day (so it's on the calendar). Moves an inquiry to Meeting. */
export const setMeeting = friendly(async function setMeeting(fd: FormData) {
  const user = await requireEdit("leads");
  const id = str(fd, "id");
  const lead = await db.lead.findUniqueOrThrow({ where: { id } });
  const day = parseDateInput(fd.get("date"));
  if (!day) throw new Error("What day?");
  const time = str(fd, "time");
  const [h, m] = time ? time.split(":").map(Number) : [12, 0];
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h || 0, m || 0);
  const when = time ? at.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";
  // One meeting at a time: the old one's reminder goes.
  await db.todo.deleteMany({ where: { leadId: id, status: { not: "DONE" }, title: { startsWith: "Meeting:" } } });
  await db.todo.create({
    data: {
      leadId: id,
      title: `Meeting: ${leadName(lead)}${when ? ` at ${when}` : ""}${lead.address ? ` · ${lead.address}` : ""}`,
      dueDate: at,
      assigneeId: lead.ownerId ?? user.id,
      createdById: user.id,
    },
  });
  await db.lead.update({ where: { id }, data: { meetingAt: at, ...(lead.stage === "INQUIRY" ? { stage: "MEETING", stageAt: new Date() } : {}) } });
  await logLead(id, "MEETING", `Meeting set for ${fmtDate(at)}${when ? ` at ${when}` : ""}`, user.id);
  revalidate(id);
  redirect(`/leads/${id}`);
});

/** Deletes a lead that never became a job (a job's lead goes when the job does). */
export const deleteLead = friendly(async function deleteLead(fd: FormData) {
  const user = await requireEdit("leads");
  const lead = await db.lead.findUnique({ where: { id: str(fd, "id") }, include: { project: { select: { isSpec: true } } } });
  if (!lead) redirect("/leads");
  // A spec house's lead can go (it isn't a sale); a client job's lead is marked lost instead.
  if (lead.projectId && !lead.project?.isSpec) throw new Error("This lead is a job — mark it lost instead");
  await db.lead.delete({ where: { id: lead.id } });
  await logActivity({ userId: user.id, type: "lead.deleted", description: `Deleted lead ${leadName(lead)}` });
  revalidate();
  redirect("/leads");
});

// --- Lead sources (Settings) ----------------------------------------------------------------

export const addLeadSource = friendly(async function addLeadSource(fd: FormData) {
  await requireEdit("leads");
  const name = str(fd, "name");
  if (name) {
    const last = await db.leadSource.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    await db.leadSource.create({ data: { name: name.slice(0, 80), sortOrder: (last?.sortOrder ?? -1) + 1 } });
  }
  revalidatePath("/settings/lead-sources");
  revalidate();
  redirect("/settings/lead-sources");
});

/** A new name changes it on every lead (and client) that has it. */
export const renameLeadSource = friendly(async function renameLeadSource(fd: FormData) {
  await requireEdit("leads");
  const src = await db.leadSource.findUnique({ where: { id: str(fd, "id") } });
  const name = str(fd, "name");
  if (src && name && name !== src.name) {
    await db.$transaction([
      db.leadSource.update({ where: { id: src.id }, data: { name } }),
      db.lead.updateMany({ where: { source: src.name }, data: { source: name } }),
      db.client.updateMany({ where: { source: src.name }, data: { source: name } }),
    ]);
  }
  revalidatePath("/settings/lead-sources");
  revalidate();
  redirect("/settings/lead-sources");
});

/** Leads that had it keep it. */
export const deleteLeadSource = friendly(async function deleteLeadSource(fd: FormData) {
  await requireEdit("leads");
  await db.leadSource.deleteMany({ where: { id: str(fd, "id") } });
  revalidatePath("/settings/lead-sources");
  redirect("/settings/lead-sources");
});

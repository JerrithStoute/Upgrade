import "server-only";
import { db } from "./db";
import { nextProjectNumber } from "./projects";
import { logActivity } from "./activity";
import { COMMON_SOURCES, stageFromJob, stageLabel } from "./leads-math";

/**
 * Leads & sales. A lead is someone who might hire you; it moves Inquiry → Meeting →
 * Estimate → Proposal sent → Won (or Lost). At Estimate it becomes a job, and from then on
 * the job moves it along — see `syncLeadStages`.
 */

const JOB_TYPE_NAME: Record<string, string> = { NEW_HOME: "New home", REMODEL: "Remodel", ADDITION: "Addition", COMMERCIAL: "Commercial", OTHER: "Project" };

export const leadName = (l: { firstName: string; lastName: string; company?: string | null }) => [l.firstName, l.lastName].filter(Boolean).join(" ") || l.company || "Lead";

/** Your lead sources first, then the common ones you haven't added. */
export async function sourceOptions() {
  const mine = await db.leadSource.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
  const have = new Set(mine.map((s) => s.name.trim().toLowerCase()));
  return [...mine.map((s) => s.name), ...COMMON_SOURCES.filter((c) => !have.has(c.toLowerCase()))];
}

/** A line in the lead's log. */
export async function logLead(leadId: string, kind: string, text: string, userId: string | null) {
  await db.leadEntry.create({ data: { leadId, kind, text, userId } });
}

/**
 * Brings leads up to date with their jobs (estimate sent → Proposal sent, contracted → Won),
 * and gives jobs started without a lead (still being sold) one — so the pipeline shows every
 * job you're trying to win. A lead you marked lost stays lost.
 */
export async function syncLeadStages() {
  // Spec houses aren't sales: a lead the program made for one (and nobody worked) goes; one
  // you worked stays, but doesn't follow the job (selling the house isn't winning a client).
  await db.lead.deleteMany({ where: { project: { isSpec: true }, entries: { none: { userId: { not: null } } }, todos: { none: {} } } });
  const [linked, orphans] = await Promise.all([
    db.lead.findMany({
      where: { projectId: { not: null }, stage: { not: "LOST" }, project: { isSpec: false } },
      include: { project: { select: { status: true, estimates: { select: { status: true } } } } },
    }),
    db.project.findMany({
      where: { status: { in: ["LEAD", "ESTIMATING", "PROPOSAL_SENT"] }, lead: null, isSpec: false, isTemplate: false },
      include: { client: true, estimates: { select: { status: true } } },
    }),
  ]);
  const now = new Date();
  for (const l of linked) {
    if (!l.project) continue;
    const next = stageFromJob(
      l.project.status,
      l.project.estimates.map((e) => e.status),
    );
    if (!next || next === l.stage) continue;
    await db.lead.update({ where: { id: l.id }, data: { stage: next, stageAt: now, ...(next === "WON" && !l.wonAt ? { wonAt: now } : {}) } });
    await logLead(l.id, "STAGE", `Moved to ${stageLabel(next)} (from the job)`, null);
  }
  for (const p of orphans) {
    const c = p.client;
    const stage =
      stageFromJob(
        p.status,
        p.estimates.map((e) => e.status),
      ) ?? "ESTIMATE";
    const lead = await db.lead.create({
      data: {
        firstName: c?.firstName ?? p.name,
        lastName: c?.lastName ?? "",
        company: c?.company ?? null,
        email: c?.email ?? null,
        phone: c?.phone ?? null,
        address: p.address,
        city: p.city,
        state: p.state,
        zip: p.zip,
        title: p.name,
        jobType: p.type,
        source: c?.source ?? null,
        stage,
        stageAt: p.createdAt,
        ownerId: p.managerId,
        clientId: p.clientId,
        projectId: p.id,
        createdAt: p.createdAt,
      },
    });
    await logLead(lead.id, "STAGE", `Added from job #${p.number} ${p.name}`, null);
  }
}

/**
 * Makes a lead a job: its client (the one it has, else a new one from the lead) and a
 * project being estimated, with everything you entered. Returns the project.
 */
export async function leadToJob(leadId: string, userId: string) {
  const lead = await db.lead.findUniqueOrThrow({ where: { id: leadId } });
  if (lead.projectId) return db.project.findUniqueOrThrow({ where: { id: lead.projectId } });
  const client =
    (lead.clientId ? await db.client.findUnique({ where: { id: lead.clientId } }) : null) ??
    (await db.client.create({
      data: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        address: lead.address,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        source: lead.source,
        notes: lead.notes,
      },
    }));
  const project = await db.project.create({
    data: {
      number: await nextProjectNumber(),
      name: lead.title || `${lead.lastName || lead.firstName} ${JOB_TYPE_NAME[lead.jobType] ?? "Project"}`.trim(),
      status: "ESTIMATING",
      type: lead.jobType,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
      description: lead.notes,
      clientId: client.id,
      managerId: lead.ownerId,
    },
  });
  await db.lead.update({ where: { id: lead.id }, data: { clientId: client.id, projectId: project.id } });
  await logActivity({ projectId: project.id, userId, type: "project.created", description: `Created project #${project.number} ${project.name} from a lead` });
  await logLead(lead.id, "STAGE", `Became job #${project.number}`, userId);
  return project;
}

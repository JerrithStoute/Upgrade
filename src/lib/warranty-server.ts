import "server-only";
import { db } from "./db";
import { appUrl } from "./mail";
import { sendCompanyMail, vendorContacts } from "./notify";
import { jobRecipients, tellClient } from "./notify-client";
import { notifyOn, teamRecipients } from "./notify-recipients";
import { saveUpload } from "./uploads";
import { fmtDate } from "./utils";
import { warrantyNo } from "./warranty";

/**
 * Warranty requests (warranty.ts has the rules): saving one, its photos, and who hears what.
 *
 * - The client reports one → the job's manager (else the admins) hear.
 * - You send a sub → the sub hears (their portal's Warranty page, or a plain email with no sign-in).
 *   You pick someone on your team → they hear.
 * - It's scheduled, done or not covered, or you write a note the client can see → the client hears.
 * - The sub sets a date, writes a note or marks it done → the team hears; the client hears the date and done.
 *
 * Same rule as every email here: one that can't be sent never stops the work.
 */

type Person = { id: string; name: string; email: string };

const PHOTO_MAX = 15 * 1024 * 1024;

/** The next W-number, across the company. */
async function nextNumber() {
  const last = await db.warrantyRequest.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
  return (last?.number ?? 0) + 1;
}

/** A new request — from the client's portal or the team. Its photos are saved with it. */
export async function createWarranty(input: {
  projectId: string;
  title: string;
  description: string | null;
  location: string | null;
  urgent: boolean;
  fromClient: boolean;
  by: { id: string };
  photos: File[];
}) {
  // Two at once can reach for the same number: the second tries the next one.
  for (let tries = 0; ; tries++) {
    try {
      const row = await db.warrantyRequest.create({
        data: {
          number: await nextNumber(),
          projectId: input.projectId,
          title: input.title,
          description: input.description,
          location: input.location,
          urgent: input.urgent,
          fromClient: input.fromClient,
          createdById: input.by.id,
        },
      });
      await saveWarrantyPhotos(row.id, input.projectId, input.photos, input.by.id);
      return row;
    } catch (e) {
      if (tries >= 3 || !(e instanceof Error && e.message.includes("Unique constraint"))) throw e;
    }
  }
}

/** Photos (or a PDF) on a request: in the job's Files, folder Warranty — seen by the client, the team, and the sub on it. */
export async function saveWarrantyPhotos(requestId: string, projectId: string, files: File[], uploadedById: string) {
  const names: string[] = [];
  for (const file of files.slice(0, 10)) {
    if (!file.size) continue;
    const meta = await saveUpload(file, projectId, PHOTO_MAX);
    await db.fileAsset.create({ data: { ...meta, projectId, warrantyRequestId: requestId, uploadedById, folder: "Warranty", clientVisible: true } });
    names.push(file.name);
  }
  return names;
}

/** The files picked in a form's `photos` input. */
export const photosFrom = (fd: FormData) => fd.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);

async function load(id: string) {
  return db.warrantyRequest.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, clientId: true, address: true, city: true, client: { select: { firstName: true, lastName: true, phone: true } } } },
      assignee: { select: { id: true, email: true } },
    },
  });
}

const place = (p: { address: string | null; city: string | null }) => [p.address, p.city].filter(Boolean).join(", ");

// --- to the team ------------------------------------------------------------------------

/** The client reported one (or the sub did something): the job's manager, whoever's on it, whoever added it. */
export async function emailWarrantyToTeam(id: string, what: { subject: string; lines: string[] }) {
  const w = await load(id);
  if (!w) return [];
  return sendCompanyMail(await jobRecipients("warrantyNews", w.projectId, { assignee: [w.assigneeId], creator: [w.fromClient ? null : w.createdById] }), {
    subject: `${w.project.name}: ${what.subject}`,
    heading: `${warrantyNo(w.number)}: ${w.title}`,
    lines: what.lines,
    button: { label: "Open the request", url: appUrl(`/projects/${w.projectId}/warranty/${w.id}`) },
    push: "WARRANTY",
  });
}

export async function emailWarrantyReported(id: string, clientName: string) {
  const w = await load(id);
  if (!w) return [];
  return emailWarrantyToTeam(id, {
    subject: `${w.urgent ? "URGENT warranty request" : "warranty request"} from ${clientName}`,
    lines: [
      `${clientName} reported something to fix at ${w.project.name}${w.location ? ` (${w.location})` : ""}.`,
      ...(w.urgent ? ["They marked it urgent."] : []),
      ...(w.description ? [w.description.length > 600 ? `${w.description.slice(0, 600)}…` : w.description] : []),
    ],
  });
}

/** Someone on the team was put on it. */
export async function emailWarrantyAssignee(id: string, sender: Person) {
  const w = await load(id);
  if (!w?.assignee || w.assignee.id === sender.id) return [];
  return sendCompanyMail(await teamRecipients("warrantyAssigned", { assignee: [w.assignee.id] }), {
    subject: `Warranty ${warrantyNo(w.number)} for ${w.project.name} is yours`,
    heading: `${warrantyNo(w.number)}: ${w.title}`,
    lines: [`${sender.name} put you on this warranty request at ${w.project.name}${w.location ? ` (${w.location})` : ""}.`, ...(w.description ? [w.description.slice(0, 600)] : [])],
    button: { label: "Open the request", url: appUrl(`/projects/${w.projectId}/warranty/${w.id}`) },
    replyTo: sender.email,
    push: "WARRANTY",
  });
}

// --- to the sub -------------------------------------------------------------------------

/** A sub was sent to fix it: where, what, and who to call. */
export async function emailWarrantyToVendor(id: string, sender: Person) {
  const w = await load(id);
  if (!w?.vendorId || !(await notifyOn("warrantyToSub"))) return [];
  const { emails, portal } = await vendorContacts(w.vendorId);
  if (!emails.length) return [];
  const client = w.project.client;
  return sendCompanyMail(emails, {
    subject: `Warranty work at ${w.project.name}: ${w.title}`,
    heading: `${warrantyNo(w.number)}: ${w.title}`,
    lines: [
      `${sender.name} is sending you to fix this at ${w.project.name}${place(w.project) ? `, ${place(w.project)}` : ""}${w.location ? ` (${w.location})` : ""}.`,
      ...(w.urgent ? ["It's urgent."] : []),
      ...(w.description ? [w.description.slice(0, 600)] : []),
      ...(client ? [`Homeowner: ${client.firstName} ${client.lastName}${client.phone ? ` · ${client.phone}` : ""}`] : []),
      ...(w.scheduledFor ? [`Scheduled for ${fmtDate(w.scheduledFor, "EEE, MMM d")}.`] : []),
    ],
    button: portal ? { label: "Open it", url: appUrl("/vendor/warranty") } : undefined,
    after: [portal ? "Sign in to see the photos, set the day you'll be there, and mark it done." : `Reply to this email with the day you can be there — it goes to ${sender.name}.`],
    replyTo: sender.email,
    push: "WARRANTY",
    customer: true,
  });
}

// --- to the client ----------------------------------------------------------------------

/** The client hears: it's scheduled, done, not covered — or a note from the team. */
export async function emailWarrantyToClient(id: string, sender: Person | null, what: "SCHEDULED" | "DONE" | "NOT_COVERED" | "NOTE", note?: string) {
  const w = await load(id);
  if (!w?.project.clientId) return [];
  const lines =
    what === "SCHEDULED"
      ? [`Someone will be there to fix it on ${fmtDate(w.scheduledFor, "EEEE, MMMM d")}.`]
      : what === "DONE"
        ? ["It's been taken care of.", ...(w.closeNote ? [w.closeNote] : [])]
        : what === "NOT_COVERED"
          ? ["This one isn't covered by your warranty.", ...(w.closeNote ? [w.closeNote] : [])]
          : [`${sender?.name ?? "Your builder"} wrote:`, (note ?? "").slice(0, 600)];
  const subject = {
    SCHEDULED: `Warranty: ${w.title} is scheduled`,
    DONE: `Warranty: ${w.title} is done`,
    NOT_COVERED: `Warranty: about ${w.title}`,
    NOTE: `Warranty: a note about ${w.title}`,
  }[what];
  return tellClient(w.project.clientId, sender, {
    subject,
    heading: `${warrantyNo(w.number)}: ${w.title}`,
    lines,
    label: "See your requests",
    path: `/portal/warranty?project=${w.projectId}`,
    where: "Warranty",
    push: "WARRANTY",
  });
}

import "server-only";
import { db, systemDb } from "./db";
import { hashToken, LINK_LIFE, randomToken } from "./account";
import { appUrl, type MailSection } from "./mail";
import { sendCompanyMail } from "./notify";
import { changeOrderTotals } from "./change-orders";
import { invoiceTotal } from "./finance";
import { fmtDate, money } from "./utils";

/**
 * Emails to and about the client: a proposal, change order or invoice sent to them, a message,
 * a reminder of selections coming due — and word back to the team when they answer.
 *
 * The same rules as the purchasing emails (notify.ts): from the company by name, a reply goes
 * to a real person, and an email that can't be sent never stops the work.
 *
 * A client who hasn't set up their portal sign-in yet gets the same email with a "set up your
 * sign-in" button instead (a fresh 7-day invitation), so the button always works for them.
 */

type Person = { id: string; name: string; email: string };

/** Where a client's email goes: the address on their page, and their portal sign-in's. */
export async function clientContacts(clientId: string | null | undefined) {
  if (!clientId) return { emails: [] as string[], portal: false, name: "", firstName: "" };
  const c = await db.client.findUnique({ where: { id: clientId }, select: { firstName: true, lastName: true, email: true, user: { select: { email: true, active: true } } } });
  if (!c) return { emails: [] as string[], portal: false, name: "", firstName: "" };
  const portal = !!c.user?.active;
  const emails = [...new Set([c.email ?? "", portal ? c.user!.email : ""].map((e) => e.trim().toLowerCase()).filter(Boolean))];
  return { emails, portal, name: `${c.firstName} ${c.lastName}`.trim(), firstName: c.firstName };
}

/**
 * A fresh portal invitation for a client with no sign-in yet — its link, not an email of its own.
 * Earlier links stay good (each lasts its 7 days): a client who gets three emails in a day can
 * click any of them. The first one used retires the rest.
 */
async function inviteLink(clientId: string, email: string, name: string, from: Person) {
  // An email signs in to one company: if it's already someone's login, there's no link to give.
  if (await systemDb.user.findUnique({ where: { email }, select: { id: true } })) return null;
  await db.invite.deleteMany({ where: { email, acceptedAt: null, expiresAt: { lt: new Date() } } });
  const token = randomToken();
  await db.invite.create({
    data: { kind: "CLIENT", email, name: name || null, role: "CLIENT", clientId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + LINK_LIFE.INVITE), invitedById: from.id },
  });
  return appUrl(`/invite?token=${token}`);
}

/** One email to the client about something waiting in their portal. Returns the addresses it reached. */
async function tellClient(
  clientId: string | null | undefined,
  from: Person | null,
  mail: { subject: string; heading: string; lines: string[]; sections?: MailSection[]; label: string; path: string; where: string },
) {
  const to = await clientContacts(clientId);
  if (!to.emails.length || !clientId) return [];
  let button: { label: string; url: string } | undefined = { label: mail.label, url: appUrl(mail.path) };
  let after: string[] = [];
  if (!to.portal) {
    const link = from ? await inviteLink(clientId, to.emails[0], to.name, from) : null;
    button = link ? { label: "Set up your sign-in", url: link } : undefined;
    after = link ? [`Choose a password, and you'll find it under ${mail.where}. The link works for 7 days.`] : [];
  }
  return sendCompanyMail(to.emails, { subject: mail.subject, heading: mail.heading, lines: mail.lines, sections: mail.sections, button, after, replyTo: from?.email });
}

const company = async () => (await db.company.findFirst({ select: { name: true } }))?.name ?? "Your builder";
const staff = (ids: (string | null | undefined)[]) =>
  db.user.findMany({ where: { id: { in: ids.filter((x): x is string => !!x) }, active: true, role: { in: ["ADMIN", "STAFF"] } }, select: { email: true } });
/** Who on the team hears about a job when nobody in particular sent the thing: its manager, else the admins. */
async function jobTeam(projectId: string, also: (string | null | undefined)[] = []) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { managerId: true } });
  const named = await staff([...also, project?.managerId]);
  if (named.length) return named.map((u) => u.email);
  return (await db.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } })).map((u) => u.email);
}

// --- to the client -------------------------------------------------------------------

export async function emailProposalToClient(estimateId: string, total: number, sender: Person) {
  const est = await db.estimate.findUnique({ where: { id: estimateId }, select: { id: true, project: { select: { name: true, clientId: true } } } });
  if (!est) return [];
  const brand = await company();
  return tellClient(est.project.clientId, sender, {
    subject: `Your proposal from ${brand}`,
    heading: `Proposal for ${est.project.name}`,
    lines: [`${sender.name} at ${brand} sent you a proposal for ${est.project.name}.`, `Total: ${money(total)}`, "You can read it, print it, and approve it online."],
    label: "Review the proposal",
    path: `/portal/proposals/${est.id}`,
    where: "Proposals",
  });
}

export async function emailChangeOrderToClient(coId: string, sender: Person) {
  const co = await db.changeOrder.findUnique({ where: { id: coId }, include: { items: true, project: { select: { name: true, clientId: true } } } });
  if (!co || !co.clientApproval) return [];
  const brand = await company();
  const days = co.scheduleImpactDays;
  return tellClient(co.project.clientId, sender, {
    subject: `Change order #${co.number} needs your approval`,
    heading: `Change order #${co.number}: ${co.title}`,
    lines: [
      `${sender.name} at ${brand} sent you a change order for ${co.project.name}.`,
      `Amount: ${money(changeOrderTotals(co, co.items).total)}${days ? ` · Schedule: ${days > 0 ? "+" : ""}${days} day${Math.abs(days) === 1 ? "" : "s"}` : ""}`,
    ],
    label: "Review and approve",
    path: `/portal/change-orders/${co.id}`,
    where: "Change Orders",
  });
}

export async function emailInvoiceToClient(invoiceId: string, sender: Person) {
  const inv = await db.invoice.findUnique({ where: { id: invoiceId }, include: { items: true, project: { select: { name: true, clientId: true } } } });
  if (!inv) return [];
  const brand = await company();
  return tellClient(inv.project.clientId, sender, {
    subject: `Invoice #${inv.number} from ${brand}`,
    heading: `Invoice #${inv.number}`,
    lines: [`${brand} sent you an invoice for ${inv.project.name}.`, `Amount: ${money(invoiceTotal(inv.items))}${inv.dueDate ? ` · Due ${fmtDate(inv.dueDate)}` : ""}`],
    label: "View the invoice",
    path: `/portal/invoices/${inv.id}`,
    where: "Invoices",
  });
}

/** The team wrote in a conversation the client can see. */
export async function emailMessageToClient(threadId: string, body: string, sender: Person) {
  const thread = await db.messageThread.findUnique({ where: { id: threadId }, select: { id: true, subject: true, clientVisible: true, projectId: true, project: { select: { name: true, clientId: true } } } });
  if (!thread?.clientVisible) return [];
  const brand = await company();
  return tellClient(thread.project.clientId, sender, {
    subject: `New message from ${brand}: ${thread.subject}`,
    heading: thread.subject,
    lines: [`${sender.name} wrote about ${thread.project.name}:`, body.length > 600 ? `${body.slice(0, 600)}…` : body],
    label: "Read and reply",
    path: `/portal/messages?project=${thread.projectId}&thread=${thread.id}`,
    where: "Messages",
  });
}

// --- back to the team -----------------------------------------------------------------

export async function emailProposalAnswered(estimateId: string) {
  const est = await db.estimate.findUnique({ where: { id: estimateId }, select: { id: true, name: true, status: true, sentById: true, signedBy: true, decisionNote: true, projectId: true, project: { select: { name: true } } } });
  if (!est || (est.status !== "APPROVED" && est.status !== "DECLINED")) return [];
  const word = est.status === "APPROVED" ? "approved" : "declined";
  return sendCompanyMail(await jobTeam(est.projectId, [est.sentById]), {
    subject: `${est.project.name}: proposal ${word}`,
    heading: `Proposal ${word}`,
    lines: [
      `${est.signedBy ?? "Your client"} ${word} the proposal "${est.name}" for ${est.project.name}.`,
      ...(est.decisionNote ? [`Their note: "${est.decisionNote}"`] : []),
      ...(est.status === "APPROVED" ? ["When you're ready, use it as the budget on the estimate."] : []),
    ],
    button: { label: "Open the estimate", url: appUrl(`/projects/${est.projectId}/estimate?estimate=${est.id}`) },
  });
}

export async function emailChangeOrderAnswered(coId: string) {
  const co = await db.changeOrder.findUnique({ where: { id: coId }, select: { id: true, number: true, title: true, status: true, sentById: true, decidedBy: true, decisionNote: true, clientApprovedAt: true, projectId: true, project: { select: { name: true } } } });
  if (!co) return [];
  const word = co.status === "DECLINED" ? "declined" : co.clientApprovedAt ? "approved" : null;
  if (!word) return [];
  return sendCompanyMail(await jobTeam(co.projectId, [co.sentById]), {
    subject: `${co.project.name}: change order #${co.number} ${word}`,
    heading: `Change order #${co.number} ${word}`,
    lines: [
      `${co.decidedBy ?? "Your client"} ${word} "${co.title}" for ${co.project.name}.`,
      ...(co.decisionNote ? [`Their note: "${co.decisionNote}"`] : []),
      ...(word === "approved" && co.status !== "APPROVED" ? ["It still needs your team's approval before it's final."] : []),
    ],
    button: { label: "Open the change order", url: appUrl(`/projects/${co.projectId}/change-orders/${co.id}`) },
  });
}

export async function emailSelectionChosen(selectionId: string) {
  const sel = await db.selection.findUnique({
    where: { id: selectionId },
    select: { title: true, status: true, chosenOptionId: true, options: { select: { id: true, name: true } }, projectId: true, project: { select: { name: true, client: { select: { firstName: true, lastName: true } } } } },
  });
  if (!sel) return [];
  const who = sel.project.client ? `${sel.project.client.firstName} ${sel.project.client.lastName}`.trim() : "Your client";
  const choice = sel.options.find((o) => o.id === sel.chosenOptionId)?.name;
  const what = sel.status === "DECLINED" ? "doesn't want this selection" : choice ? `chose "${choice}"` : sel.status === "PENDING" ? "cleared their choice" : "made a choice";
  return sendCompanyMail(await jobTeam(sel.projectId), {
    subject: `${sel.project.name}: ${sel.title} — ${choice ?? (sel.status === "DECLINED" ? "not wanted" : "choice changed")}`,
    heading: sel.title,
    lines: [`${who} ${what} for ${sel.title} on ${sel.project.name}.`],
    button: { label: "Open selections", url: appUrl(`/projects/${sel.projectId}/selections`) },
  });
}

/** The client wrote in a conversation. */
export async function emailMessageFromClient(threadId: string, body: string, clientName: string) {
  const thread = await db.messageThread.findUnique({ where: { id: threadId }, select: { id: true, subject: true, projectId: true, project: { select: { name: true } }, messages: { select: { authorId: true }, distinct: ["authorId"] } } });
  if (!thread) return [];
  // The job's manager, and anyone on the team already in the conversation.
  return sendCompanyMail(await jobTeam(thread.projectId, thread.messages.map((m) => m.authorId)), {
    subject: `${thread.project.name}: message from ${clientName}`,
    heading: thread.subject,
    lines: [`${clientName} wrote about ${thread.project.name}:`, body.length > 600 ? `${body.slice(0, 600)}…` : body],
    button: { label: "Read and reply", url: appUrl(`/projects/${thread.projectId}/messages?thread=${thread.id}`) },
  });
}

// --- the morning run: selections coming due ----------------------------------------------

/**
 * Which deadline email a selection is due today: 7 (a week out) or 0 (due today or just past) —
 * or null when it's already had that one, or isn't close. One long overdue with nothing on
 * record is left alone: old news.
 */
export function selectionStage(daysLeft: number, reminded: number | null): 7 | 0 | null {
  const stage = daysLeft <= 0 ? 0 : daysLeft <= 7 ? 7 : null;
  if (stage === null) return null;
  if (reminded !== null && reminded <= stage) return null;
  if (stage === 0 && reminded === null && daysLeft < -3) return null;
  return stage;
}

/** One email per client listing the selections waiting on them that are a week out or due. `now`: the company's wall date. */
export async function sendSelectionReminders(now: Date) {
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const horizon = new Date(dayStart.getTime() + 8 * 86400000);
  const waiting = await db.selection.findMany({
    where: { status: "PENDING", dueDate: { not: null, lt: horizon }, project: { status: { notIn: ["COMPLETED", "CANCELLED"] }, clientId: { not: null } } },
    orderBy: { dueDate: "asc" },
    select: { id: true, title: true, dueDate: true, clientReminded: true, projectId: true, project: { select: { name: true, clientId: true, managerId: true } } },
  });
  const byClient = new Map<string, { sel: (typeof waiting)[number]; stage: 7 | 0; daysLeft: number }[]>();
  for (const sel of waiting) {
    const due = sel.dueDate!;
    const daysLeft = Math.round((new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() - dayStart.getTime()) / 86400000);
    const stage = selectionStage(daysLeft, sel.clientReminded);
    if (stage === null) continue;
    const list = byClient.get(sel.project.clientId!) ?? [];
    list.push({ sel, stage, daysLeft });
    byClient.set(sel.project.clientId!, list);
  }
  let sent = 0;
  for (const [clientId, list] of byClient) {
    // Marked first, with or without an address to send to: no second try every hour.
    for (const x of list) await db.selection.update({ where: { id: x.sel.id }, data: { clientReminded: x.stage } });
    const manager = list[0].sel.project.managerId ? await db.user.findUnique({ where: { id: list[0].sel.project.managerId }, select: { id: true, name: true, email: true } }) : null;
    const jobs = [...new Set(list.map((x) => x.sel.project.name))];
    const reached = await tellClient(clientId, manager, {
      subject: list.some((x) => x.stage === 0) ? "Selections due for your project" : "Selections coming due for your project",
      heading: "Selections waiting on you",
      lines: [`These choices for ${jobs.join(" and ")} are due soon. Making them on time keeps your project on schedule.`],
      sections: [
        {
          title: "Waiting on your choice",
          items: list.map((x) => ({
            text: x.sel.title,
            note: `${jobs.length > 1 ? `${x.sel.project.name} · ` : ""}${x.daysLeft < 0 ? `was due ${fmtDate(x.sel.dueDate)}` : x.daysLeft === 0 ? "due today" : `due ${fmtDate(x.sel.dueDate)}`}`,
          })),
        },
      ],
      label: "Make your selections",
      path: `/portal/selections?project=${list[0].sel.projectId}`,
      where: "Selections",
    });
    sent += reached.length;
  }
  return sent;
}

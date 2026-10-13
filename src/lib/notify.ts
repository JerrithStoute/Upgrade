import "server-only";
import { db } from "./db";
import { appUrl, sendMail, simpleEmail, type MailSection } from "./mail";
import { coverageLabel, poTotal } from "./purchasing";
import { fmtDate, money } from "./utils";

/**
 * Emails the program sends as things happen in purchasing: a PO to its vendor, and word
 * back to the team when the vendor answers, bills it or uploads insurance.
 *
 * One rule for all of them: an email that can't be sent never stops the work — the PO is
 * still marked sent, the bill still uploaded. The failure goes in the server log.
 * They're "from" the company by name, and a reply goes to a real person.
 */

type Person = { name: string; email: string };

async function companyInfo() {
  const c = await db.company.findFirst({ select: { name: true, email: true } });
  return { name: c?.name ?? "Your builder", email: c?.email?.trim() || undefined };
}
const company = async () => (await companyInfo()).name;

/** The company's own email: its name on top and in the From line. Returns who it reached. */
export async function sendCompanyMail(
  to: string[],
  mail: { subject: string; heading: string; lines: string[]; sections?: MailSection[]; button?: { label: string; url: string }; after?: string[]; replyTo?: string },
) {
  // A reply goes to whoever sent it — else the company's own address, never our no-reply one.
  const { name: brand, email: office } = await companyInfo();
  const reached: string[] = [];
  for (const address of [...new Set(to.map((t) => t.trim().toLowerCase()).filter(Boolean))]) {
    try {
      await sendMail(simpleEmail({ ...mail, to: address, brand, fromName: `${brand} via The Builder Station`, replyTo: mail.replyTo ?? office }));
      reached.push(address);
    } catch (e) {
      console.error(`[email] "${mail.subject}" to ${address} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return reached;
}

/** Where a vendor's email goes: the address on their page, and anyone of theirs with a portal sign-in. */
export async function vendorContacts(vendorId: string | null) {
  if (!vendorId) return { emails: [] as string[], portal: false };
  const [vendor, users] = await Promise.all([
    db.vendor.findUnique({ where: { id: vendorId }, select: { email: true } }),
    db.user.findMany({ where: { vendorId, role: "VENDOR", active: true }, select: { email: true } }),
  ]);
  const emails = [...new Set([vendor?.email ?? "", ...users.map((u) => u.email)].map((e) => e.trim().toLowerCase()).filter(Boolean))];
  return { emails, portal: users.length > 0 };
}

const staff = (ids: (string | null | undefined)[]) =>
  db.user.findMany({ where: { id: { in: ids.filter((x): x is string => !!x) }, active: true, role: { in: ["ADMIN", "STAFF"] } }, select: { email: true } });

/** "Mark sent": the PO goes to the vendor. Returns the addresses it reached (none: no email on file). */
export async function emailPoToVendor(poId: string, sender: Person) {
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { lines: true, project: { select: { name: true } } } });
  if (!po) return [];
  const { emails, portal } = await vendorContacts(po.vendorId);
  if (!emails.length) return [];
  const brand = await company();
  return sendCompanyMail(emails, {
    subject: `Purchase order PO-${po.number} from ${brand}`,
    heading: `PO-${po.number}: ${po.title}`,
    lines: [
      `${sender.name} at ${brand} sent you a purchase order for ${po.project.name}.`,
      `Total: ${money(poTotal(po.lines))}${po.deliveryDate ? ` · Needed by ${fmtDate(po.deliveryDate)}` : ""}`,
    ],
    button: portal ? { label: "View and answer", url: appUrl(`/vendor/pos/${po.id}`) } : undefined,
    after: [portal ? "Sign in to accept or decline it, and to send your bill when the work is done." : `Reply to this email to accept it or with any questions — it goes to ${sender.name}.`],
    replyTo: sender.email,
  });
}

/** The vendor accepted or declined in their portal: whoever sent the PO hears. */
export async function emailPoAnswered(poId: string, by: string) {
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { project: { select: { id: true, name: true } } } });
  if (!po || (po.status !== "ACCEPTED" && po.status !== "DECLINED")) return [];
  const to = await staff([po.sentById ?? po.createdById]);
  const word = po.status === "ACCEPTED" ? "accepted" : "declined";
  return sendCompanyMail(
    to.map((u) => u.email),
    {
      subject: `${po.vendorName} ${word} PO-${po.number}`,
      heading: `PO-${po.number} ${word}`,
      lines: [`${by} at ${po.vendorName} ${word} "${po.title}" for ${po.project.name}.`, ...(po.responseNote ? [`Their note: "${po.responseNote}"`] : [])],
      button: { label: "Open the PO", url: appUrl(`/projects/${po.project.id}/purchasing/po/${po.id}`) },
    },
  );
}

/** The vendor uploaded a bill: whoever sent the PO and the job's manager hear. */
export async function emailBillUploaded(poId: string, amount: number) {
  const po = await db.purchaseOrder.findUnique({ where: { id: poId }, include: { project: { select: { id: true, name: true, managerId: true } } } });
  if (!po) return [];
  const to = await staff([po.sentById ?? po.createdById, po.project.managerId]);
  return sendCompanyMail(
    to.map((u) => u.email),
    {
      subject: `Bill from ${po.vendorName} for ${po.project.name}`,
      heading: `${po.vendorName} sent a bill`,
      lines: [`${money(amount)} on PO-${po.number} ("${po.title}") for ${po.project.name}.`, "It's waiting for approval."],
      button: { label: "Review the bill", url: appUrl(`/projects/${po.project.id}/purchasing/po/${po.id}`) },
    },
  );
}

/** The vendor uploaded an insurance certificate: the admins hear (it counts once confirmed). */
export async function emailInsuranceUploaded(vendorId: string, type: string, expiresAt: Date) {
  const [vendor, admins] = await Promise.all([
    db.vendor.findUnique({ where: { id: vendorId }, select: { name: true } }),
    db.user.findMany({ where: { role: "ADMIN", active: true }, select: { email: true } }),
  ]);
  if (!vendor) return [];
  return sendCompanyMail(
    admins.map((u) => u.email),
    {
      subject: `${vendor.name} uploaded an insurance certificate`,
      heading: "Insurance certificate to confirm",
      lines: [`${vendor.name} uploaded ${coverageLabel(type)}, good until ${fmtDate(expiresAt)}.`, "It counts once you've looked at it and confirmed it."],
      button: { label: "Open their page", url: appUrl(`/settings/vendors/${vendorId}`) },
    },
  );
}

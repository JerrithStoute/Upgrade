import { isLadderLine } from "./bid-ladder";
import { asSent } from "./bid-beams";
import type { Mail } from "./mail-layout";

/**
 * The email that asks a vendor for prices on a bid — sent from the program (bids/actions.ts), or opened
 * in your own email program. Its message is yours to change; the items go in the email itself too (so
 * it reads on a phone), and the bid's Excel file is attached (prices typed in it come back in by themselves).
 */

type Line = { key: string; name: string; quantity: number; unit: string; codeLabel: string };

/**
 * The subject and message a bid's email starts with. `from`: the company's name, address, phone · email.
 * `standard`: the company's own words for the middle (Company.bidMessage) — the greeting, the bid's note,
 * the job and the signature still go around them, filled in for each bid.
 */
export function bidEmailText(o: {
  bid: { number: number; notes: string | null; lines: Line[] };
  project: { number: number; name: string };
  address: string;
  contact: string | null;
  from: string[];
  standard?: string | null;
}): { subject: string; body: string } {
  const items = o.bid.lines.filter((l) => !isLadderLine(l));
  const ladder = o.bid.lines.length - items.length;
  const codes = Array.from(new Set(items.map((l) => l.codeLabel)));
  const middle = o.standard?.trim()
    ? [o.standard.trim()]
    : [
        `Please send us your prices for the list below — ${items.length} item${items.length === 1 ? "" : "s"} (${codes.join(", ")}).`,
        ...(ladder
          ? ["At the end there's a short price list of other lumber lengths — just a price per board, so we can order the lengths that cost least."]
          : []),
        "The quickest way is the Type your prices online button. Or fill in the Excel file or the PDF and send it back.",
      ];
  return {
    subject: `Request for prices — Job #${o.project.number} ${o.project.name} (Bid #${o.bid.number})`,
    body: [
      `Hello${o.contact ? ` ${o.contact.split(" ")[0]}` : ""},`,
      "",
      ...middle,
      ...(o.bid.notes ? ["", o.bid.notes] : []),
      "",
      `Job #${o.project.number} — ${o.project.name}`,
      ...(o.address ? [`Deliver to: ${o.address}`] : []),
      "",
      "Thank you,",
      ...o.from,
    ].join("\n"),
  };
}

/**
 * The subject and message a sub's bid email starts with: the trades, that the plans are on the page
 * linked below (not attached — a plan set is too big for email, and files from a new sender land in
 * fewer inboxes), and when it's due.
 */
export function subBidEmailText(o: {
  bid: { number: number; notes: string | null; lines: Line[]; dueAt: Date | null };
  project: { number: number; name: string };
  address: string;
  contact: string | null;
  from: string[];
  plans: number;
}): { subject: string; body: string } {
  const trades = Array.from(new Set(o.bid.lines.map((l) => l.codeLabel)));
  const due = o.bid.dueAt ? o.bid.dueAt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }) : null;
  return {
    subject: `Request for bid — ${trades.join(", ")} — Job #${o.project.number} ${o.project.name} (Bid #${o.bid.number})`,
    body: [
      `Hello${o.contact ? ` ${o.contact.split(" ")[0]}` : ""},`,
      "",
      `We'd like your bid for ${trades.join(", ")} on this job.`,
      o.plans
        ? "The plans are on the page the button below opens — look them over, then send your price there (or reply to this email with your quote)."
        : "Send your price on the page the button below opens — or reply to this email with your quote.",
      ...(due ? ["", `Please have it to us by ${due}.`] : []),
      ...(o.bid.notes ? ["", o.bid.notes] : []),
      "",
      `Job #${o.project.number} — ${o.project.name}`,
      ...(o.address ? [`Job address: ${o.address}`] : []),
      "",
      "Thank you,",
      ...o.from,
    ].join("\n"),
  };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/**
 * The email itself: the message as written, a button to type the prices online, then the items
 * (quantity, unit, item) — with the Excel file and the PDF attached, or (lighter, so it lands better
 * from a new sender) on the online page to download instead. From the company by name, through The
 * Builder Station's bids@ address (a real-looking sender, not "no-reply"); replies go to whoever sent
 * it, and `copyTo` gets a copy.
 */
export function bidEmail(o: {
  to: string;
  subject: string;
  body: string;
  companyName: string;
  replyTo: string | null;
  lines: Line[];
  attachments: { filename: string; content: Buffer }[];
  /** The link to type prices online (the bid's own page, no sign-in). */
  onlineUrl: string;
  /** The sender's own copy. */
  copyTo?: string | null;
  /** A sub's bid: the names of the plans on its page (no list of items — they price the trades). */
  plans?: string[] | null;
}): Mail {
  if (o.plans) return subBidEmail({ ...o, plans: o.plans });
  const items = o.lines.filter((l) => !isLadderLine(l));
  const files = o.attachments.map((a) => a.filename).join(" and ");
  const filesLine = files
    ? `Attached: ${files} — prices typed in the Excel file's yellow column come back in by themselves; the PDF is for writing them in by hand.`
    : "The Excel file and a PDF to print and fill in are on that page too, to download.";
  const text = [
    o.body,
    "",
    `Type your prices online (the quickest way): ${o.onlineUrl}`,
    "",
    "The list:",
    ...items.map((l) => {
      const sent = asSent({ ...l, unitPrice: null });
      return `  ${qty(sent.quantity)} ${sent.unit}  ${l.name}`;
    }),
    "",
    filesLine,
  ].join("\n");
  const paragraphs = o.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#334155">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  const rows = items
    .map((l) => {
      const sent = asSent({ ...l, unitPrice: null });
      return `<tr><td style="padding:6px 10px 6px 0;border-top:1px solid #e2e8f0;text-align:right;white-space:nowrap">${esc(qty(sent.quantity))}</td><td style="padding:6px 10px 6px 0;border-top:1px solid #e2e8f0;color:#64748b">${esc(sent.unit)}</td><td style="padding:6px 0;border-top:1px solid #e2e8f0">${esc(l.name)}</td></tr>`;
    })
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
<div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
<p style="margin:0 0 18px;font-size:13px;font-weight:600;color:#64748b">${esc(o.companyName)}</p>
${paragraphs}
<p style="margin:22px 0 4px"><a href="${esc(o.onlineUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:8px">Type your prices online</a></p>
<p style="margin:0 0 14px;font-size:12px;color:#94a3b8">The quickest way — or fill in the ${files ? "attached " : ""}Excel file or PDF and send it back.</p>
<p style="margin:20px 0 6px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b">The list (${items.length} item${items.length === 1 ? "" : "s"})</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;color:#0f172a">${rows}</table>
<p style="margin:18px 0 0;font-size:13px;color:#64748b">${esc(filesLine)}</p>
</div></body></html>`;
  return {
    to: o.to,
    subject: o.subject,
    text,
    html,
    // (Like every email the program sends for a company: its name, through The Builder Station.)
    fromName: `${o.companyName} via The Builder Station`,
    fromLocal: "bids",
    replyTo: o.replyTo ?? undefined,
    bcc: o.copyTo && o.copyTo.toLowerCase() !== o.to.toLowerCase() ? [o.copyTo] : undefined,
    attachments: o.attachments.length ? o.attachments.map((a) => ({ filename: a.filename, content: a.content.toString("base64") })) : undefined,
  };
}

/** A sub's bid email: the message, a button to see the plans and send their bid, and the plans' names. */
function subBidEmail(o: Parameters<typeof bidEmail>[0] & { plans: string[] }): Mail {
  const label = o.plans.length ? "See the plans and send your bid" : "Send your bid";
  const text = [
    o.body,
    "",
    `${label}: ${o.onlineUrl}`,
    ...(o.plans.length ? ["", `The plans (${o.plans.length}):`, ...o.plans.map((p) => `  ${p}`)] : []),
  ].join("\n");
  const paragraphs = o.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#334155">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  const plans = o.plans.map((p) => `<li style="margin:0 0 4px">${esc(p)}</li>`).join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
<div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
<p style="margin:0 0 18px;font-size:13px;font-weight:600;color:#64748b">${esc(o.companyName)}</p>
${paragraphs}
<p style="margin:22px 0 14px"><a href="${esc(o.onlineUrl)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:8px">${label}</a></p>
${plans ? `<p style="margin:20px 0 6px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b">The plans (${o.plans.length})</p><ul style="margin:0;padding-left:18px;font-size:14px;color:#0f172a">${plans}</ul>` : ""}
</div></body></html>`;
  return {
    to: o.to,
    subject: o.subject,
    text,
    html,
    fromName: `${o.companyName} via The Builder Station`,
    fromLocal: "bids",
    replyTo: o.replyTo ?? undefined,
    bcc: o.copyTo && o.copyTo.toLowerCase() !== o.to.toLowerCase() ? [o.copyTo] : undefined,
  };
}

/** The name a bid's files go by (the downloads, and the email's attachments), with its extension. */
export function bidFileName(bid: { number: number; vendorName: string }, project: { number: number }, ext: "xlsx" | "pdf" = "xlsx") {
  return `${`Bid ${bid.number} - ${bid.vendorName} - Job ${project.number}`.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 80)}.${ext}`;
}

/** Bids already emailed, by number — read back from the job's activity ("Emailed bid #3 (…) to …"). */
export function emailedBids(activity: { description: string; createdAt: Date }[]) {
  const out = new Map<number, { to: string; at: Date }>();
  for (const a of activity) {
    const m = /^Emailed bid #(\d+) \(.*\) to (\S+)$/.exec(a.description);
    if (m && !out.has(Number(m[1]))) out.set(Number(m[1]), { to: m[2], at: a.createdAt });
  }
  return out;
}

/**
 * Your words out of a bid email as you left it — "Use as my standard message": what's between the
 * greeting ("Hello Pat,") and the job line ("Job #…"), without the bid's own note (that's per bid).
 */
export function standardFromBody(body: string, bidNote: string | null) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  let start = 0;
  if (/^\s*(hello|hi|hey|good (morning|afternoon))\b/i.test(lines[0] ?? "")) start = 1;
  let end = lines.findIndex((l, i) => i >= start && /^\s*Job #\d+/.test(l));
  if (end < 0) end = lines.length;
  let middle = lines.slice(start, end).join("\n");
  if (bidNote?.trim()) middle = middle.replace(bidNote.trim(), "");
  return middle.replace(/\n{3,}/g, "\n\n").trim();
}

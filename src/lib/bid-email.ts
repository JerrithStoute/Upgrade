import { isLadderLine } from "./bids";
import type { Mail } from "./mail-layout";

/**
 * The email that asks a vendor for prices on a bid — sent from the program (bids/actions.ts), or opened
 * in your own email program. Its message is yours to change; the items go in the email itself too (so
 * it reads on a phone), and the bid's Excel file is attached (prices typed in it come back in by themselves).
 */

type Line = { key: string; name: string; quantity: number; unit: string; codeLabel: string };

/** The subject and message a bid's email starts with. `from`: the company's name, address, phone · email. */
export function bidEmailText(o: {
  bid: { number: number; notes: string | null; lines: Line[] };
  project: { number: number; name: string };
  address: string;
  contact: string | null;
  from: string[];
}): { subject: string; body: string } {
  const items = o.bid.lines.filter((l) => !isLadderLine(l));
  const ladder = o.bid.lines.length - items.length;
  const codes = Array.from(new Set(items.map((l) => l.codeLabel)));
  return {
    subject: `Request for prices — Job #${o.project.number} ${o.project.name} (Bid #${o.bid.number})`,
    body: [
      `Hello${o.contact ? ` ${o.contact.split(" ")[0]}` : ""},`,
      "",
      `Please send us your prices for the attached list — ${items.length} item${items.length === 1 ? "" : "s"} (${codes.join(", ")}).`,
      ...(ladder ? ["At the end there's a short price list of other lumber lengths — just a price per board, so we can order the lengths that cost least."] : []),
      "Just fill in your price per unit (the yellow column in the Excel file) and send it back.",
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

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const qty = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));

/**
 * The email itself: the message as written, then the items (quantity, unit, item), with the Excel file
 * attached. From the company by name (our address, so it gets delivered); replies go to whoever sent it.
 */
export function bidEmail(o: {
  to: string;
  subject: string;
  body: string;
  companyName: string;
  replyTo: string | null;
  lines: Line[];
  attachment: { filename: string; content: Buffer };
}): Mail {
  const items = o.lines.filter((l) => !isLadderLine(l));
  const text = [o.body, "", "The list:", ...items.map((l) => `  ${qty(l.quantity)} ${l.unit}  ${l.name}`), "", `Attached: ${o.attachment.filename}`].join("\n");
  const paragraphs = o.body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#334155">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
  const rows = items
    .map(
      (l) =>
        `<tr><td style="padding:6px 10px 6px 0;border-top:1px solid #e2e8f0;text-align:right;white-space:nowrap">${esc(qty(l.quantity))}</td><td style="padding:6px 10px 6px 0;border-top:1px solid #e2e8f0;color:#64748b">${esc(l.unit)}</td><td style="padding:6px 0;border-top:1px solid #e2e8f0">${esc(l.name)}</td></tr>`,
    )
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
<div style="max-width:620px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
<p style="margin:0 0 18px;font-size:13px;font-weight:600;color:#64748b">${esc(o.companyName)}</p>
${paragraphs}
<p style="margin:20px 0 6px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b">The list (${items.length} item${items.length === 1 ? "" : "s"})</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;font-size:14px;color:#0f172a">${rows}</table>
<p style="margin:18px 0 0;font-size:13px;color:#64748b">Attached: ${esc(o.attachment.filename)} — type your prices in the yellow column and send it back.</p>
</div></body></html>`;
  return {
    to: o.to,
    subject: o.subject,
    text,
    html,
    fromName: o.companyName,
    replyTo: o.replyTo ?? undefined,
    attachments: [{ filename: o.attachment.filename, content: o.attachment.content.toString("base64") }],
  };
}

/** The name a bid's Excel file goes by (the download, and the email's attachment). */
export function bidFileName(bid: { number: number; vendorName: string }, project: { number: number }) {
  return `${`Bid ${bid.number} - ${bid.vendorName} - Job ${project.number}`.replace(/[\/:*?"<>|]+/g, "-").slice(0, 80)}.xlsx`;
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

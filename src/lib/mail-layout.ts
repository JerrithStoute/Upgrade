/** How an email is put together — no sending here (see mail.ts), so it can be tested. */

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Who it's from, by name ("JT&I Custom Homes via The Builder Station") — the address stays ours. */
  fromName?: string;
  /** Where a reply goes (the person who sent it), instead of our no-reply address. */
  replyTo?: string;
  /** Files sent with it (a bid's Excel file): the file's name, and its contents in base64. */
  attachments?: { filename: string; content: string }[];
};

const DEFAULT_FROM = "The Builder Station <no-reply@thebuilderstation.com>";
/** MAIL_FROM with another name in front of its address. */
export function fromLine(fromName: string | undefined, base = process.env.MAIL_FROM || DEFAULT_FROM) {
  if (!fromName) return base;
  const address = /<([^>]+)>/.exec(base)?.[1] ?? base.trim();
  return `${fromName.replace(/[<>"\r\n]/g, "").trim()} <${address}>`;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export type MailSection = { title: string; items: { text: string; note?: string; url?: string }[] };

/**
 * A plain, friendly email: heading, a few lines, one button — and, for a list of things
 * (the morning email), sections of linked lines. Text and HTML versions.
 * `brand` is the name at the top (a company's own emails carry its name).
 */
export function simpleEmail(opts: {
  to: string;
  subject: string;
  heading: string;
  lines: string[];
  sections?: MailSection[];
  button?: { label: string; url: string };
  after?: string[];
  brand?: string;
  fromName?: string;
  replyTo?: string;
}): Mail {
  const { heading, lines, sections = [], button, after = [], brand = "The Builder Station" } = opts;
  const text = [
    heading,
    "",
    ...lines,
    ...sections.flatMap((sec) => ["", sec.title, ...sec.items.map((i) => `  - ${i.text}${i.note ? ` (${i.note})` : ""}${i.url ? `\n    ${i.url}` : ""}`)]),
    ...(button ? ["", `${button.label}: ${button.url}`] : []),
    ...(after.length ? ["", ...after] : []),
    "",
    `— ${brand}`,
  ].join("\n");
  const p = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#334155">${esc(s)}</p>`;
  const section = (sec: MailSection) =>
    `<p style="margin:20px 0 6px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#64748b">${esc(sec.title)}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">${sec.items
      .map(
        (i) =>
          `<tr><td style="padding:8px 0;border-top:1px solid #e2e8f0;font-size:15px;line-height:1.4;color:#0f172a">${
            i.url ? `<a href="${esc(i.url)}" style="color:#1d4ed8;text-decoration:none">${esc(i.text)}</a>` : esc(i.text)
          }${i.note ? `<br><span style="font-size:13px;color:#64748b">${esc(i.note)}</span>` : ""}</td></tr>`,
      )
      .join("")}</table>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
<div style="max-width:520px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
<p style="margin:0 0 18px;font-size:13px;font-weight:600;color:#64748b">${esc(brand)}</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${esc(heading)}</h1>
${lines.map(p).join("\n")}
${sections.map(section).join("\n")}
${button ? `<p style="margin:22px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:8px">${esc(button.label)}</a></p><p style="margin:0 0 14px;font-size:12px;color:#94a3b8;word-break:break-all">Or paste this into your browser: ${esc(button.url)}</p>` : ""}
${after.map(p).join("\n")}
</div></body></html>`;
  return { to: opts.to, subject: opts.subject, text, html, fromName: opts.fromName, replyTo: opts.replyTo };
}

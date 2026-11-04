import { randomBytes } from "crypto";

/**
 * An email written out the way mail servers take it (MIME) — for sending through someone's own
 * mailbox (mailbox.ts), where we hand over the whole message ourselves. Text and HTML versions,
 * files attached. Kept apart from the sending so it can be tested.
 */

export type MimeMail = {
  from: { name?: string; email: string };
  to: string;
  bcc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
  attachments?: { filename: string; content: string }[];
};

/** Base64 in lines of 76, as mail wants it. */
const b64 = (s: string | Buffer) => (Buffer.isBuffer(s) ? s : Buffer.from(s, "utf8")).toString("base64").replace(/.{76}(?=.)/g, "$&\r\n");

/** A header value: plain when it's plain ASCII, else UTF-8 encoded ("Café" → =?UTF-8?B?…?=). */
export function headerWord(s: string) {
  const clean = s.replace(/[\r\n]+/g, " ").trim();
  return /^[\x20-\x7e]*$/.test(clean) ? clean : `=?UTF-8?B?${Buffer.from(clean, "utf8").toString("base64")}?=`;
}

/** "JT&I Custom Homes <jerrith@gmail.com>" — the name quoted (or encoded), never able to break the line. */
export function addressLine(a: { name?: string; email: string }) {
  const email = a.email.replace(/[\s<>"]/g, "");
  const name = a.name?.replace(/[<>"\\\r\n]/g, "").trim();
  if (!name) return email;
  return /^[\x20-\x7e]*$/.test(name) ? `"${name}" <${email}>` : `${headerWord(name)} <${email}>`;
}

const fileName = (name: string) => name.replace(/["\\\r\n]/g, "_");

export function buildMime(m: MimeMail, boundary = randomBytes(12).toString("hex")): string {
  const alt = `alt_${boundary}`;
  const mixed = `mix_${boundary}`;
  const files = m.attachments ?? [];
  const headers = [
    `From: ${addressLine(m.from)}`,
    `To: ${m.to.replace(/[\r\n]/g, "")}`,
    ...(m.bcc?.length ? [`Bcc: ${m.bcc.map((b) => b.replace(/[\r\n]/g, "")).join(", ")}`] : []),
    ...(m.replyTo ? [`Reply-To: ${m.replyTo.replace(/[\r\n]/g, "")}`] : []),
    `Subject: ${headerWord(m.subject)}`,
    "MIME-Version: 1.0",
  ];
  const body = [
    `--${alt}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(m.text),
    `--${alt}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(m.html),
    `--${alt}--`,
  ];
  if (!files.length) return [...headers, `Content-Type: multipart/alternative; boundary="${alt}"`, "", ...body, ""].join("\r\n");
  return [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    ...body,
    ...files.flatMap((f) => [
      `--${mixed}`,
      `Content-Type: application/octet-stream; name="${fileName(f.filename)}"`,
      `Content-Disposition: attachment; filename="${fileName(f.filename)}"`,
      "Content-Transfer-Encoding: base64",
      "",
      // (Attachments come in base64 already — just put in lines.)
      f.content.replace(/\s+/g, "").replace(/.{76}(?=.)/g, "$&\r\n"),
    ]),
    `--${mixed}--`,
    "",
  ].join("\r\n");
}

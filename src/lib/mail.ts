import "server-only";
import path from "path";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";

/**
 * Email. Where it goes depends on MAIL:
 *   outbox (default on this PC)  saved to ./.outbox — read them at /dev/outbox; nothing is sent
 *   resend (online)              sent through Resend (RESEND_API_KEY, from MAIL_FROM)
 * Links in emails point at APP_URL (e.g. https://thebuilderstation.com).
 */

export type Mail = { to: string; subject: string; text: string; html: string };

const mode = () => (process.env.MAIL || (process.env.NODE_ENV === "production" ? "resend" : "outbox")).toLowerCase();
const outboxDir = () => path.join(process.cwd(), ".outbox");

export function appUrl(pathname: string) {
  return new URL(pathname, process.env.APP_URL || "http://localhost:3000").toString();
}

export async function sendMail(mail: Mail) {
  if (mode() === "outbox") {
    await fs.mkdir(outboxDir(), { recursive: true });
    const id = `${Date.now()}-${randomUUID().slice(0, 8)}`;
    await fs.writeFile(path.join(outboxDir(), `${id}.json`), JSON.stringify({ id, at: new Date().toISOString(), ...mail }, null, 2));
    return;
  }
  if (mode() === "resend") {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("Email isn't set up (RESEND_API_KEY)");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.MAIL_FROM || "The Builder Station <no-reply@thebuilderstation.com>", to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text }),
    });
    if (!res.ok) throw new Error(`Couldn't send the email (${res.status})`);
    return;
  }
  throw new Error(`Unknown MAIL setting "${mode()}"`);
}

/** The test inbox (this PC only). */
export async function outbox(): Promise<(Mail & { id: string; at: string })[]> {
  if (mode() !== "outbox") return [];
  let names: string[] = [];
  try {
    names = (await fs.readdir(outboxDir())).filter((f) => f.endsWith(".json"));
  } catch {
    return [];
  }
  const all = await Promise.all(names.map(async (n) => JSON.parse(await fs.readFile(path.join(outboxDir(), n), "utf8"))));
  return all.sort((a, b) => b.at.localeCompare(a.at));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** A plain, friendly email: heading, a few lines, one button. Text and HTML versions. */
export function simpleEmail(opts: { to: string; subject: string; heading: string; lines: string[]; button?: { label: string; url: string }; after?: string[] }): Mail {
  const { heading, lines, button, after = [] } = opts;
  const text = [heading, "", ...lines, ...(button ? ["", `${button.label}: ${button.url}`] : []), ...(after.length ? ["", ...after] : []), "", "— The Builder Station"].join("\n");
  const p = (s: string) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.5;color:#334155">${esc(s)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif">
<div style="max-width:520px;margin:24px auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:28px">
<p style="margin:0 0 18px;font-size:13px;font-weight:600;color:#64748b">The Builder Station</p>
<h1 style="margin:0 0 16px;font-size:20px;color:#0f172a">${esc(heading)}</h1>
${lines.map(p).join("\n")}
${button ? `<p style="margin:22px 0"><a href="${esc(button.url)}" style="display:inline-block;background:#1d4ed8;color:#fff;text-decoration:none;font-weight:600;padding:11px 18px;border-radius:8px">${esc(button.label)}</a></p><p style="margin:0 0 14px;font-size:12px;color:#94a3b8;word-break:break-all">Or paste this into your browser: ${esc(button.url)}</p>` : ""}
${after.map(p).join("\n")}
</div></body></html>`;
  return { to: opts.to, subject: opts.subject, text, html };
}

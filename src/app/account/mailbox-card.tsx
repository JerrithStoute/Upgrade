import { AtSign, Mail } from "lucide-react";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/utils";
import { PROVIDERS, providerOf } from "@/lib/mailbox";
import { disconnectMailbox, sendMailboxTest } from "./mailbox-actions";

const SAID: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Connected. Send a test to check it." },
  tested: { ok: true, text: "Test sent. Look for it in your inbox and your Sent folder." },
  disconnected: { ok: true, text: "Disconnected. Emails go from the program again." },
  denied: { ok: false, text: "Permission wasn't given, so nothing was connected." },
  "no-send-gmail": { ok: false, text: "The “Send email on your behalf” box was left unticked at Google. Connect again and leave it ticked." },
  "no-send-outlook": { ok: false, text: "Microsoft wasn't allowed to let the program send email for you. Connect again and accept." },
  "needs-admin": { ok: false, text: "Your company's Microsoft 365 only lets its IT person allow apps. Ask them to approve The Builder Station, then connect again." },
  expired: { ok: false, text: "That took too long. Click Connect again." },
  failed: { ok: false, text: "Couldn't connect. Try again in a minute." },
  "test-failed": { ok: false, text: "The test didn't go out. Reconnect and try again." },
  "not-set-up-gmail": { ok: false, text: "Gmail isn't set up on this server yet (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET)." },
  "not-set-up-outlook": { ok: false, text: "Outlook isn't set up on this server yet (MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET)." },
  "not-allowed": { ok: false, text: "Only your team can connect an email." },
};

const btn = "inline-flex h-7 items-center rounded-md border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50";
const primary = "inline-flex h-7 items-center rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800";

/** Your account → My email: send from your own Gmail or Outlook (mailbox.ts). Other email comes later. */
export async function MailboxCard({ userId, email, company, said }: { userId: string; email: string; company: string; said?: string }) {
  const box = await db.mailbox.findUnique({ where: { userId }, select: { provider: true, email: true, brokenAt: true, problem: true, lastSentAt: true } });
  const note = said ? SAID[said] : undefined;
  const p = box ? providerOf(box.provider) : null;
  const connect = (key: string) => `/api/mailbox/${PROVIDERS[key].route}/connect`;
  return (
    <section id="email" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <AtSign className="h-4 w-4 text-slate-400" /> My email
          </h2>
          <p className="text-xs text-slate-500">Emails you send go out from your own address.</p>
        </div>
        {box && !box.brokenAt ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Connected</span> : null}
      </div>
      {note ? <p className={`px-5 py-2 text-sm ${note.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{note.text}</p> : null}

      {box ? (
        <>
          {box.brokenAt ? (
            <div className="flex flex-wrap items-center gap-3 bg-amber-50 px-5 py-2.5 text-sm text-amber-800">
              <span className="flex-1">{p?.label} needs reconnecting. Until then your emails go from The Builder Station instead.</span>
              <a href={connect(box.provider)} className={primary}>
                Reconnect
              </a>
            </div>
          ) : null}
          <dl className="divide-y divide-slate-100 px-5 text-sm">
            <Row label="Sends from">
              {box.email} <span className="text-slate-500">· {p?.label}</span>
            </Row>
            <Row label="Used for">Bids, POs, and emails to clients and subs you send</Row>
            <Row label="Sent folder">Copies land in your {p?.label} {box.provider === "outlook" ? "Sent Items" : "Sent"}{box.lastSentAt ? ` · last sent ${fmtDateTime(box.lastSentAt)}` : ""}</Row>
          </dl>
          <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-2.5">
            <form action={sendMailboxTest}>
              <button type="submit" className={btn}>
                Send a test
              </button>
            </form>
            <form action={disconnectMailbox}>
              <button type="submit" className={btn}>
                Disconnect
              </button>
            </form>
          </div>
        </>
      ) : (
        <>
          <ul className="divide-y divide-slate-100 text-sm">
            <Choice icon={<Mail className="h-4 w-4 text-rose-600" />} name="Gmail" about="Gmail or Google Workspace">
              <a href={connect("gmail")} className={primary}>
                Connect Gmail
              </a>
            </Choice>
            <Choice icon={<Mail className="h-4 w-4 text-blue-600" />} name="Outlook" about="Outlook, Hotmail, Microsoft 365, GoDaddy">
              <a href={connect("outlook")} className={btn}>
                Connect Outlook
              </a>
            </Choice>
            <Choice icon={<Mail className="h-4 w-4 text-slate-400" />} name="Other email" about="Yahoo, iCloud, Comcast, your web host…">
              <span className="text-xs text-slate-400">Coming soon</span>
            </Choice>
          </ul>
          <p className="border-t border-slate-100 bg-slate-50 px-5 py-2 text-xs text-slate-500">
            Not connected: emails go from The Builder Station with {company} on them, and replies come to {email}.
          </p>
        </>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3 py-2">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-slate-800">{children}</dd>
    </div>
  );
}

function Choice({ icon, name, about, children }: { icon: React.ReactNode; name: string; about: string; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-slate-800">{name}</span>
        <span className="block truncate text-xs text-slate-500">{about}</span>
      </span>
      {children}
    </li>
  );
}

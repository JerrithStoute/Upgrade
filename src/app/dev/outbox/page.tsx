import Link from "next/link";
import { notFound } from "next/navigation";
import { outbox } from "@/lib/mail";

export const metadata = { title: "Test inbox" };
export const dynamic = "force-dynamic";

/**
 * The test inbox (this PC only): every email the program would have sent — sign-up
 * confirmations, password resets, invitations — so the links can be tried without a
 * real mail service. Not available online.
 */
export default async function OutboxPage({ searchParams }: { searchParams: Promise<{ id?: string; to?: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { id, to } = await searchParams;
  const all = (await outbox()).filter((m) => !to || m.to === to);
  const open = all.find((m) => m.id === id) ?? all[0];
  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="text-xl font-semibold text-slate-900">Test inbox</h1>
        <p className="mb-4 text-sm text-slate-500">Emails the program would have sent. Nothing leaves this computer — click the links to try them.</p>
        {all.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">No emails yet.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[18rem_1fr]">
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white">
              {all.slice(0, 50).map((m) => (
                <li key={m.id}>
                  <Link href={`/dev/outbox?id=${m.id}${to ? `&to=${encodeURIComponent(to)}` : ""}`} className={`block px-3 py-2 text-sm ${m.id === open?.id ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                    <span className="block truncate font-medium text-slate-900">{m.subject}</span>
                    <span className="block truncate text-xs text-slate-500">
                      {m.to} · {new Date(m.at).toLocaleString()}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {open ? (
              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <div className="border-b border-slate-100 px-4 py-2 text-sm">
                  <p>
                    <span className="text-slate-500">To:</span> {open.to}
                  </p>
                  <p>
                    <span className="text-slate-500">Subject:</span> <span className="font-medium">{open.subject}</span>
                  </p>
                </div>
                <iframe title="Email" srcDoc={open.html} sandbox="allow-popups allow-top-navigation-by-user-activation" className="h-[520px] w-full" />
              </div>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

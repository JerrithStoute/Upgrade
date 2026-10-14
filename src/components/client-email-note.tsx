import Link from "@/components/link";
import { clientContacts } from "@/lib/notify-client";

/**
 * Under a Send button: who it emails — or that it won't, with the way to fix that.
 * The same line wherever something is sent to the client (proposal, change order, invoice).
 */
export async function ClientEmailNote({ clientId, button, className }: { clientId: string | null; button: string; className?: string }) {
  const to = await clientContacts(clientId);
  return (
    <span className={className ?? "mt-0.5 block text-xs text-slate-500"}>
      {to.emails.length ? (
        <>
          {button} emails it to <span className="font-medium text-slate-700">{to.emails.join(", ")}</span>
          {to.portal ? "." : ", with a link to set up their sign-in."}
        </>
      ) : clientId ? (
        <>
          <span className="font-medium text-amber-700">No email address for {to.name || "this client"}</span> — {button.toLowerCase()} won&apos;t email it.{" "}
          <Link href={`/clients/${clientId}`} className="font-medium text-blue-700 hover:underline">
            Add their email
          </Link>
        </>
      ) : (
        <>
          <span className="font-medium text-amber-700">This job has no client</span> — {button.toLowerCase()} won&apos;t email it.
        </>
      )}
    </span>
  );
}

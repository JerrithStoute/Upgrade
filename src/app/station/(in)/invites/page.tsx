import { systemDb } from "@/lib/db";
import Link from "@/components/link";
import { readInviteRequest, INVITE_DAYS } from "@/lib/builder-invites";
import { requireStation } from "@/lib/station-auth";
import { siteIsLive } from "@/lib/site";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";
import { InviteBuilderForm } from "./invite-form";

export const metadata = { title: "Invite a builder" };

/** The Station's Invites: invite builders (sign-up is invite-only for now), and the website's requests. */
export default async function InvitesPage({ searchParams }: { searchParams: Promise<{ email?: string; name?: string; company?: string }> }) {
  await requireStation();
  const fill = await searchParams;
  const pick = { id: true, description: true, createdAt: true, stationUser: { select: { name: true } } } as const;
  const [sent, requests] = await Promise.all([
    systemDb.stationLog.findMany({ where: { type: "invite.sent" }, orderBy: { createdAt: "desc" }, take: 50, select: pick }),
    // From the website's "Request an invite" (src/app/site/actions.ts).
    systemDb.stationLog.findMany({ where: { type: "invite.requested" }, orderBy: { createdAt: "desc" }, take: 50, select: pick }),
  ]);
  const invited = new Set(sent.map((s) => /^Invited (\S+)/.exec(s.description)?.[1]).filter(Boolean));
  return (
    <div className="space-y-6">
      <PageHeader
        title="Invite a builder"
        description={`Sign-up is by invitation for now. Each link works for that one email, for ${INVITE_DAYS} days.`}
        actions={
          <Link href="/site" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-300 hover:bg-slate-50">
            {siteIsLive() ? "The website" : "Preview the website"}
          </Link>
        }
      />
      <Card>
        <CardHeader title="New invitation" description="They get an email with their own sign-up link — or copy the link to text them." />
        <div className="p-5">
          <InviteBuilderForm key={fill.email ?? ""} fill={fill} />
        </div>
      </Card>
      <Card>
        <CardHeader title="Requests from the website" description="People who asked for an invitation. The latest 50." />
        {requests.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {requests.map((r) => {
              const who = readInviteRequest(r.description);
              return (
                <li key={r.id} className="flex items-start gap-3 px-5 py-2">
                  <span className="w-44 shrink-0 text-slate-500">{fmtDateTime(r.createdAt)}</span>
                  <span className="min-w-0 flex-1 text-slate-800">{r.description}</span>
                  {who && invited.has(who.email) ? (
                    <span className="shrink-0 text-xs text-emerald-700">Invited</span>
                  ) : who ? (
                    <Link href={`/station/invites?${new URLSearchParams(who)}`} className="shrink-0 text-xs font-medium text-blue-700 hover:underline">
                      Invite
                    </Link>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-sm text-slate-500">None yet.</p>
        )}
      </Card>
      <Card>
        <CardHeader title="Sent" description="The latest 50." />
        {sent.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {sent.map((s) => (
              <li key={s.id} className="flex gap-3 px-5 py-2">
                <span className="w-44 shrink-0 text-slate-500">{fmtDateTime(s.createdAt)}</span>
                <span className="min-w-0 flex-1 text-slate-800">{s.description.replace(/ to The Builder Station$/, "")}</span>
                {s.stationUser ? <span className="shrink-0 text-xs text-slate-500">by {s.stationUser.name}</span> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 pb-5 text-sm text-slate-500">None yet.</p>
        )}
      </Card>
    </div>
  );
}

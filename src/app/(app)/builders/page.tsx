import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isPlatformAdmin, INVITE_DAYS } from "@/lib/builder-invites";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";
import { InviteBuilderForm } from "./invite-form";

export const metadata = { title: "Invite a builder" };

/** The platform owner's page: invite builders (sign-up is invite-only for now). Hidden from everyone else. */
export default async function BuildersPage() {
  const me = await requireUser();
  if (!isPlatformAdmin(me.email)) notFound();
  const sent = await db.activity.findMany({ where: { type: "platform.builder-invited" }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, description: true, createdAt: true } });
  return (
    <div className="space-y-6">
      <PageHeader title="Invite a builder" description={`Sign-up is by invitation for now. Each link works for that one email, for ${INVITE_DAYS} days.`} />
      <Card>
        <CardHeader title="New invitation" description="They get an email with their own sign-up link — or copy the link to text them." />
        <div className="p-5">
          <InviteBuilderForm />
        </div>
      </Card>
      <Card>
        <CardHeader title="Sent" description="The latest 50." />
        {sent.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {sent.map((s) => (
              <li key={s.id} className="flex gap-3 px-5 py-2">
                <span className="w-44 shrink-0 text-slate-500">{fmtDateTime(s.createdAt)}</span>
                <span className="text-slate-800">{s.description.replace(/ to The Builder Station$/, "")}</span>
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

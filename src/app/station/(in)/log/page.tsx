import { systemDb } from "@/lib/db";
import { requireStation } from "@/lib/station-auth";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Station log" };

/** Everything that happened at the Station, and who did it (owner only). */
export default async function StationLogPage() {
  await requireStation({ owner: true });
  const rows = await systemDb.stationLog.findMany({ orderBy: { createdAt: "desc" }, take: 300, include: { stationUser: { select: { name: true } } } });
  return (
    <div className="space-y-6">
      <PageHeader title="Log" description="Who did what at The Builder Station: sign-ins (and wrong passwords or codes), people added or removed, invitations sent, website requests. The latest 300." />
      <Card>
        <CardHeader title="Latest first" />
        {rows.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap gap-x-3 px-5 py-2">
                <span className="w-44 shrink-0 text-slate-500">{fmtDateTime(r.createdAt)}</span>
                <span className={r.type.endsWith(".failed") ? "min-w-0 flex-1 text-rose-700" : "min-w-0 flex-1 text-slate-800"}>{r.description}</span>
                <span className="shrink-0 text-xs text-slate-400">{r.stationUser?.name ?? (r.type === "invite.requested" ? "the website" : "")}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-5 text-sm text-slate-500">Nothing yet.</p>
        )}
      </Card>
    </div>
  );
}

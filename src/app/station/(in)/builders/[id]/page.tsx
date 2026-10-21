import { notFound } from "next/navigation";
import { systemDb } from "@/lib/db";
import { requireStation } from "@/lib/station-auth";
import { healthFlags, STATUS_LABEL } from "@/lib/builder-status";
import { Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { cn, dateInput, fmtDate, fmtDateTime, titleCase } from "@/lib/utils";
import { builderRows, fmtSize, STATUS_TONE } from "../data";
import { NotesForm, StatusForm } from "./forms";

export const metadata = { title: "Builder" };

const today = () => new Date();

/**
 * One builder company, as the Station sees it: who they are, their people, how they use the program
 * (counts only — never inside their jobs, estimates or money), their status and the Station's notes.
 */
export default async function BuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireStation();
  const { id } = await params;
  const [row] = await builderRows(id);
  if (!row) notFound();
  const where = { companyId: id };
  const [company, station, people, jobsBy, estimates, measurements, clients, vendors, history] = await Promise.all([
    systemDb.company.findUniqueOrThrow({ where: { id }, select: { address: true, city: true, state: true, zip: true, phone: true, email: true, website: true } }),
    systemDb.stationBuilder.findUnique({ where }),
    systemDb.user.findMany({ where: { ...where, role: { in: ["ADMIN", "STAFF"] } }, orderBy: [{ active: "desc" }, { createdAt: "asc" }], select: { id: true, name: true, email: true, role: true, active: true, lastSignInAt: true } }),
    systemDb.project.groupBy({ by: ["status"], where, _count: { _all: true } }),
    systemDb.estimate.count({ where }),
    systemDb.takeoffMeasurement.count({ where }),
    systemDb.client.count({ where }),
    systemDb.vendor.count({ where }),
    systemDb.stationLog.findMany({ where: { builderId: id }, orderBy: { createdAt: "desc" }, take: 50, include: { stationUser: { select: { name: true } } } }),
  ]);
  const flags = healthFlags(row, today());
  const contact = [company.phone, company.email, company.website].filter(Boolean);
  const address = [company.address, [company.city, company.state].filter(Boolean).join(", "), company.zip].filter(Boolean).join(" · ");
  return (
    <div className="space-y-6">
      <PageHeader
        title={row.name}
        breadcrumbs={[{ label: "Builders", href: "/station/builders" }, { label: row.name }]}
        meta={
          <span className="flex flex-wrap items-center gap-2 text-sm text-slate-500">
            <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_TONE[row.status])}>{STATUS_LABEL[row.status]}</span>
            Signed up {fmtDate(row.signedUp)}
            {flags.map((f) => (
              <span key={f.text} className={f.tone === "bad" ? "text-rose-700" : f.tone === "warn" ? "text-amber-700" : ""}>
                · {f.text}
              </span>
            ))}
          </span>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Jobs" value={row.jobs} hint={jobsBy.map((j) => `${titleCase(j.status.replace(/_/g, " "))} ${j._count._all}`).join(" · ") || "None yet"} />
        <Stat label="Team" value={row.team} hint={`${clients} clients · ${vendors} vendors`} />
        <Stat label="Estimates" value={estimates} hint={`${measurements} takeoff measurements`} />
        <Stat label="Files" value={fmtSize(row.storage)} hint={row.lastSignIn ? `Last in ${fmtDateTime(row.lastSignIn)}` : "Never signed in"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Status" description={me.role === "OWNER" ? undefined : "Only an owner changes a builder's status."} />
          <div className="p-5">
            {me.role === "OWNER" ? (
              <StatusForm companyId={id} status={row.status} trialEndsAt={dateInput(station?.trialEndsAt ?? null)} />
            ) : (
              <p className="text-sm text-slate-700">
                {STATUS_LABEL[row.status]}
                {row.status === "TRIAL" && row.trialEndsAt ? ` until ${fmtDate(row.trialEndsAt)}` : ""}
              </p>
            )}
          </div>
        </Card>
        <Card>
          <CardHeader title="Notes" description="Only the Station sees these — never the builder." />
          <div className="p-5">
            <NotesForm companyId={id} notes={station?.notes ?? ""} />
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="Company" />
        <div className="space-y-1 px-5 py-4 text-sm text-slate-700">
          <p>{address || "No address yet."}</p>
          {contact.length ? <p>{contact.join(" · ")}</p> : null}
        </div>
      </Card>
      <Card>
        <CardHeader title="Their team" description="Who can sign in to their program (clients and vendors not listed)." />
        <ul className="divide-y divide-slate-100 text-sm">
          {people.map((p) => (
            <li key={p.id} className={cn("flex flex-wrap gap-x-4 px-5 py-2", !p.active && "text-slate-400")}>
              <span className="min-w-0 flex-1 font-medium">{p.name}</span>
              <span className="w-64 truncate">{p.email}</span>
              <span className="w-20">{p.role === "ADMIN" ? "Admin" : "Staff"}</span>
              <span className="w-44 text-slate-500">{!p.active ? "Turned off" : p.lastSignInAt ? fmtDateTime(p.lastSignInAt) : "Never signed in"}</span>
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <CardHeader title="History" description="What the Station did with this builder." />
        {history.length ? (
          <ul className="divide-y divide-slate-100 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex gap-3 px-5 py-2">
                <span className="w-44 shrink-0 text-slate-500">{fmtDateTime(h.createdAt)}</span>
                <span className="text-slate-800">{h.description}</span>
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

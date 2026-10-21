import { systemDb } from "@/lib/db";
import { requireStation } from "@/lib/station-auth";
import { Card, CardHeader, ConfirmForm, PageHeader } from "@/components/ui";
import { fmtDateTime } from "@/lib/utils";
import { setStationActive, setStationRole } from "./actions";
import { AddPersonForm, NewLinkForm } from "./forms";

export const metadata = { title: "Station team" };

/** The people who run The Builder Station, and adding more (owner only). */
export default async function StationTeamPage() {
  const me = await requireStation({ owner: true });
  const people = await systemDb.stationUser.findMany({ orderBy: [{ active: "desc" }, { createdAt: "asc" }] });
  const owners = people.filter((p) => p.role === "OWNER" && p.active).length;
  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description="The people who run The Builder Station. Each has their own Station sign-in, with a code from their phone — apart from any builder's account. Owners can do everything, including this page; staff can't see Team or Log."
      />
      <Card>
        <CardHeader title="Add someone" description="They get an email with a link to set their password, then their phone code. The link works for 7 days." />
        <div className="p-5">
          <AddPersonForm />
        </div>
      </Card>
      <Card>
        <CardHeader title="Everyone" />
        <ul className="divide-y divide-slate-100 text-sm">
          {people.map((p) => {
            const you = p.id === me.id;
            const status = !p.active ? "Removed" : !p.passwordHash || !p.totpEnabledAt ? "Waiting to set up" : "Active";
            return (
              <li key={p.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900">
                    {p.name} {you ? <span className="text-xs font-normal text-slate-500">(you)</span> : null}
                  </p>
                  <p className="text-slate-500">{p.email}</p>
                </div>
                <div className="w-28 text-slate-700">{p.role === "OWNER" ? "Owner" : "Staff"}</div>
                <div className="w-40">
                  <p className={status === "Active" ? "text-emerald-700" : status === "Removed" ? "text-slate-400" : "text-amber-700"}>{status}</p>
                  <p className="text-xs text-slate-500">{p.lastSignInAt ? `Last in ${fmtDateTime(p.lastSignInAt)}` : "Never signed in"}</p>
                </div>
                {you ? (
                  <div className="w-48" />
                ) : (
                  <div className="w-48 space-y-1.5">
                    {p.active ? (
                      <>
                        <form action={setStationRole}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="role" value={p.role === "OWNER" ? "STAFF" : "OWNER"} />
                          <button type="submit" className="text-xs font-medium text-blue-700 hover:underline" disabled={p.role === "OWNER" && owners <= 1}>
                            {p.role === "OWNER" ? "Make staff" : "Make an owner"}
                          </button>
                        </form>
                        <NewLinkForm id={p.id} />
                        {p.role !== "OWNER" || owners > 1 ? (
                          <ConfirmForm
                            action={setStationActive}
                            hidden={{ id: p.id, active: "0" }}
                            message={`Remove ${p.name}? They're signed out now and can't sign in to the Station.`}
                          >
                            Remove
                          </ConfirmForm>
                        ) : null}
                      </>
                    ) : (
                      <form action={setStationActive}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="active" value="1" />
                        <button type="submit" className="text-xs font-medium text-blue-700 hover:underline">
                          Restore
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

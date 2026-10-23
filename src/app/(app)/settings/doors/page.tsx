import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { readDoorDetails } from "@/lib/door-list";
import { Card, CardBody, CardHeader, ConfirmForm, Field, SubmitButton } from "@/components/ui";
import { addDoorDetail, removeDoorDetail } from "./actions";

export const metadata = { title: "Doors" };

/** What every door has on a Doors takeoff: size, int / ext, type, jamb and core — and any details of your own. */
export default async function DoorSettingsPage() {
  await requireView("lists");
  const company = await db.company.findFirst({ select: { doorDetails: true } });
  const details = readDoorDetails(company?.doorDetails);
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader
          title="What every door has"
          description="Size, interior / exterior, type, jamb and core are always there. Add details of your own — each one is asked when you add a door to a job, shows on its list, and goes in its name and on the bid."
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            {["Size", "Int / Ext", "Type", "Jamb", "Core"].map((d) => (
              <span key={d} className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                {d}
              </span>
            ))}
          </div>
          {details.length ? (
            <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm">
              {details.map((d) => (
                <li key={d.name} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 font-medium text-slate-900">{d.name}</span>
                  <span className="text-xs text-slate-500">{d.kind === "yesno" ? "Yes / no" : "Typed in"}</span>
                  <ConfirmForm
                    action={removeDoorDetail}
                    hidden={{ name: d.name }}
                    message={`Take ${d.name} off? Doors already on the Item List keep it in their name.`}
                    variant="ghost"
                  >
                    <span className="text-xs text-rose-600">Remove</span>
                  </ConfirmForm>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No details of your own — just size, int / ext, type, jamb and core.</p>
          )}
          <form action={addDoorDetail} className="flex flex-wrap items-end gap-3">
            <Field label="New detail" htmlFor="dd-name">
              <input id="dd-name" name="name" required className="input" placeholder="Door Swing" />
            </Field>
            <Field label="Answered with" htmlFor="dd-kind">
              <select id="dd-kind" name="kind" className="input" defaultValue="text">
                <option value="text">Typed in</option>
                <option value="yesno">Yes / no</option>
              </select>
            </Field>
            <SubmitButton>Add detail</SubmitButton>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { readWindowDetails } from "@/lib/window-list";
import { Card, CardBody, CardHeader, ConfirmForm, Field, SubmitButton } from "@/components/ui";
import { addWindowDetail, removeWindowDetail } from "./actions";

export const metadata = { title: "Windows" };

/** What every window has on a Windows takeoff: size, type and black — and any details of your own. */
export default async function WindowSettingsPage() {
  await requireView("lists");
  const company = await db.company.findFirst({ select: { windowDetails: true } });
  const details = readWindowDetails(company?.windowDetails);
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader
          title="What every window has"
          description="Size, type and color are always there. Add details of your own — each one is asked when you add a window to a job, shows on its list, and goes in its name and on the bid."
        />
        <CardBody className="space-y-3">
          <div className="flex flex-wrap gap-2 text-sm">
            {["Size", "Type", "Color"].map((d) => (
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
                  <ConfirmForm action={removeWindowDetail} hidden={{ name: d.name }} message={`Take ${d.name} off? Windows already on the Item List keep it in their name.`} variant="ghost">
                    <span className="text-xs text-rose-600">Remove</span>
                  </ConfirmForm>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500">No details of your own — just size, type and black.</p>
          )}
          <form action={addWindowDetail} className="flex flex-wrap items-end gap-3">
            <Field label="New detail" htmlFor="wd-name">
              <input id="wd-name" name="name" required className="input" placeholder="Grids" />
            </Field>
            <Field label="Answered with" htmlFor="wd-kind">
              <select id="wd-kind" name="kind" className="input" defaultValue="yesno">
                <option value="yesno">Yes / no</option>
                <option value="text">Typed in</option>
              </select>
            </Field>
            <SubmitButton>Add detail</SubmitButton>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

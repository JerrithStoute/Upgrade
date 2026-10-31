import { requireStaff } from "@/lib/auth";
import { ClientPick } from "@/components/client-pick";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { Card, CardBody, CardHeader, Field, FormGrid, SubmitButton } from "@/components/ui";
import { copyThisJob, setPlanTemplate } from "../../actions";

export const metadata = { title: "Copy this job" };

/**
 * ⋯ Copy this job: a new job from this one, for another lot — its plans and takeoff, its estimate and
 * its schedule, as picked (job-copy.ts). Or kept as a plan template. And this job itself made a plan
 * template (off the job lists, to copy from) or back to a regular job.
 */
export default async function CopyJobPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  const [plans, sheets, takeoffs, shapes, estimate, tasks, clients] = await Promise.all([
    db.takeoffPlan.count({ where: { projectId: project.id, supersededAt: null } }),
    db.takeoffSheet.count({ where: { plan: { projectId: project.id, supersededAt: null } } }),
    db.takeoffCondition.count({ where: { projectId: project.id } }),
    db.takeoffMeasurement.count({ where: { condition: { projectId: project.id }, sheet: { plan: { supersededAt: null } } } }),
    db.estimate.findFirst({ where: { projectId: project.id }, orderBy: { version: "desc" }, select: { version: true, _count: { select: { items: true } } } }),
    db.scheduleTask.count({ where: { projectId: project.id } }),
    db.client.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }], select: { id: true, firstName: true, lastName: true, company: true } }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const what = (on: boolean, label: string, detail: string, name: string, disabled = false) => (
    <label className={disabled ? "flex items-start gap-2 text-sm text-slate-400" : "flex items-start gap-2 text-sm text-slate-800"}>
      <input type="checkbox" name={name} defaultChecked={on && !disabled} disabled={disabled} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
      <span>
        <b>{label}</b>
        <span className="block text-xs text-slate-500">{detail}</span>
      </span>
    </label>
  );

  return (
    <div className="max-w-3xl space-y-5">
      <Card>
        <CardHeader
          title={project.isTemplate ? "Start a job from this plan" : "Copy this job"}
          description={`A new job from #${project.number} ${project.name} — for another lot. It's its own job: changing it never changes this one.`}
        />
        <CardBody>
          <form action={copyThisJob} className="space-y-5">
            <input type="hidden" name="fromId" value={project.id} />
            <FormGrid className="md:grid-cols-2">
              <Field label="New job's name" htmlFor="cj-name" className="md:col-span-2">
                <input id="cj-name" name="name" required className="input" placeholder="Smith — Lot 14" defaultValue={project.isTemplate ? "" : `${project.name} (copy)`} />
              </Field>
              <Field label="Client (optional)" htmlFor="cj-client">
                <ClientPick id="cj-client" clients={clients.map((c) => ({ id: c.id, label: `${[c.firstName, c.lastName].filter(Boolean).join(" ")}${c.company ? ` (${c.company})` : ""}` }))} />
              </Field>
              <Field label="Address" htmlFor="cj-address">
                <input id="cj-address" name="address" className="input" placeholder="123 Main St" />
              </Field>
              <Field label="City" htmlFor="cj-city">
                <input id="cj-city" name="city" className="input" defaultValue={project.city ?? ""} />
              </Field>
              <FormGrid className="grid-cols-2">
                <Field label="State" htmlFor="cj-state">
                  <input id="cj-state" name="state" className="input" defaultValue={project.state ?? ""} />
                </Field>
                <Field label="ZIP" htmlFor="cj-zip">
                  <input id="cj-zip" name="zip" className="input" />
                </Field>
              </FormGrid>
            </FormGrid>

            <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-900">Bring along</legend>
              {what(
                plans > 0,
                "Plans & takeoff",
                plans
                  ? `${plans} plan set${plans === 1 ? "" : "s"} (${sheets} sheet${sheets === 1 ? "" : "s"}, each with its scale), ${takeoffs} takeoff${takeoffs === 1 ? "" : "s"}, ${shapes} measured shape${shapes === 1 ? "" : "s"} — where they were — and the door & window lists and substitutions. Lines are worked out again at today's prices.`
                  : "This job has no plans yet.",
                "takeoff",
                plans === 0 && takeoffs === 0,
              )}
              {what(
                !!estimate,
                "Estimate",
                estimate ? `Version ${estimate.version} (${estimate._count.items} line${estimate._count.items === 1 ? "" : "s"}), as a new draft — tied to the copied takeoffs, so it follows them.` : "This job has no estimate yet.",
                "estimate",
                !estimate,
              )}
              <div className="space-y-1.5">
                {what(tasks > 0, "Schedule", tasks ? `${tasks} task${tasks === 1 ? "" : "s"} and what waits on what, laid out again from the start date below.` : "This job has no schedule yet.", "schedule", tasks === 0)}
                {tasks ? (
                  <label className="ml-6 flex items-center gap-2 text-xs text-slate-600">
                    Starts
                    <input type="date" name="start" defaultValue={today} className="input !w-auto !py-1 text-xs" />
                  </label>
                ) : null}
              </div>
              <p className="text-xs text-slate-500">
                Never copied: selections, bids, POs, bills, invoices, change orders, daily logs, time, messages, photos and other files — they belong to this job.
              </p>
            </fieldset>

            <label className="flex items-start gap-2 text-sm text-slate-800">
              <input type="checkbox" name="isTemplate" className="mt-0.5 h-4 w-4 rounded border-slate-300" />
              <span>
                <b>Keep the copy as a plan template</b>
                <span className="block text-xs text-slate-500">Not a real job: off the job lists, no client or address — kept to start new jobs from (Projects → Plan templates).</span>
              </span>
            </label>

            <SubmitButton pendingText="Copying… (big plan sets take a moment)">Copy job</SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Plan template"
          description={
            project.isTemplate
              ? "This job is a plan template: off the job lists, the schedule, the map and QuickBooks — kept to copy new jobs from. Jobs already copied from it don't change when it does."
              : "A house you build over and over? Keep this job as a plan template: it leaves the job lists and shows under Projects → Plan templates, ready to copy."
          }
        />
        <CardBody>
          <form action={setPlanTemplate}>
            <input type="hidden" name="id" value={project.id} />
            <input type="hidden" name="on" value={project.isTemplate ? "0" : "1"} />
            <SubmitButton variant="secondary">{project.isTemplate ? "Make it a regular job again" : "Keep this job as a plan template"}</SubmitButton>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

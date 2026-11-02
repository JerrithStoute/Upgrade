import Link from "@/components/link";
import { requireView } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { PlanUpload } from "../takeoff/_components/plan-upload";
import { ClientSwitch, PlanList } from "../takeoff/_components/plan-list";
import { planFromFile } from "../takeoff/actions";

const link = "text-xs font-medium text-blue-700 hover:underline";

/**
 * Every plan for the job in one card: plan sets set up for takeoff (with their sheets and
 * scales), and plan files that are only in Files → Plans, which can be set up with one click.
 */
export default async function PlansPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string }> }) {
  await requireView("files");
  const { id } = await params;
  const { edit } = await searchParams;
  const project = await getProject(id);
  const here = `/projects/${project.id}/plans`;
  const [plans, looseFiles] = await Promise.all([
    db.takeoffPlan.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" },
      include: {
        file: { select: { size: true, clientVisible: true } },
        _count: { select: { revisions: true } },
        sheets: { orderBy: { pageNumber: "asc" }, include: { _count: { select: { measurements: true } } } },
      },
    }),
    // In Files → Plans but not set up for takeoff yet.
    db.fileAsset.findMany({
      where: { projectId: project.id, folder: "Plans", takeoffPlan: null },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, size: true, mimeType: true, clientVisible: true },
    }),
  ]);
  const measurable = (f: { name: string; mimeType: string }) =>
    f.mimeType === "application/pdf" || f.name.toLowerCase().endsWith(".pdf") || ["image/png", "image/jpeg", "image/webp"].includes(f.mimeType);
  const sheets = plans.reduce((n, p) => n + (p.supersededAt ? 0 : p.sheets.length), 0);
  const current = plans.filter((p) => !p.supersededAt).length;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500">
        {current} plan set{current === 1 ? "" : "s"}
        {sheets ? ` · ${sheets} sheet${sheets === 1 ? "" : "s"}` : ""}
      </header>
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        Click <strong className="font-medium text-slate-700">Measure</strong> to take off quantities on a plan set (the{" "}
        <Link href={`/projects/${project.id}/takeoff`} className="text-blue-700 hover:underline">
          Takeoff
        </Link>{" "}
        tab); what it orders is on the{" "}
        <Link href={`/projects/${project.id}/materials`} className="text-blue-700 hover:underline">
          Material list
        </Link>
        . Plans are also kept in{" "}
        <Link href={`/projects/${project.id}/files`} className="text-blue-700 hover:underline">
          Files → Plans
        </Link>
        .
      </p>
      {/* Always there: drop plans on it any time. */}
      <div className="border-b border-slate-100 px-4 py-3">
        <PlanUpload projectId={project.id} />
      </div>

      {plans.length ? <PlanList projectId={project.id} plans={plans} editId={edit} here={here} /> : null}

      {looseFiles.length ? (
        <>
          <p className="border-t border-slate-100 bg-slate-50 px-4 py-1.5 text-xs text-slate-500">In Files → Plans but not set up for takeoff</p>
          <ul className="divide-y divide-slate-100">
            {looseFiles.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 px-4 py-2 first:border-t-0">
                <span className="text-sm text-slate-900">{f.name}</span>
                <span className="text-xs text-slate-500">{(f.size / (1024 * 1024)).toFixed(1)} MB</span>
                <ClientSwitch projectId={project.id} fileId={f.id} visible={f.clientVisible} here={here} />
                <span className="ml-auto flex flex-wrap items-center gap-3">
                  {measurable(f) ? (
                    <form action={planFromFile}>
                      <input type="hidden" name="projectId" value={project.id} />
                      <input type="hidden" name="fileId" value={f.id} />
                      <button type="submit" className={link}>
                        Use for takeoff
                      </button>
                    </form>
                  ) : (
                    <span className="text-xs text-slate-400">Can&apos;t be measured (PDF or image only)</span>
                  )}
                  <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className={link}>
                    View
                  </a>
                  <a href={`/api/files/${f.id}?download=1`} className={link}>
                    Download
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

import Link from "next/link";
import { Download, Eye, FileText, Image as ImageIcon, Ruler } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { Card, CardBody, CardHeader, EmptyState, SubmitButton, buttonClasses } from "@/components/ui";
import { PlanUpload } from "../takeoff/_components/plan-upload";
import { ClientSwitch, PlanList } from "../takeoff/_components/plan-list";
import { planFromFile } from "../takeoff/actions";

/**
 * Every plan for the job in one place: plan sets set up for takeoff (with their
 * sheets and scales), and plan files that are only in Files → Plans, which can be
 * set up for takeoff with one click.
 */
export default async function PlansPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ renamePlan?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { renamePlan: renamePlanId } = await searchParams;
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader title="Plans" description="The plan sets for this job. Open one to look at it, or Measure to take off quantities on it." />
        <CardBody className="space-y-4">
          <PlanUpload projectId={project.id} />
          {plans.length === 0 && looseFiles.length === 0 ? (
            <EmptyState icon={FileText} title="No plans yet" description="Drop a PDF plan set above. It's saved to Files → Plans and ready to measure." />
          ) : null}
          {plans.length ? <PlanList projectId={project.id} plans={plans} renamePlanId={renamePlanId} here={here} /> : null}
        </CardBody>
      </Card>

      {looseFiles.length ? (
        <Card>
          <CardHeader title="Other plan files" description="In Files → Plans but not set up for takeoff. Use one for takeoff to measure on it." />
          <CardBody>
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {looseFiles.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  {f.mimeType.startsWith("image/") ? <ImageIcon className="h-5 w-5 text-violet-600" /> : <FileText className="h-5 w-5 text-rose-500" />}
                  <span className="font-medium text-slate-900">{f.name}</span>
                  <span className="text-xs text-slate-500">{(f.size / (1024 * 1024)).toFixed(1)} MB</span>
                  <ClientSwitch projectId={project.id} fileId={f.id} visible={f.clientVisible} here={here} />
                  <div className="ml-auto flex flex-wrap items-center gap-1">
                    {measurable(f) ? (
                      <form action={planFromFile}>
                        <input type="hidden" name="projectId" value={project.id} />
                        <input type="hidden" name="fileId" value={f.id} />
                        <SubmitButton size="sm">
                          <Ruler className="h-3.5 w-3.5" /> Use for takeoff
                        </SubmitButton>
                      </form>
                    ) : (
                      <span className="text-xs text-slate-400">Can&apos;t be measured (PDF or image only)</span>
                    )}
                    <a href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" className={buttonClasses("ghost", "sm")}>
                      <Eye className="h-3.5 w-3.5" /> View
                    </a>
                    <a href={`/api/files/${f.id}?download=1`} className={buttonClasses("ghost", "sm")} title="Download the original file">
                      <Download className="h-3.5 w-3.5" />
                      <span className="sr-only">Download</span>
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <p className="text-xs text-slate-500">
        Plans also live in{" "}
        <Link href={`/projects/${project.id}/files`} className="text-blue-700 hover:underline">
          Files → Plans
        </Link>
        . Measure on the{" "}
        <Link href={`/projects/${project.id}/takeoff`} className="text-blue-700 hover:underline">
          Takeoff
        </Link>{" "}
        tab; everything it orders is on the{" "}
        <Link href={`/projects/${project.id}/materials`} className="text-blue-700 hover:underline">
          Material list
        </Link>{" "}
        tab.
      </p>
    </div>
  );
}

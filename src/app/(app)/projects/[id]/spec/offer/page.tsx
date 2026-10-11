import Link from "@/components/link";
import { addDays } from "date-fns";
import { requireStaff } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { specPicture } from "@/lib/spec";
import { dateInput } from "@/lib/utils";
import { OfferCalculator } from "./calculator";

/** An offer came in: work it out. */
export default async function OfferPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;
  const project = await getProject(id);
  const p = await specPicture(project.id);
  return (
    <div className="space-y-4">
      <div>
        <Link href={`/projects/${project.id}/spec`} className="text-xs text-slate-500 hover:text-slate-800">
          ← Spec sale
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Work out an offer</h2>
        {!p.spec?.listPrice || !p.carrying.length ? (
          <p className="text-sm text-amber-700">
            {!p.spec?.listPrice ? "No list price yet. " : ""}
            {!p.carrying.length ? "No carrying costs yet, so holding the house counts as $0. " : ""}
            <Link href={`/projects/${project.id}/spec`} className="font-medium underline">
              Set them up
            </Link>
          </p>
        ) : null}
      </div>
      <OfferCalculator
        projectId={project.id}
        build={p.build}
        toFinish={p.toFinish}
        loanRate={p.loanRate}
        carrying={p.carrying}
        perDay={p.perDay}
        stop={p.stop}
        listPrice={p.spec?.listPrice ?? null}
        sheet={{ ...p.sheet, hoaPaidThrough: p.sheet.hoaPaidThrough ? p.sheet.hoaPaidThrough.toISOString() : null }}
        closingDefault={dateInput(addDays(new Date(), 30))}
        today={dateInput(new Date())}
      />
    </div>
  );
}

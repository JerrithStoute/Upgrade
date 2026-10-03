import Link from "next/link";
import { Download, Eye, EyeOff, FileText, Image as ImageIcon, Printer, Ruler } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmForm, SubmitButton, buttonClasses } from "@/components/ui";
import { deletePlan, renamePlan, togglePlanClientVisible } from "../actions";
import { RevisionUpload } from "./revision-upload";

export type PlanListPlan = {
  id: string;
  name: string;
  kind: string;
  pageCount: number | null;
  fileId: string;
  revision: number;
  supersededAt: Date | null;
  _count: { revisions: number };
  file: { size: number; clientVisible: boolean };
  sheets: { id: string; pageNumber: number; name: string; unitsPerFoot: number | null; scaleLabel: string | null; _count: { measurements: number } }[];
};

/**
 * The job's plan sets: open, measure, print, download, rename, delete, and whether
 * the client sees them — with each sheet's scale and measurement count. Shared by
 * the project's Plans tab and the Takeoff tab's Plans list.
 * `here` is the page the list is on (rename links and redirects come back to it).
 */
export function PlanList({ projectId, plans, renamePlanId, here }: { projectId: string; plans: PlanListPlan[]; renamePlanId?: string; here: string }) {
  const base = `/projects/${projectId}/takeoff`;
  const withParam = (k: string, v: string) => `${here}${here.includes("?") ? "&" : "?"}${k}=${v}`;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {plans.map((plan) => (
        <li key={plan.id} className={cn("space-y-3 px-4 py-3", plan.supersededAt && "bg-slate-50/70 opacity-75")}>
          <div className="flex flex-wrap items-center gap-3">
            {plan.kind === "PDF" ? <FileText className="h-5 w-5 text-rose-500" /> : <ImageIcon className="h-5 w-5 text-violet-600" />}
            {renamePlanId === plan.id ? (
              <form action={renamePlan} className="flex items-center gap-2">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="id" value={plan.id} />
                <input type="hidden" name="returnTo" value={here} />
                <input name="name" defaultValue={plan.name} required className="input !w-72" aria-label="Plan name" autoFocus />
                <SubmitButton size="sm">Save</SubmitButton>
                <Link href={here} className={buttonClasses("ghost", "sm")}>
                  Cancel
                </Link>
              </form>
            ) : (
              <Link href={`${base}/${plan.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                {plan.name}
              </Link>
            )}
            {plan.revision > 1 || plan.supersededAt ? (
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", plan.supersededAt ? "bg-slate-200 text-slate-600" : "bg-blue-100 text-blue-800")}>
                Rev {plan.revision}
                {plan.supersededAt ? " · replaced" : ""}
              </span>
            ) : null}
            <span className="text-xs text-slate-500">
              {plan.pageCount ? `${plan.pageCount} sheet${plan.pageCount === 1 ? "" : "s"}` : "Pages counted when first opened"} · {(plan.file.size / (1024 * 1024)).toFixed(1)} MB
            </span>
            <ClientSwitch projectId={projectId} planId={plan.id} visible={plan.file.clientVisible} here={here} />
            <div className="ml-auto flex flex-wrap items-center gap-1">
              {plan.supersededAt ? (
                <Link href={`${base}/${plan.id}`} className={buttonClasses("secondary", "sm")}>
                  <Eye className="h-3.5 w-3.5" /> Open
                </Link>
              ) : (
                <Link href={`${base}/${plan.id}`} className={buttonClasses("primary", "sm")}>
                  <Ruler className="h-3.5 w-3.5" /> Measure
                </Link>
              )}
              {!plan.supersededAt && plan._count.revisions === 0 ? <RevisionUpload projectId={projectId} planId={plan.id} nextRevision={plan.revision + 1} /> : null}
              <a href={`/api/files/${plan.fileId}`} target="_blank" rel="noreferrer" className={buttonClasses("ghost", "sm")} title="Open the plan set to look at it">
                <Eye className="h-3.5 w-3.5" /> View
              </a>
              <Link href={`${base}/${plan.id}/print?pages=all`} className={buttonClasses("ghost", "sm")} title="Print or save the measured sheets with the takeoff drawn on them">
                <Printer className="h-3.5 w-3.5" /> Print
              </Link>
              <a href={`/api/files/${plan.fileId}?download=1`} className={buttonClasses("ghost", "sm")} title="Download the original file">
                <Download className="h-3.5 w-3.5" />
                <span className="sr-only">Download</span>
              </a>
              <Link href={withParam("renamePlan", plan.id)} className={buttonClasses("ghost", "sm")}>
                Rename
              </Link>
              <ConfirmForm
                action={deletePlan}
                hidden={{ projectId, id: plan.id, returnTo: here }}
                message={`Delete "${plan.name}"? Every measurement on it is removed and the file is deleted from Files and storage.`}
                variant="ghost"
              >
                <span className="text-xs text-rose-600">Delete</span>
              </ConfirmForm>
            </div>
          </div>
          {plan.sheets.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {plan.sheets.map((sh) => (
                <Link
                  key={sh.id}
                  href={`${base}/${plan.id}?page=${sh.pageNumber}`}
                  className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 hover:border-blue-300 hover:bg-blue-50"
                >
                  <span className="font-medium">{sh.name}</span>
                  <span className={cn("ml-1.5", sh.unitsPerFoot ? "text-slate-500" : "text-amber-700")}>{sh.unitsPerFoot ? sh.scaleLabel : "no scale"}</span>
                  {sh._count.measurements ? <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{sh._count.measurements}</span> : null}
                </Link>
              ))}
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/** "Client sees it" / "Staff only" — flips whether the plan shows in the client portal. */
export function ClientSwitch({ projectId, planId, fileId, visible, here }: { projectId: string; planId?: string; fileId?: string; visible: boolean; here: string }) {
  return (
    <form action={togglePlanClientVisible}>
      <input type="hidden" name="projectId" value={projectId} />
      {planId ? <input type="hidden" name="planId" value={planId} /> : null}
      {fileId ? <input type="hidden" name="fileId" value={fileId} /> : null}
      <input type="hidden" name="returnTo" value={here} />
      <button
        type="submit"
        title={visible ? "The client can see this in their portal — click to hide it" : "Only your team sees this — click to share it with the client"}
        className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
          visible ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-50 text-slate-600 ring-slate-200",
        )}
      >
        {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        {visible ? "Client sees it" : "Staff only"}
      </button>
    </form>
  );
}

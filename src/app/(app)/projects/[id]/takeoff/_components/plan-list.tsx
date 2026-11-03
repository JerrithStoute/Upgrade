import Link from "@/components/link";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmForm, SubmitButton } from "@/components/ui";
import { deletePlan, renamePlan, togglePlanClientVisible } from "../actions";
import { RevisionUpload } from "./revision-upload";
import { SheetNames } from "./sheet-names";

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

const link = "text-xs font-medium text-blue-700 hover:underline";

/**
 * The job's plan sets, one line each: Measure, then View / Print / Download / Upload revision / Edit as
 * small links, with each sheet's scale and measurement count under it. **Edit** opens on the plan's
 * own line (its name, and Delete plan…). `here` is the page the list is on (links come back to it).
 */
export function PlanList({ projectId, plans, editId, here }: { projectId: string; plans: PlanListPlan[]; editId?: string; here: string }) {
  const base = `/projects/${projectId}/takeoff`;
  return (
    <ul>
      {plans.map((plan) =>
        editId === plan.id ? (
          <li key={plan.id} id={`plan-${plan.id}`} className="scroll-mt-24 border-t border-slate-100 bg-blue-50/40 px-4 py-3 first:border-t-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-900">Edit {plan.name}</span>
              <Link href={here} scroll={false} className={link}>
                Cancel
              </Link>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <form action={renamePlan} className="flex flex-wrap items-center gap-1.5">
                <input type="hidden" name="projectId" value={projectId} />
                <input type="hidden" name="id" value={plan.id} />
                <input type="hidden" name="returnTo" value={here} />
                <input name="name" defaultValue={plan.name} required className="input !h-7 !w-72 !py-0 text-xs" aria-label="Plan name" autoFocus />
                <SubmitButton size="sm" className="!h-7 !px-2.5 !text-xs">
                  Save
                </SubmitButton>
              </form>
              <span className="ml-auto">
                <ConfirmForm
                  action={deletePlan}
                  hidden={{ projectId, id: plan.id, returnTo: here }}
                  message={`Delete "${plan.name}"? Every measurement on it is removed and the file is deleted from Files and storage.`}
                  variant="ghost"
                >
                  <span className="text-xs text-rose-600">Delete plan…</span>
                </ConfirmForm>
              </span>
            </div>
          </li>
        ) : (
          <li key={plan.id} id={`plan-${plan.id}`} className={cn("scroll-mt-24 space-y-1.5 border-t border-slate-100 px-4 py-2.5 first:border-t-0", plan.supersededAt && "bg-slate-50/70 opacity-75")}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <Link href={`${base}/${plan.id}`} className="text-sm font-medium text-blue-700 hover:underline">
                {plan.name}
              </Link>
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
              <span className="ml-auto flex flex-wrap items-center gap-3">
                {plan.supersededAt ? (
                  <Link href={`${base}/${plan.id}`} className={link}>
                    Open
                  </Link>
                ) : (
                  <Link href={`${base}/${plan.id}`} className="inline-flex h-7 items-center rounded-md bg-blue-700 px-2.5 text-xs font-medium text-white hover:bg-blue-800">
                    Measure
                  </Link>
                )}
                <a href={`/api/files/${plan.fileId}`} target="_blank" rel="noreferrer" className={link} title="Open the plan set to look at it">
                  View
                </a>
                <Link href={`${base}/${plan.id}/print?pages=all`} className={link} title="Print or save the measured sheets with the takeoff drawn on them">
                  Print
                </Link>
                <a href={`/api/files/${plan.fileId}?download=1`} className={link} title="Download the original file">
                  Download
                </a>
                {!plan.supersededAt && plan._count.revisions === 0 ? <RevisionUpload projectId={projectId} planId={plan.id} nextRevision={plan.revision + 1} /> : null}
                <Link href={`${here}?edit=${plan.id}#plan-${plan.id}`} scroll={false} className={link} aria-label={`Edit ${plan.name}`}>
                  Edit
                </Link>
              </span>
            </div>
            {plan.sheets.length > 0 ? <SheetNames projectId={projectId} planId={plan.id} sheets={plan.sheets} /> : null}
          </li>
        ),
      )}
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
          "tap inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
          visible ? "bg-emerald-50 text-emerald-800 ring-emerald-200" : "bg-slate-50 text-slate-600 ring-slate-200",
        )}
      >
        {visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
        {visible ? "Client sees it" : "Staff only"}
      </button>
    </form>
  );
}

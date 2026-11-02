import Link from "@/components/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireView } from "@/lib/auth";
import { allows } from "@/lib/access";
import { getProject } from "@/lib/projects";
import { loadChangeOrderDoc } from "@/lib/change-order-doc";
import { SubmitButton, buttonClasses } from "@/components/ui";
import { ClientEmailNote } from "@/components/client-email-note";
import { sendChangeOrder } from "../../actions";
import { ChangeOrderDocument } from "@/components/change-order-document";
import { PrintButton } from "../../../_components/print-button";
import { DocPanel } from "./doc-panel";

/**
 * The change order as the client gets it, like the proposal page: "What the client sees" on the
 * left (for people who see costs and may change change orders), the paper on the right — and,
 * on a draft, Send for approval at the top, so it's sent from where you see what they get.
 */
export default async function ChangeOrderPrintPage({ params }: { params: Promise<{ id: string; coId: string }> }) {
  const user = await requireView("selections");
  const { id, coId } = await params;
  const project = await getProject(id);
  const doc = await loadChangeOrderDoc(project.id, coId);
  if (!doc) notFound();
  const panel = user.access.costs && allows(user.access, "selections", 2);
  const { co } = doc;
  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/projects/${project.id}/change-orders/${coId}`} className={buttonClasses("secondary", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to change order
        </Link>
        <div className="flex items-center gap-2">
          <PrintButton label="Print / Save PDF" />
          {panel && co.status === "DRAFT" ? (
            // Send from here, once the paper looks right.
            <form action={sendChangeOrder}>
              <input type="hidden" name="projectId" value={project.id} />
              <input type="hidden" name="id" value={co.id} />
              <SubmitButton size="sm" pendingText="Sending…">
                Send for approval
              </SubmitButton>
            </form>
          ) : null}
        </div>
      </div>
      {panel && co.status === "DRAFT" && co.clientApproval ? (
        <ClientEmailNote clientId={project.clientId} button="Send for approval" className="no-print -mt-2 block text-right text-xs text-slate-500" />
      ) : null}
      <div className="flex flex-col items-start gap-4 lg:flex-row">
        {panel ? (
          <DocPanel
            key={`${co.showItems}${co.showPrices}${co.profitShown}${co.profitLabel}${co.taxShown}${co.taxLabel}${JSON.stringify(doc.doc)}`}
            projectId={project.id}
            coId={co.id}
            draft={co.status === "DRAFT"}
            hasSelections={doc.lines.some((l) => l.kind === "SELECTION")}
            v={{
              showItems: co.showItems,
              showPrices: co.showPrices,
              profitMode: co.profitMode,
              profitShown: co.profitShown,
              profitLabel: co.profitLabel,
              taxPct: co.taxPct,
              taxShown: co.taxShown,
              taxLabel: co.taxLabel,
              doc: doc.doc,
            }}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <ChangeOrderDocument d={doc} />
        </div>
      </div>
    </div>
  );
}

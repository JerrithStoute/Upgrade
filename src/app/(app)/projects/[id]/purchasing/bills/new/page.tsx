import Link from "@/components/link";
import { requireView } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { dateInput } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui";
import { BillForm } from "../../_components/bill-form";
import { billChoices } from "../../_data";
import { createBill } from "../../actions";
import { jobBudget } from "@/lib/job-budget";

export default async function NewBillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ po?: string; codes?: string }> }) {
  await requireView("purchasing");
  const { id } = await params;
  const { po: poId, codes: codesParam } = await searchParams;
  const project = await getProject(id);
  const { choices, codes, vendors } = await billChoices(project.id);
  const po = choices.find((c) => c.id === poId);
  // From the Budget: one line per cost code picked there, at what's left of it (the bid or budget, less what's spent).
  const picked = !po && codesParam ? codesParam.split(",").filter((c) => codes.some((x) => x.id === c)) : [];
  const fromBudget = picked.length
    ? (await jobBudget(project)).lines
        .filter((l) => picked.includes(l.key))
        .map((l) => ({ description: l.name, costCodeId: l.key, amount: Math.max(0, Math.round(((l.committed ?? l.budget) - l.spent) * 100) / 100) }))
    : [];
  return (
    <div className="space-y-4">
      <div>
        <Link
          href={po ? `/projects/${project.id}/purchasing/po/${po.id}` : `/projects/${project.id}/${picked.length ? "budget" : "purchasing"}`}
          className="text-xs text-slate-500 hover:text-slate-800"
        >
          ← {po ? "Back to the PO" : picked.length ? "Budget" : "Purchasing"}
        </Link>
        <h2 className="mt-1 text-lg font-semibold text-slate-900">Enter a bill</h2>
        <p className="text-sm text-slate-500">What a sub or vendor billed you. Once approved it&apos;s the job&apos;s actual cost on the Budget.</p>
      </div>
      <Card>
        <CardBody>
          <BillForm
            action={createBill}
            projectId={project.id}
            codes={codes}
            vendors={vendors}
            pos={choices}
            submitLabel="Save bill"
            initial={{
              purchaseOrderId: po?.id ?? "",
              vendor: po?.vendor ?? "",
              billNumber: "",
              billDate: dateInput(new Date()),
              dueDate: "",
              notes: "",
              lines: po?.lines.length ? po.lines : fromBudget.length ? fromBudget : [{ description: "", costCodeId: null, amount: 0 }],
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}

import Link from "next/link";
import { requireStaff } from "@/lib/auth";
import { getProject } from "@/lib/projects";
import { dateInput } from "@/lib/utils";
import { Card, CardBody } from "@/components/ui";
import { BillForm } from "../../_components/bill-form";
import { billChoices } from "../../_data";
import { createBill } from "../../actions";

export default async function NewBillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ po?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { po: poId } = await searchParams;
  const project = await getProject(id);
  const { choices, codes, vendors } = await billChoices(project.id);
  const po = choices.find((c) => c.id === poId);
  return (
    <div className="space-y-4">
      <div>
        <Link href={po ? `/projects/${project.id}/purchasing/po/${po.id}` : `/projects/${project.id}/purchasing`} className="text-xs text-slate-500 hover:text-slate-800">
          ← {po ? "Back to the PO" : "Purchasing"}
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
              lines: po?.lines.length ? po.lines : [{ description: "", costCodeId: null, amount: 0 }],
            }}
          />
        </CardBody>
      </Card>
    </div>
  );
}

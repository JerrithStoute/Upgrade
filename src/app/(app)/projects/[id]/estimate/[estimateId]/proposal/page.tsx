import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { fmtDate, linePrice, money, num } from "@/lib/utils";
import { groupBy, lineTotals } from "@/lib/finance";
import { buttonClasses } from "@/components/ui";
import { PrintButton } from "../../../_components/print-button";

export default async function ProposalPage({ params }: { params: Promise<{ id: string; estimateId: string }> }) {
  await requireStaff();
  const { id, estimateId } = await params;
  const project = await getProject(id);
  const [estimate, company] = await Promise.all([
    db.estimate.findFirst({
      where: { id: estimateId, projectId: project.id },
      include: {
        items: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
        allowances: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
      },
    }),
    db.company.findFirst(),
  ]);
  if (!estimate) notFound();

  const included = estimate.items.filter((i) => !i.isOptional);
  const optional = estimate.items.filter((i) => i.isOptional);
  const totals = lineTotals(included);
  // Built-up allowances show as one line (their total) — the cost-code breakdown stays internal.
  const allowanceIds = new Set(estimate.allowances.map((a) => a.id));
  const rows: ProposalRow[] = [
    ...included
      .filter((i) => !i.allowanceId || !allowanceIds.has(i.allowanceId))
      .map((i) => ({ id: i.id, group: i.group, sortOrder: i.sortOrder, description: i.description, quantity: i.quantity, unit: i.unit, price: linePrice(i), isAllowance: i.isAllowance, note: null })),
    ...estimate.allowances.map((a) => ({
      id: a.id,
      group: a.group,
      sortOrder: a.sortOrder,
      description: `${a.name} allowance`,
      quantity: null,
      unit: null,
      price: lineTotals(included.filter((i) => i.allowanceId === a.id)).price,
      isAllowance: true,
      note: a.description,
    })),
  ].sort((a, b) => a.sortOrder - b.sortOrder);
  const groups = groupBy(rows, (r) => r.group);
  const allowances = rows.filter((r) => r.isAllowance);
  const client = project.client;
  const companyAddress = [company?.address, [company?.city, company?.state].filter(Boolean).join(", "), company?.zip].filter(Boolean).join(" · ");
  const projectAddress = [project.address, [project.city, project.state].filter(Boolean).join(", "), project.zip].filter(Boolean).join(" · ");
  const clientAddress = client ? [client.address, [client.city, client.state].filter(Boolean).join(", "), client.zip].filter(Boolean).join(" · ") : "";

  return (
    <div className="space-y-4">
      <div className="no-print flex items-center justify-between">
        <Link href={`/projects/${project.id}/estimate?estimate=${estimate.id}`} className={buttonClasses("secondary", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Back to estimate
        </Link>
        <PrintButton label="Print / Save PDF" />
      </div>

      <article className="mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-8 text-slate-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{company?.name ?? "Your Company"}</h1>
            {companyAddress ? <p className="mt-1 text-sm text-slate-600">{companyAddress}</p> : null}
            <p className="text-sm text-slate-600">
              {[company?.phone, company?.email].filter(Boolean).join(" · ")}
            </p>
            {company?.licenseNumber ? <p className="text-sm text-slate-600">License {company.licenseNumber}</p> : null}
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Proposal</p>
            <p className="mt-1 text-lg font-semibold">{estimate.name}</p>
            <p className="text-sm text-slate-600">Version {estimate.version}</p>
            <p className="text-sm text-slate-600">Date {fmtDate(estimate.sentAt ?? estimate.updatedAt)}</p>
          </div>
        </header>

        <section className="grid grid-cols-1 gap-6 py-6 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Prepared for</p>
            {client ? (
              <>
                <p className="mt-1 font-medium">
                  {client.firstName} {client.lastName}
                </p>
                {client.company ? <p className="text-sm text-slate-600">{client.company}</p> : null}
                {clientAddress ? <p className="text-sm text-slate-600">{clientAddress}</p> : null}
                <p className="text-sm text-slate-600">{[client.email, client.phone].filter(Boolean).join(" · ")}</p>
              </>
            ) : (
              <p className="mt-1 text-sm text-slate-500">No client on file</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Project</p>
            <p className="mt-1 font-medium">
              #{project.number} — {project.name}
            </p>
            {projectAddress ? <p className="text-sm text-slate-600">{projectAddress}</p> : null}
            {project.description ? <p className="mt-1 text-sm text-slate-600">{project.description}</p> : null}
          </div>
        </section>

        <section>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-800 text-left text-xs uppercase tracking-wide text-slate-600">
                <th className="py-2 pr-3">Description</th>
                <th className="py-2 pr-3 text-right">Qty</th>
                <th className="py-2 pr-3">Unit</th>
                <th className="py-2 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(([group, items]) => (
                <GroupSection key={group} group={group} items={items} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-300">
                <td className="py-2 pr-3 text-right text-sm text-slate-600" colSpan={3}>
                  Subtotal
                </td>
                <td className="py-2 text-right tabular-nums">{money(totals.price)}</td>
              </tr>
              <tr className="border-t-2 border-slate-800">
                <td className="py-3 pr-3 text-right text-base font-semibold" colSpan={3}>
                  Total
                </td>
                <td className="py-3 text-right text-base font-bold tabular-nums">{money(totals.price)}</td>
              </tr>
            </tfoot>
          </table>
        </section>

        {allowances.length > 0 ? (
          <section className="mt-6 rounded-md border border-amber-200 bg-amber-50/60 p-4 print:bg-white">
            <h2 className="text-sm font-semibold">Allowances</h2>
            <p className="mt-1 text-xs text-slate-600">
              Items marked with an asterisk (*) are allowances. Final cost is adjusted based on the selections you make; any difference is credited or billed on the final invoice.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {allowances.map((a) => (
                <li key={a.id} className="flex justify-between gap-4">
                  <span>
                    {a.description}
                    {a.note ? <span className="block text-xs text-slate-500">{a.note}</span> : null}
                  </span>
                  <span className="tabular-nums">{money(a.price)}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {optional.length > 0 ? (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Optional items (not included in total)</h2>
            <table className="mt-2 w-full text-sm">
              <tbody>
                {optional.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">
                      {i.description}
                      <span className="ml-2 text-xs text-slate-500">{i.group}</span>
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{num(i.quantity)}</td>
                    <td className="py-1.5 pr-3">{i.unit}</td>
                    <td className="py-1.5 text-right tabular-nums">{money(linePrice(i))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}

        {estimate.notes ? (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Notes</h2>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{estimate.notes}</p>
          </section>
        ) : null}
        {estimate.terms ? (
          <section className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Terms</h2>
            <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{estimate.terms}</p>
          </section>
        ) : null}

        <section className="mt-10 grid grid-cols-1 gap-10 sm:grid-cols-2">
          <div>
            <div className="border-b border-slate-800 pb-8" />
            <p className="mt-1 text-xs text-slate-600">Client signature · Date</p>
            {client ? (
              <p className="text-xs text-slate-500">
                {client.firstName} {client.lastName}
              </p>
            ) : null}
          </div>
          <div>
            <div className="border-b border-slate-800 pb-8" />
            <p className="mt-1 text-xs text-slate-600">Contractor signature · Date</p>
            <p className="text-xs text-slate-500">{company?.name}</p>
          </div>
        </section>
      </article>
    </div>
  );
}

type ProposalRow = {
  id: string;
  group: string;
  sortOrder: number;
  description: string;
  quantity: number | null;
  unit: string | null;
  price: number;
  isAllowance: boolean;
  note: string | null;
};

function GroupSection({ group, items }: { group: string; items: ProposalRow[] }) {
  const subtotal = items.reduce((s, i) => s + i.price, 0);
  return (
    <>
      <tr>
        <td colSpan={4} className="pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
          {group}
        </td>
      </tr>
      {items.map((i) => (
        <tr key={i.id} className="border-b border-slate-100">
          <td className="py-1.5 pr-3">
            {i.description}
            {i.isAllowance ? " *" : ""}
            {i.note ? <span className="block text-xs text-slate-500">{i.note}</span> : null}
          </td>
          <td className="py-1.5 pr-3 text-right tabular-nums">{i.quantity == null ? "" : num(i.quantity)}</td>
          <td className="py-1.5 pr-3">{i.unit ?? ""}</td>
          <td className="py-1.5 text-right tabular-nums">{money(i.price)}</td>
        </tr>
      ))}
      <tr>
        <td colSpan={3} className="py-1 pr-3 text-right text-xs text-slate-500">
          {group} subtotal
        </td>
        <td className="py-1 text-right text-xs tabular-nums text-slate-600">{money(subtotal)}</td>
      </tr>
    </>
  );
}

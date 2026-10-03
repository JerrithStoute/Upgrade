import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { buildMaterialList } from "@/lib/takeoff-materials";
import { cn } from "@/lib/utils";
import { buttonClasses } from "@/components/ui";
import { VendorList, type VendorGroup } from "@/components/vendor-list";
import { companyLines } from "@/lib/company";

/** Part of the job's material list for a vendor (framing lumber, trim…) — quantities, no prices. */
export default async function VendorMaterialListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ plan?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { plan: planParam } = await searchParams;
  const project = await getProject(id);
  const [plans, company] = await Promise.all([
    db.takeoffPlan.findMany({ where: { projectId: project.id, supersededAt: null }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } }),
    db.company.findFirst(),
  ]);
  const planId = plans.some((p) => p.id === planParam) ? planParam! : null;
  const { lines } = await buildMaterialList(project.id, planId);

  const groups: VendorGroup[] = [];
  for (const l of lines) {
    let g = groups.find((x) => x.category === l.category);
    if (!g) groups.push((g = { category: l.category, items: [] }));
    g.items.push({ key: l.key, name: l.name, sku: l.sku, qty: l.quantity, unit: l.unit });
  }
  const address = [project.address, [project.city, project.state].filter(Boolean).join(", ")].filter(Boolean).join(", ");
  const base = `/projects/${project.id}/materials/vendor`;
  const chip = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
      active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
    );

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href={`/projects/${project.id}/materials`} className={buttonClasses("ghost", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Material list
        </Link>
        <span className="text-sm font-semibold text-slate-900">For a vendor</span>
        <span className="text-xs text-slate-500">— pick what to send; prices never print.</span>
        {plans.length > 1 ? (
          <div className="ml-auto flex flex-wrap gap-1.5">
            <Link href={base} className={chip(!planId)}>
              All plans
            </Link>
            {plans.map((p) => (
              <Link key={p.id} href={`${base}?plan=${p.id}`} className={chip(planId === p.id)}>
                {p.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
      <VendorList
        storageKey={`vendorlist:${project.id}`}
        title={`Material list${planId ? ` — ${plans.find((p) => p.id === planId)?.name}` : ""}`}
        from={companyLines(company)}
        about={[`Job #${project.number} — ${project.name}`, address ? `Deliver to: ${address}` : ""].filter(Boolean)}
        groups={groups}
        emptyText="Nothing on the material list yet — measure takeoffs with items on them."
      />
    </div>
  );
}

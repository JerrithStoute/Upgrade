import Link from "next/link";
import { Download, Truck } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { buildMaterialList } from "@/lib/takeoff-materials";
import { cn, fmtDate } from "@/lib/utils";
import { buttonClasses } from "@/components/ui";
import { PrintButton } from "../_components/print-button";
import { MaterialTable } from "../takeoff/_components/material-table";

/** The job's material list: its own project tab, printable with or without prices. */
export default async function MaterialListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ plan?: string; prices?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const { plan: planParam, prices } = await searchParams;
  const project = await getProject(id);
  const plans = await db.takeoffPlan.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const planId = plans.some((p) => p.id === planParam) ? planParam! : null;
  const showPrices = prices !== "0";
  const { lines, cutLists, total } = await buildMaterialList(project.id, planId);

  const base = `/projects/${project.id}/materials`;
  const href = (o: { plan?: string | null; prices?: boolean }) => {
    const q = new URLSearchParams();
    const plan = o.plan === undefined ? planId : o.plan;
    if (plan) q.set("plan", plan);
    if (!(o.prices ?? showPrices)) q.set("prices", "0");
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const csvHref = `/projects/${project.id}/takeoff/materials/csv${planId ? `?plan=${planId}` : ""}${planId ? "&" : "?"}prices=${showPrices ? "1" : "0"}`;
  const chip = (active: boolean) =>
    cn(
      "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset",
      active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
    );
  const address = [project.address, project.city, project.state].filter(Boolean).join(", ");

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={href({ plan: null })} className={chip(!planId)}>
            All plans
          </Link>
          {plans.map((p) => (
            <Link key={p.id} href={href({ plan: p.id })} className={chip(planId === p.id)}>
              {p.name}
            </Link>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Prices on or off — off for a list to send a supplier. The printout and CSV follow it. */}
          <div className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs font-medium" role="group" aria-label="Prices">
            <Link href={href({ prices: true })} className={cn("px-2.5 py-1.5", showPrices ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50")}>
              Show prices
            </Link>
            <Link href={href({ prices: false })} className={cn("px-2.5 py-1.5", !showPrices ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50")}>
              Hide prices
            </Link>
          </div>
          <Link
            href={`/projects/${project.id}/materials/vendor${planId ? `?plan=${planId}` : ""}`}
            className={buttonClasses("secondary", "sm")}
            title="Send part of the list (e.g. framing lumber) to a vendor — no prices"
          >
            <Truck className="h-3.5 w-3.5" /> For a vendor…
          </Link>
          <a href={csvHref} className={buttonClasses("secondary", "sm")}>
            <Download className="h-3.5 w-3.5" /> CSV
          </a>
          <PrintButton />
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-slate-900">Material list</h2>
        <p className="text-sm text-slate-500">
          #{project.number} {project.name}
          {address ? ` · ${address}` : ""} · {planId ? plans.find((p) => p.id === planId)?.name : "All plans"} · {fmtDate(new Date())}
        </p>
        <p className="no-print mt-1 text-xs text-slate-500">
          Everything your takeoffs order, from every plan set (or pick one above). Quantities include waste. Items used by several conditions are combined and rounded up once on
          the total. Prices are this job&apos;s costs, before markup.
        </p>
      </div>

      <MaterialTable lines={lines} cutLists={cutLists} total={total} showPrices={showPrices} />
    </div>
  );
}

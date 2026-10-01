import Link from "next/link";
import { ArrowLeft, ClipboardList, Download } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { buildMaterialList } from "@/lib/takeoff-materials";
import { feetInches } from "@/lib/takeoff";
import { groupBy } from "@/lib/finance";
import { cn, fmtDate, money, num } from "@/lib/utils";
import { EmptyState, TBody, TFoot, THead, Table, Td, Th, Tr, buttonClasses } from "@/components/ui";
import { PrintButton } from "../../_components/print-button";

export default async function MaterialListPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plan?: string; prices?: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const { plan: planParam, prices } = await searchParams;
  const project = await getProject(id);
  const plans = await db.takeoffPlan.findMany({ where: { projectId: project.id }, orderBy: { createdAt: "asc" }, select: { id: true, name: true } });
  const planId = plans.some((p) => p.id === planParam) ? planParam! : null;
  const showPrices = prices !== "0";
  const { lines, cutLists, total } = await buildMaterialList(project.id, planId);

  const base = `/projects/${project.id}/takeoff/materials`;
  const href = (o: { plan?: string | null; prices?: boolean }) => {
    const q = new URLSearchParams();
    const plan = o.plan === undefined ? planId : o.plan;
    if (plan) q.set("plan", plan);
    if (!(o.prices ?? showPrices)) q.set("prices", "0");
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const csvHref = `${base}/csv${planId ? `?plan=${planId}` : ""}${planId ? "&" : "?"}prices=${showPrices ? "1" : "0"}`;
  const chip = (active: boolean) =>
    cn("rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset", active ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50");
  const groups = groupBy(lines, (l) => l.category);
  const address = [project.address, project.city, project.state].filter(Boolean).join(", ");

  return (
    <div className="space-y-5">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href={`/projects/${project.id}/takeoff`} className={buttonClasses("ghost", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Takeoff
        </Link>
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
          <Link href={href({ prices: !showPrices })} className={buttonClasses("secondary", "sm")}>
            {showPrices ? "Hide prices" : "Show prices"}
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
          Quantities include waste. Items used by several conditions are combined and rounded up once on the total. Prices are this job&apos;s costs, before markup.
        </p>
      </div>

      {lines.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nothing to list yet" description="Measure conditions on your plans; their assembly items show up here." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Item</Th>
              <Th>SKU / vendor</Th>
              <Th>Used in</Th>
              <Th right>Qty</Th>
              <Th>Unit</Th>
              {showPrices ? (
                <>
                  <Th right>Unit cost</Th>
                  <Th right>Extended</Th>
                </>
              ) : null}
            </tr>
          </THead>
          {groups.map(([category, rows]) => (
            <TBody key={category}>
              <tr className="bg-slate-50/70">
                <td colSpan={showPrices ? 7 : 5} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {category}
                </td>
              </tr>
              {rows.map((l) => (
                <Tr key={l.key}>
                  <Td className="font-medium text-slate-900">
                    {l.name}
                    {l.pieces ? <span className="ml-1.5 text-xs font-normal text-slate-500">({l.pieces} {l.pieces === 1 ? "pc" : "pcs"})</span> : null}
                  </Td>
                  <Td className="text-xs text-slate-500">{[l.sku, l.vendor].filter(Boolean).join(" · ") || "—"}</Td>
                  <Td className="text-xs text-slate-500">{l.usedIn.join(", ")}</Td>
                  <Td right>{num(l.quantity)}</Td>
                  <Td>{l.unit}</Td>
                  {showPrices ? (
                    <>
                      <Td right>{money(l.unitCost)}</Td>
                      <Td right>{money(l.extended)}</Td>
                    </>
                  ) : null}
                </Tr>
              ))}
            </TBody>
          ))}
          {showPrices ? (
            <TFoot>
              <tr>
                <td colSpan={6} className="px-4 py-2.5">
                  Total material &amp; labor cost
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{money(total)}</td>
              </tr>
            </TFoot>
          ) : null}
        </Table>
      )}

      {cutLists.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="label">Framing cut lists</p>
          <p className="mb-2 text-xs text-slate-500">Members laid out on the plans, by stock length (priced through their assembly items above).</p>
          <ul className="space-y-1 text-sm text-slate-700">
            {cutLists.map((c) => (
              <li key={c.condition}>
                <span className="font-medium text-slate-900">{c.condition}</span>
                {c.size ? ` (${c.size})` : ""}: {c.pieces.map(([len, n]) => `${n} @ ${c.exact ? feetInches(len) : `${num(len)}'`}`).join(" · ")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

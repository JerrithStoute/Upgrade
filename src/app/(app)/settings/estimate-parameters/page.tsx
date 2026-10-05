import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadParameters } from "@/lib/estimate-parameters";
import { formulaRefs } from "@/lib/formula";
import { ParametersForm } from "@/components/estimate/parameters-form";

export const metadata = { title: "Estimate parameters" };

export default async function EstimateParametersPage() {
  await requireAdmin();
  const [params, est, tpl] = await Promise.all([
    loadParameters(),
    db.estimateItem.findMany({ where: { OR: [{ qtyFormula: { not: null } }, { costFormula: { not: null } }] }, select: { qtyFormula: true, costFormula: true } }),
    db.estimateTemplateItem.findMany({ where: { OR: [{ qtyFormula: { not: null } }, { costFormula: { not: null } }] }, select: { qtyFormula: true, costFormula: true } }),
  ]);
  // How many items (estimates and templates) use each parameter.
  const usage: Record<string, number> = {};
  for (const i of [...est, ...tpl]) for (const id of new Set([...formulaRefs(i.qtyFormula ?? ""), ...formulaRefs(i.costFormula ?? "")])) usage[id] = (usage[id] ?? 0) + 1;
  return <ParametersForm initial={params} usage={usage} />;
}

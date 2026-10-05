import { requireAdmin } from "@/lib/auth";
import { activeCostCodes } from "@/lib/projects";
import { loadEstimateCategories } from "@/lib/estimate-categories";
import { codeDivisions } from "@/lib/cost-code-divisions";
import { DivisionsForm } from "@/components/estimate/divisions-form";

export const metadata = { title: "Estimate divisions" };

export default async function EstimateDivisionsPage() {
  await requireAdmin();
  const [cats, codes] = await Promise.all([loadEstimateCategories(), activeCostCodes()]);
  return (
    <DivisionsForm
      initial={cats.map((c) => ({ name: c.name, divisions: c.divisions.map((d) => d.division) }))}
      categories={codeDivisions(codes).map(([d, list]) => ({ name: d, codes: list.length }))}
    />
  );
}

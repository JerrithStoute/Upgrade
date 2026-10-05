import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { buttonClasses } from "@/components/ui";
import { VendorList, type VendorGroup } from "@/components/vendor-list";
import { companyLines } from "@/lib/company";
import { getBrand } from "@/lib/company-brand";
import { compareMaterialNames } from "@/lib/takeoff";

/** Part of the Item List for a vendor — e.g. your framing items, to get current prices. No prices of yours print. */
export default async function VendorItemListPage() {
  await requireAdmin();
  const [items, company] = await Promise.all([
    db.materialItem.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }], select: { id: true, name: true, category: true, sku: true, unit: true } }),
    db.company.findFirst(),
  ]);
  const brand = await getBrand();
  const groups: VendorGroup[] = [];
  for (const i of items) {
    let g = groups.find((x) => x.category === i.category);
    if (!g) groups.push((g = { category: i.category, items: [] }));
    g.items.push({ key: i.id, name: i.name, sku: i.sku, qty: null, unit: i.unit });
  }
  // Lumber by size then length (2x12 × 8' before 2x12 × 10'), like the material list.
  for (const g of groups) g.items.sort((a, b) => compareMaterialNames(a.name, b.name));
  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <Link href="/settings/items" className={buttonClasses("ghost", "sm")}>
          <ArrowLeft className="h-3.5 w-3.5" /> Item List
        </Link>
        <span className="text-sm font-semibold text-slate-900">For a vendor</span>
        <span className="text-xs text-slate-500">— pick items to get prices on; your prices never print.</span>
      </div>
      <VendorList storageKey="vendorlist:items" title="Price request" from={companyLines(company)} groups={groups} emptyText="The Item List is empty." logoUrl={brand.logoUrl} />
    </div>
  );
}

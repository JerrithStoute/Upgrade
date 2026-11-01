import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadUnitParts } from "@/lib/unit-parts-server";
import { CATALOG_GROUPS } from "@/components/settings/settings-pages";
import { PageGroups } from "@/components/settings/page-groups";

export const metadata = { title: "Catalog" };

const many = (n: number, one: string, more = `${one}s`) => `${n.toLocaleString()} ${n === 1 ? one : more}`;

/** Catalog home: the lists and templates jobs are built from, with how many each holds. (The layout lets in only those who may see them.) */
export default async function CatalogHomePage() {
  await requireStaff();
  const [items, doors, windows, sizes, spans, takeoffs, estimates, schedules] = await Promise.all([
    db.materialItem.count(),
    loadUnitParts("door"),
    loadUnitParts("window"),
    db.memberSize.count(),
    db.spanTable.count(),
    db.takeoffTemplate.count(),
    db.estimateTemplate.count(),
    db.scheduleTemplate.count(),
  ]);
  const counts = {
    "/catalog/items": many(items, "item"),
    "/catalog/doors": many(doors.parts.length, "part"),
    "/catalog/windows": many(windows.parts.length, "part"),
    "/catalog/member-sizes": many(sizes, "size"),
    "/catalog/span-tables": many(spans, "table"),
    "/catalog/takeoff-templates": String(takeoffs),
    "/catalog/estimate-templates": String(estimates),
    "/catalog/schedule-templates": String(schedules),
  };
  return <PageGroups groups={CATALOG_GROUPS} counts={counts} />;
}

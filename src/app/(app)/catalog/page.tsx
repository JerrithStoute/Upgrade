import { requireStaff } from "@/lib/auth";
import { CATALOG_GROUPS } from "@/components/settings/settings-pages";
import { PageGroups } from "@/components/settings/page-groups";

export const metadata = { title: "Catalog" };

/** Catalog home: the lists and templates jobs are built from. (The layout lets in only those who may see them.) */
export default async function CatalogHomePage() {
  await requireStaff();
  return <PageGroups groups={CATALOG_GROUPS} />;
}

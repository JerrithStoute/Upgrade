import { requireView } from "@/lib/auth";
import { loadUnitParts } from "@/lib/unit-parts-server";
import { PartsEditor } from "@/components/catalog/parts-editor";

export const metadata = { title: "Windows" };

/** What a window is described by on a Windows takeoff: the parts, their choices, the usual one, and what goes in its name. */
export default async function WindowsCatalogPage() {
  await requireView("lists");
  const { parts } = await loadUnitParts("window");
  return <PartsEditor kind="window" initial={parts} />;
}

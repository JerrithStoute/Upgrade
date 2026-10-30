import { requireView } from "@/lib/auth";
import { loadUnitParts } from "@/lib/unit-parts-server";
import { PartsEditor } from "@/components/catalog/parts-editor";

export const metadata = { title: "Doors" };

/** What a door is described by on a Doors takeoff: the parts, their choices, the usual one, and what goes in its name. */
export default async function DoorsCatalogPage() {
  await requireView("lists");
  const { parts } = await loadUnitParts("door");
  return <PartsEditor kind="door" initial={parts} />;
}

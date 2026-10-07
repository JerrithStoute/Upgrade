"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { str, strOrNull } from "@/lib/utils";
import { SPAN_LOADS, SPAN_USES, SPECIES, parseSpanRows } from "@/lib/span-tables";
import { memberSizeFor, resizeFamily } from "@/lib/span-sizing";

const PATH = "/settings/span-tables";

async function tableFields(fd: FormData) {
  const name = str(fd, "name").replace(/\s+/g, " ");
  if (!name) throw new Error("Give the table a name");
  const use = str(fd, "use");
  if (!SPAN_USES.some((u) => u.key === use)) throw new Error("Pick what it's for");
  const source = str(fd, "source") === "CODE" ? "CODE" : "CUSTOM";
  const species = str(fd, "species");
  const load = str(fd, "load");
  const rows = parseSpanRows(str(fd, "rows"));
  if (source === "CODE") {
    if (!SPECIES.some((s) => s.key === species)) throw new Error("Pick the lumber species and grade");
    if (!SPAN_LOADS.some((l) => l.key === load && l.use === use)) throw new Error("Pick the loads");
  } else if (!rows.length) throw new Error('Add at least one row ("up to 12 ft → 2x6")');
  const overSize = strOrNull(fd, "overSize");
  // The sizes it names are member sizes (made if you typed a new one).
  for (const size of [...rows.map((r) => r.size), ...(overSize ? [overSize] : [])]) await memberSizeFor(size);
  return { name, use, source, species: source === "CODE" ? species : "", load: source === "CODE" ? load : "", rows: JSON.stringify(source === "CUSTOM" ? rows : []), overSize };
}

export async function createSpanTable(fd: FormData) {
  await requireAdmin();
  const data = await tableFields(fd);
  const last = await db.spanTable.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  const t = await db.spanTable.create({ data: { ...data, sortOrder: (last?.sortOrder ?? -1) + 1 } });
  revalidatePath(PATH);
  redirect(`${PATH}#table-${t.id}`);
}

/** Takeoffs sizing by it are sized again (shapes you sized yourself stay). */
export async function updateSpanTable(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  if (!(await db.spanTable.findUnique({ where: { id }, select: { id: true } }))) throw new Error("Span table not found");
  await db.spanTable.update({ where: { id }, data: await tableFields(fd) });
  const users = await db.takeoffCondition.findMany({ where: { spanTableId: id }, select: { id: true, projectId: true, sizeGroup: true } });
  const seen = new Set<string>();
  for (const c of users) {
    const family = `${c.projectId}:${c.sizeGroup ?? c.id}`;
    if (seen.has(family)) continue;
    seen.add(family);
    await resizeFamily(c.projectId, c.id);
  }
  revalidatePath(PATH);
  redirect(`${PATH}#table-${id}`);
}

/** Takeoffs using it keep the sizes they have; new shapes take the takeoff's own size. */
export async function deleteSpanTable(fd: FormData) {
  await requireAdmin();
  await db.spanTable.delete({ where: { id: str(fd, "id") } });
  revalidatePath(PATH);
  redirect(PATH);
}

"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEdit } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { buildMaterialList } from "@/lib/takeoff-materials";
import { inventoryItemFor, pullToJob, returnFromJob, undoMove } from "@/lib/inventory";
import { money, str } from "@/lib/utils";
import { itemNameKey } from "@/lib/takeoff";

const page = (projectId: string) => `/projects/${projectId}/materials/inventory`;

function revalidate(projectId: string) {
  revalidatePath(`/projects/${projectId}/materials`, "layout");
  revalidatePath(`/projects/${projectId}/budget`);
  revalidatePath(`/projects/${projectId}/bids`, "layout");
  revalidatePath("/inventory");
  revalidatePath("/reports", "layout");
}

/** "Pull from inventory before ordering?" — yes (to the inventory screen) or no (order everything). */
export const answerInventory = friendly(async function answerInventory(fd: FormData) {
  await requireEdit("takeoffs");
  const project = await getProject(str(fd, "projectId"));
  const yes = str(fd, "answer") === "YES";
  await db.project.update({ where: { id: project.id }, data: { inventoryAnswer: yes ? "YES" : "NO" } });
  revalidate(project.id);
  redirect(yes ? page(project.id) : `/projects/${project.id}/materials`);
});

/** Pulls what you picked (pull:<inventory item> = how many; line:<item> = the Material list line it covers). */
export const pullFromInventory = friendly(async function pullFromInventory(fd: FormData) {
  const user = await requireEdit("takeoffs");
  const project = await getProject(str(fd, "projectId"));
  const wanted: { itemId: string; qty: number; lineKey: string | null }[] = [];
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("pull:")) continue;
    const qty = Number(v);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const itemId = k.slice(5);
    wanted.push({ itemId, qty, lineKey: str(fd, `line:${itemId}`) || null });
  }
  if (!wanted.length) throw new Error("Type how many of something to pull");
  // Check them all before pulling any.
  const items = await db.inventoryItem.findMany({ where: { id: { in: wanted.map((w) => w.itemId) } }, include: { materialItem: { select: { name: true } } } });
  for (const w of wanted) {
    const it = items.find((i) => i.id === w.itemId);
    if (!it) throw new Error("That item isn't in inventory any more");
    if (w.qty > it.onHand + 1e-9) throw new Error(`Only ${it.onHand} ${it.unit} of ${it.materialItem?.name ?? it.name} on hand`);
  }
  let value = 0;
  for (const w of wanted) {
    const it = items.find((i) => i.id === w.itemId)!;
    value += w.qty * it.avgCost;
    await pullToJob(project.id, w.itemId, w.qty, w.lineKey, user.id);
  }
  await db.project.update({ where: { id: project.id }, data: { inventoryAnswer: "YES" } });
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "inventory.pull",
    description: `Pulled ${wanted.length} item${wanted.length === 1 ? "" : "s"} from inventory (${money(value)})`,
  });
  revalidate(project.id);
  redirect(`${page(project.id)}?pulled=${wanted.length}`);
});

/** Leftovers back on the shelf, credited to the job at what they cost it. */
export const returnLeftovers = friendly(async function returnLeftovers(fd: FormData) {
  const user = await requireEdit("takeoffs");
  const project = await getProject(str(fd, "projectId"));
  const name = str(fd, "item");
  const qty = Number(str(fd, "quantity"));
  if (!name) throw new Error("Which item?");
  if (!Number.isFinite(qty) || qty <= 0) throw new Error("How many?");
  const { lines } = await buildMaterialList(project.id);
  const line = lines.find((l) => itemNameKey(l.name) === itemNameKey(name));
  const item = await inventoryItemFor({ materialItemId: line?.materialItemId ?? null, name, unit: str(fd, "unit") || line?.unit });
  const typed = str(fd, "unitCost");
  // What it cost the job: what you typed, else the job's price for it, else the Item List's, else what stock is worth.
  const mat = item.materialItemId ? await db.materialItem.findUnique({ where: { id: item.materialItemId }, select: { unitCost: true } }) : null;
  const unitCost = typed !== "" && Number.isFinite(Number(typed)) ? Number(typed) : (line?.unitCost ?? mat?.unitCost ?? item.avgCost);
  await returnFromJob(project.id, item.id, qty, unitCost, user.id);
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "inventory.return",
    description: `Returned ${qty} ${item.unit} ${item.name} to inventory (${money(qty * unitCost)} credit)`,
  });
  revalidate(project.id);
  redirect(`${page(project.id)}#leftovers`);
});

/** Put back a pull, or take back a return — its charge or credit comes off the job. */
export const undoInventoryMove = friendly(async function undoInventoryMove(fd: FormData) {
  const user = await requireEdit("takeoffs");
  const project = await getProject(str(fd, "projectId"));
  await undoMove(str(fd, "id"), project.id);
  await logActivity({ projectId: project.id, userId: user.id, type: "inventory.undo", description: "Inventory pull / return undone" });
  revalidate(project.id);
  redirect(page(project.id) + (str(fd, "anchor") ? `#${str(fd, "anchor")}` : ""));
});

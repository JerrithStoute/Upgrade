"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEdit } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { deleteUpload } from "@/lib/uploads";
import { paperTypes } from "@/lib/paperwork-server";
import { readWho } from "@/lib/paperwork";
import { str } from "@/lib/utils";

const PATH = "/vendors/paperwork";
const MAX_TYPES = 20;

function done(note: string) {
  revalidatePath("/vendors", "layout");
  revalidatePath("/dashboard");
  redirect(`${PATH}?saved=${encodeURIComponent(note)}`);
}

const cleanName = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 60);

/** A kind of paper of your own (Contractor agreement, Business license…). */
export const addPaperType = friendly(async function addPaperType(fd: FormData) {
  const user = await requireEdit("lists");
  const name = cleanName(str(fd, "name"));
  if (!name) throw new Error("Name it — Contractor agreement, Business license…");
  const types = await paperTypes();
  const had = types.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (had) throw new Error(`You already have ${had.name}`);
  if (types.length >= MAX_TYPES) throw new Error(`That's ${MAX_TYPES} kinds already — take one off first`);
  await db.paperworkType.create({
    data: { name, expires: str(fd, "expires") === "on", usual: str(fd, "usual") === "on", sortOrder: Math.max(0, ...types.map((t) => t.sortOrder)) + 1 },
  });
  await logActivity({ userId: user.id, type: "vendor.paperwork", description: `Paperwork kind added: ${name}` });
  done(`${name} added`);
});

/** A kind's name, whether it expires, and whether new vendors start needing it. */
export const savePaperType = friendly(async function savePaperType(fd: FormData) {
  await requireEdit("lists");
  const types = await paperTypes();
  const type = types.find((t) => t.id === str(fd, "id"));
  if (!type) throw new Error("That kind isn't there any more — reload the page");
  const name = cleanName(str(fd, "name")) || type.name;
  const clash = types.find((t) => t.id !== type.id && t.name.toLowerCase() === name.toLowerCase());
  if (clash) throw new Error(`You already have ${clash.name}`);
  await db.paperworkType.update({
    where: { id: type.id },
    // Insurance always expires; a W-9 never does.
    data: { name, usual: str(fd, "usual") === "on", expires: type.kind === "INSURANCE" ? true : type.kind === "W9" ? false : str(fd, "expires") === "on" },
  });
  done(`${name} saved`);
});

/** Takes one of your own kinds off — with the files vendors had on it. */
export const deletePaperType = friendly(async function deletePaperType(fd: FormData) {
  const user = await requireEdit("lists");
  const type = await db.paperworkType.findUnique({ where: { id: str(fd, "id") }, include: { docs: { select: { storagePath: true } } } });
  if (!type) return done("Removed");
  if (type.kind) throw new Error(`${type.name} is built in — untick "New vendors need it" instead, and untick it on any vendor you don't need it from`);
  await db.paperworkType.delete({ where: { id: type.id } });
  for (const d of type.docs) if (d.storagePath) await deleteUpload(d.storagePath);
  await logActivity({ userId: user.id, type: "vendor.paperwork", description: `Paperwork kind removed: ${type.name}` });
  done(`${type.name} removed`);
});

/** Who handles subs' paperwork — shown with each line on the dashboard. */
export const setPaperworkOwner = friendly(async function setPaperworkOwner(fd: FormData) {
  await requireEdit("lists");
  const who = readWho(JSON.stringify(fd.getAll("to").map(String))).filter((w) => !w.startsWith("role:"));
  const company = await db.company.findFirst({ select: { id: true } });
  if (company) await db.company.update({ where: { id: company.id }, data: { paperworkOwner: JSON.stringify(who) } });
  done("Saved who handles paperwork");
});

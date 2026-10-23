"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendly } from "@/lib/friendly-action";
import { requireEdit } from "@/lib/auth";
import { db } from "@/lib/db";
import { str } from "@/lib/utils";
import { readDoorDetails, withDoorDetail } from "@/lib/door-list";

const PATH = "/settings/doors";

async function save(change: (list: ReturnType<typeof readDoorDetails>) => ReturnType<typeof readDoorDetails>) {
  const company = await db.company.findFirst({ select: { id: true, doorDetails: true } });
  if (!company) throw new Error("Set up your company first (Settings)");
  const list = change(readDoorDetails(company.doorDetails));
  await db.company.update({ where: { id: company.id }, data: { doorDetails: list.length ? JSON.stringify(list) : null } });
  revalidatePath(PATH);
}

/** A detail every door has, past size, int / ext, type, jamb and core — "Door Swing" (typed in) or a yes / no. */
export const addDoorDetail = friendly(async function addDoorDetail(fd: FormData) {
  await requireEdit("lists");
  await save((list) => {
    const next = withDoorDetail(list, str(fd, "name"), str(fd, "kind"));
    if (typeof next === "string") throw new Error(next);
    return next;
  });
  redirect(PATH);
});

/** Takes a detail off (doors already made keep it in their name). */
export const removeDoorDetail = friendly(async function removeDoorDetail(fd: FormData) {
  await requireEdit("lists");
  const name = str(fd, "name");
  await save((list) => list.filter((d) => d.name !== name));
  redirect(PATH);
});

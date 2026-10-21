"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { friendly } from "@/lib/friendly-action";
import { requireEdit } from "@/lib/auth";
import { db } from "@/lib/db";
import { str } from "@/lib/utils";
import { readWindowDetails, withDetail } from "@/lib/window-list";

const PATH = "/settings/windows";

async function save(change: (list: ReturnType<typeof readWindowDetails>) => ReturnType<typeof readWindowDetails>) {
  const company = await db.company.findFirst({ select: { id: true, windowDetails: true } });
  if (!company) throw new Error("Set up your company first (Settings)");
  const list = change(readWindowDetails(company.windowDetails));
  await db.company.update({ where: { id: company.id }, data: { windowDetails: list.length ? JSON.stringify(list) : null } });
  revalidatePath(PATH);
}

/** A detail every window has, past size, type and black — "Grids" (yes / no) or "Glass" (typed in). */
export const addWindowDetail = friendly(async function addWindowDetail(fd: FormData) {
  await requireEdit("lists");
  await save((list) => {
    const next = withDetail(list, str(fd, "name"), str(fd, "kind"));
    if (typeof next === "string") throw new Error(next);
    return next;
  });
  redirect(PATH);
});

/** Takes a detail off (windows already made keep it in their name). */
export const removeWindowDetail = friendly(async function removeWindowDetail(fd: FormData) {
  await requireEdit("lists");
  const name = str(fd, "name");
  await save((list) => list.filter((d) => d.name !== name));
  redirect(PATH);
});

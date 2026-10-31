"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { NOTIFY_DEFS, readRules, withRule, type Rules } from "@/lib/notify-rules";
import { readWho } from "@/lib/paperwork";
import { str } from "@/lib/utils";

const PATH = "/settings/notifications";

async function save(rules: Rules) {
  const company = await db.company.findFirst({ select: { id: true } });
  if (!company) throw new Error("Set up your company first");
  // Every one written: once anything is chosen, nothing falls back to how it was before.
  await db.company.update({ where: { id: company.id }, data: { notifyRules: JSON.stringify(rules) } });
  revalidatePath(PATH);
}

/** One email: on or off, and who gets it. */
export const saveNotifyRule = friendly(async function saveNotifyRule(fd: FormData) {
  const admin = await requireAdmin();
  const def = NOTIFY_DEFS.find((d) => d.key === str(fd, "key"));
  if (!def) throw new Error("That email isn't one the program sends");
  const on = str(fd, "on") === "on";
  const to = readWho(JSON.stringify(fd.getAll("to").map(String))).filter((w) => !w.startsWith("role:") || def.roles.some((r) => `role:${r.key}` === w));
  if (on && def.audience === "team" && !to.length) throw new Error(`Pick who gets "${def.label}" — or turn it off`);
  const c = await db.company.findFirst({ select: { notifyRules: true } });
  await save(withRule(readRules(c?.notifyRules).rules, def.key, { on, to }));
  await logActivity({ userId: admin.id, type: "company.notify", description: `"${def.label}" email ${on ? "on" : "off"}` });
  redirect(`${PATH}?saved=${def.key}#${def.key}`);
});

/** Every automatic email off at once (who each would go to is kept, for turning one back on). */
export const allNotifyOff = friendly(async function allNotifyOff() {
  const admin = await requireAdmin();
  const c = await db.company.findFirst({ select: { notifyRules: true } });
  const { rules } = readRules(c?.notifyRules);
  await save(Object.fromEntries(Object.entries(rules).map(([k, r]) => [k, { ...r, on: false }])));
  await logActivity({ userId: admin.id, type: "company.notify", description: "Every automatic email turned off" });
  redirect(`${PATH}?saved=all`);
});

"use server";

import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { runAsCompany } from "@/lib/tenant";
import { parseTimeRules, timeRulesSchema, type TimeRules } from "@/lib/time-rules";
import { repostAllLabor } from "@/lib/time-clock";
import { str } from "@/lib/utils";

const num = (fd: FormData, k: string) => {
  const v = Number(str(fd, k));
  return Number.isFinite(v) ? v : NaN;
};

/**
 * The time clock rules. A change to how hours or overtime count works out every week's labor on
 * the Budget again (in the background) — so old weeks and new ones are counted the same way.
 */
export const saveTimeRules = friendly(async function saveTimeRules(fd: FormData) {
  const admin = await requireAdmin();
  const on = (k: string) => fd.get(k) === "on";
  const company = await db.company.findFirst({ select: { timeRules: true } });
  const was = parseTimeRules(company?.timeRules);
  const limit = (k: string, label: string) => {
    if (!on(`${k}On`)) return null;
    const v = num(fd, k);
    if (!(v >= 1 && v <= 168)) throw new Error(`Put in the hours for ${label}`);
    return v;
  };
  const rules: TimeRules = timeRulesSchema.parse({
    weekStart: Math.round(num(fd, "weekStart")),
    hoursFormat: str(fd, "hoursFormat") === "CLOCK" ? "CLOCK" : "DECIMAL",
    weeklyAfter: limit("weeklyAfter", "weekly overtime"),
    dailyAfter: limit("dailyAfter", "daily overtime"),
    doubleAfter: limit("doubleAfter", "double time"),
    overtimeTimes: num(fd, "overtimeTimes"),
    doubleTimes: num(fd, "doubleTimes"),
    rounding: Number(str(fd, "rounding")),
    lunchMinutes: on("lunchOn") ? Math.round(num(fd, "lunchMinutes")) : 0,
    lunchAfter: num(fd, "lunchAfter"),
    longShiftHours: on("longShiftHoursOn") ? num(fd, "longShiftHours") : null,
    siteFeet: Math.round(num(fd, "siteFeet")),
  });
  if (rules.dailyAfter != null && rules.doubleAfter != null && rules.doubleAfter <= rules.dailyAfter) throw new Error("Double time starts after daily overtime — make its hours higher");
  await db.company.updateMany({ data: { timeRules: JSON.stringify(rules) } });
  await logActivity({ userId: admin.id, type: "company.updated", description: "Changed the time clock settings" });
  const counts = (r: TimeRules) => JSON.stringify([r.weekStart, r.weeklyAfter, r.dailyAfter, r.doubleAfter, r.overtimeTimes, r.doubleTimes, r.rounding, r.lunchMinutes, r.lunchAfter]);
  if (counts(rules) !== counts(was)) void runAsCompany(admin.companyId, () => repostAllLabor()).catch((err) => console.error("[time clock] reposting labor failed:", err));
  revalidatePath("/", "layout");
  redirect("/settings/time-clock?saved=rules");
});

/** Pay rates, salaried, and the labor burden. Applies to time clocked from now on (time already worked keeps the rate it was worked at). */
export const saveTimePay = friendly(async function saveTimePay(fd: FormData) {
  const admin = await requireAdmin();
  const burden = num(fd, "laborBurden");
  if (!(burden >= 0 && burden <= 200)) throw new Error("The burden is a percent of pay — usually between 10 and 40");
  const people = await db.user.findMany({ where: { role: { in: ["ADMIN", "STAFF", "SUB"] } }, select: { id: true } });
  for (const p of people) {
    if (!fd.has(`pay_${p.id}`)) continue;
    const raw = str(fd, `pay_${p.id}`);
    const rate = raw ? Math.round(Math.max(0, Number(raw) || 0) * 100) / 100 || null : null;
    await db.user.update({ where: { id: p.id }, data: { payRate: rate, salaried: fd.get(`salaried_${p.id}`) === "on" } });
  }
  await db.company.updateMany({ data: { laborBurden: burden } });
  await logActivity({ userId: admin.id, type: "company.updated", description: "Changed pay rates / labor burden" });
  revalidatePath("/settings/time-clock");
  redirect("/settings/time-clock?saved=pay#pay");
});

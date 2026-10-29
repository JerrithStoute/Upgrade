"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { db, systemDb } from "@/lib/db";
import { kindsFor, pushOffList, pushToEmails, type PushKind } from "@/lib/push";

/** This phone (or browser) gets notifications for me. Re-saving the same one just keeps it. */
export async function savePushDevice(sub: { endpoint: string; keys: { p256dh: string; auth: string } }, label: string) {
  const me = await requireUser();
  const endpoint = String(sub?.endpoint ?? "");
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !sub.keys?.p256dh || !sub.keys?.auth) throw new Error("That device didn't give a usable address");
  // One device, one person: if someone else signed in on it before (any company), it's mine now.
  await systemDb.pushDevice.deleteMany({ where: { endpoint, NOT: { userId: me.id } } });
  await db.pushDevice.upsert({
    where: { companyId_endpoint: { companyId: me.companyId, endpoint } },
    create: { userId: me.id, endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, label: label.slice(0, 40) || null },
    update: { userId: me.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, label: label.slice(0, 40) || null },
  });
  revalidatePath("/account");
}

/** Notifications off on this phone. */
export async function removePushDevice(endpoint: string) {
  const me = await requireUser();
  await db.pushDevice.deleteMany({ where: { endpoint: String(endpoint ?? ""), userId: me.id } });
  revalidatePath("/account");
}

/** Which kinds of notifications I get (the rest turned off). */
export async function setPushKinds(on: PushKind[]) {
  const me = await requireUser();
  const mine = kindsFor(me.role);
  const off = mine.filter((k) => !on.includes(k));
  await db.user.update({ where: { id: me.id }, data: { pushOff: off.length ? JSON.stringify(off) : null } });
  revalidatePath("/account");
}

/** A test notification to my devices. */
export async function sendTestPush(): Promise<{ sent: number }> {
  const me = await requireUser();
  const user = await db.user.findUnique({ where: { id: me.id }, select: { pushOff: true } });
  // (A test comes through even with "New messages" turned off.)
  const kind: PushKind = kindsFor(me.role).find((k) => !pushOffList(user?.pushOff).includes(k)) ?? "MESSAGES";
  const sent = await pushToEmails([me.email], kind, { title: "Notifications are on", body: "This is how you'll hear when something's waiting for you.", url: "/account" });
  return { sent };
}

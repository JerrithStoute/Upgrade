"use server";

import { revalidatePath } from "next/cache";
import { systemDb } from "@/lib/db";
import { getStationUser, stationLog } from "@/lib/station-auth";
import { BUILDER_STATUSES, STATUS_LABEL, type BuilderStatus } from "@/lib/builder-status";
import { fmtDate } from "@/lib/utils";

export type BuilderFormState = { error?: string; ok?: string } | undefined;

/** A builder's status (and trial end) — the owner's call: Paused locks the whole company out. */
export async function setBuilderStatus(_prev: BuilderFormState, fd: FormData): Promise<BuilderFormState> {
  const me = await getStationUser();
  if (me?.role !== "OWNER") return { error: "Only an owner changes a builder's status" };
  const companyId = String(fd.get("companyId") ?? "");
  const status = String(fd.get("status") ?? "") as BuilderStatus;
  if (!BUILDER_STATUSES.includes(status)) return { error: "Pick a status" };
  const ends = String(fd.get("trialEndsAt") ?? "");
  const trialEndsAt = status === "TRIAL" && /^\d{4}-\d{2}-\d{2}$/.test(ends) ? new Date(`${ends}T23:59:00`) : null;
  if (status === "TRIAL" && !trialEndsAt) return { error: "Give the trial an end date" };
  const company = await systemDb.company.findUnique({ where: { id: companyId }, select: { name: true, station: { select: { status: true } } } });
  if (!company) return { error: "That builder isn't here any more" };
  await systemDb.stationBuilder.upsert({ where: { companyId }, create: { companyId, status, trialEndsAt }, update: { status, trialEndsAt } });
  const was = company.station?.status ?? "ACTIVE";
  await stationLog(
    me.id,
    "builder.status",
    `${me.name} set ${company.name} to ${STATUS_LABEL[status]}${trialEndsAt ? ` until ${fmtDate(trialEndsAt)}` : ""}${was !== status ? ` (was ${STATUS_LABEL[was as BuilderStatus] ?? was})` : ""}`,
    companyId,
  );
  revalidatePath(`/station/builders/${companyId}`);
  revalidatePath("/station/builders");
  return { ok: status === "PAUSED" ? "Paused — nobody at this company can sign in now." : "Saved." };
}

/** The Station's own notes about a builder (anyone at the Station). Never shown to the builder. */
export async function saveBuilderNotes(_prev: BuilderFormState, fd: FormData): Promise<BuilderFormState> {
  const me = await getStationUser();
  if (!me) return { error: "Sign in to the Station again" };
  const companyId = String(fd.get("companyId") ?? "");
  const notes = String(fd.get("notes") ?? "").slice(0, 20_000).trim() || null;
  const company = await systemDb.company.findUnique({ where: { id: companyId }, select: { name: true } });
  if (!company) return { error: "That builder isn't here any more" };
  await systemDb.stationBuilder.upsert({ where: { companyId }, create: { companyId, notes }, update: { notes } });
  await stationLog(me.id, "builder.notes", `${me.name} updated the notes on ${company.name}`, companyId);
  revalidatePath(`/station/builders/${companyId}`);
  return { ok: "Notes saved." };
}

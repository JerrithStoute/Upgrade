"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { biddableLines, isLadderLine, ladderLines, parsePrice, priceLadders, readBidWorkbook } from "@/lib/bids";
import { isJobLocked, setItemPrice } from "@/lib/job-prices";
import { saveUpload } from "@/lib/uploads";
import { str } from "@/lib/utils";
import { itemNameKey, substituteLength } from "@/lib/takeoff";
import { addSubstitution } from "@/lib/substitutions";
import { newItemPlacement } from "@/lib/item-codes";
import { cleanVendorName, vendorCodes, vendorKey } from "@/lib/vendors";

const bidsPath = (projectId: string) => `/projects/${projectId}/bids`;

function revalidateBids(projectId: string) {
  revalidatePath(bidsPath(projectId), "layout");
  revalidatePath(`/projects/${projectId}/files`);
  revalidatePath(`/projects/${projectId}/materials`);
  revalidatePath(`/projects/${projectId}/estimate`, "layout");
  revalidatePath(`/projects/${projectId}/takeoff`, "layout");
}

/**
 * Makes a bid for each vendor picked: the Material list items picked, as they are now.
 * You download its Excel file (or PDF) to send; only the vendor's returned file goes in the job's Files.
 */
export async function requestBids(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const itemKeys = new Set(fd.getAll("item").map(String));
  const vendorIds = Array.from(new Set(fd.getAll("vendor").map(String)));
  const note = str(fd, "note").slice(0, 2000) || null;
  if (!itemKeys.size) redirect(`${bidsPath(project.id)}?error=${encodeURIComponent("Pick what to send")}`);
  if (!vendorIds.length) redirect(`${bidsPath(project.id)}?error=${encodeURIComponent("Pick at least one vendor")}`);
  const [vendors, lines] = await Promise.all([db.vendor.findMany({ where: { id: { in: vendorIds } } }), biddableLines(project.id)]);
  const picked = lines.filter((l) => itemKeys.has(l.key));
  if (!picked.length) redirect(`${bidsPath(project.id)}?error=${encodeURIComponent("Those items aren't on the Material list any more — reload and pick again")}`);
  const codeCount = new Set(picked.map((l) => l.codeKey)).size;
  const ladder = fd.get("ladder") === "1" ? await ladderLines(await priceLadders(project.id, lines), picked) : [];
  if (!vendors.length) redirect(`${bidsPath(project.id)}?error=${encodeURIComponent("That vendor isn't on your vendor list any more — reload the page and pick again")}`);
  const afterLock = await isJobLocked(project.id);
  const made: string[] = [];
  for (const v of vendors) {
    const last = await db.bid.findFirst({ where: { projectId: project.id }, orderBy: { number: "desc" }, select: { number: true } });
    const bid = await db.bid.create({
      data: {
        projectId: project.id,
        vendorId: v.id,
        vendorName: v.name,
        number: (last?.number ?? 0) + 1,
        afterLock,
        notes: note,
        lines: {
          create: [
            ...picked.map((l, i) => ({
              key: l.key,
              materialItemId: l.materialItemId,
              codeKey: l.codeKey,
              codeLabel: l.codeLabel,
              name: l.name,
              sku: l.sku,
              unit: l.unit,
              quantity: l.quantity,
              sortOrder: i,
            })),
            // The price ladder: the other lengths of the lumber sizes, a price per board each.
            ...ladder.map((l, i) => ({ ...l, sortOrder: picked.length + i })),
          ],
        },
      },
    });
    // Its Excel file is made when you download it (bids/[bidId]/excel) — the job's Files only keep what comes back.
    made.push(`#${bid.number} ${v.name}`);
  }
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "bid.requested",
    description: `Bid${made.length === 1 ? "" : "s"} ${made.join(", ")} — ${codeCount} cost code${codeCount === 1 ? "" : "s"}, ${picked.length} items${afterLock ? " (re-bid)" : ""}`,
  });
  revalidateBids(project.id);
  redirect(`${bidsPath(project.id)}?made=${made.length}#bids`);
}

/**
 * A vendor added while sending (no trip to Settings): saved to the vendor list with the
 * cost codes being sent as what they bid. A name you already have is that vendor —
 * its blank details filled in, the cost codes added.
 */
export async function quickAddVendor(input: { name: string; contact: string; email: string; phone: string; codes: string[] }) {
  await requireStaff();
  const name = cleanVendorName(input.name ?? "");
  if (!name) return { ok: false as const, error: "Type the vendor's name" };
  const email = (input.email ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, error: "That email doesn't look right" };
  const codes = (input.codes ?? []).map(String).slice(0, 500);
  const had = (await db.vendor.findMany()).find((v) => vendorKey(v.name) === vendorKey(name));
  const v = had
    ? await db.vendor.update({
        where: { id: had.id },
        data: {
          email: had.email ?? (email || null),
          phone: had.phone ?? (input.phone?.trim() || null),
          contact: had.contact ?? (input.contact?.trim() || null),
          costCodeIds: JSON.stringify(Array.from(new Set([...vendorCodes(had), ...codes]))),
        },
      })
    : await db.vendor.create({
        data: {
          name,
          email: email || null,
          phone: input.phone?.trim().slice(0, 60) || null,
          contact: input.contact?.trim().slice(0, 120) || null,
          costCodeIds: codes.length ? JSON.stringify(codes) : null,
        },
      });
  revalidatePath("/settings/vendors");
  return { ok: true as const, vendor: { id: v.id, name: v.name, email: v.email, codes: vendorCodes(v) } };
}

/**
 * A vendor's returned Excel file: matched to its bid by the hidden id inside (or the row you
 * uploaded it on), each line's price filled in, and the file kept in the job's Files.
 */
export async function importBid(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const back = (q: string) => redirect(`${bidsPath(project.id)}?${q}#bids`);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back(`error=${encodeURIComponent("Choose the file the vendor sent back")}`);
  const upload = file as File;
  let read: Awaited<ReturnType<typeof readBidWorkbook>>;
  try {
    read = await readBidWorkbook(Buffer.from(await upload.arrayBuffer()));
  } catch (e) {
    back(`error=${encodeURIComponent(e instanceof Error ? e.message : "Couldn't read that file")}`);
    return;
  }
  const rowBidId = str(fd, "bidId") || null;
  const bidId = read.bidId ?? rowBidId;
  const bid = bidId ? await db.bid.findFirst({ where: { id: bidId, projectId: project.id }, include: { lines: true } }) : null;
  // The id inside the file wins over the row it was uploaded on (it can't be put on the wrong bid).
  if (!bid) back(`error=${encodeURIComponent(read.bidId ? "That file is a bid for a different job." : "Couldn't tell which bid that file is — upload it on its bid's row.")}`);
  const b = bid!;
  const byId = new Map(b.lines.map((l) => [l.id, l]));
  let priced = 0;
  let ladderPriced = 0;
  for (const r of read.lines) {
    const line = byId.get(r.lineId);
    if (!line) continue;
    await db.bidLine.update({ where: { id: r.lineId }, data: { unitPrice: r.unitPrice, substitute: r.substitute, note: r.note } });
    if (r.unitPrice == null) continue;
    if (isLadderLine(line)) ladderPriced++;
    else priced++;
  }
  // Items (with quantities) are what counts; the price list lengths are extra.
  const items = b.lines.filter((l) => !isLadderLine(l)).length;
  const meta = await saveUpload(upload, project.id);
  const saved = await db.fileAsset.create({
    data: { ...meta, name: `Returned - ${meta.name}`.slice(0, 200), projectId: project.id, uploadedById: user.id, folder: "Bids", clientVisible: false },
  });
  await db.bid.update({
    where: { id: b.id },
    data: { status: priced + ladderPriced > 0 ? "RECEIVED" : b.status, receivedAt: priced + ladderPriced > 0 ? new Date() : b.receivedAt, returnFileId: saved.id },
  });
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "bid.imported",
    description: `Bid #${b.number} (${b.vendorName}) back — ${priced} of ${items} items priced${ladderPriced ? `, ${ladderPriced} price list lengths` : ""}`,
  });
  revalidateBids(project.id);
  back(`imported=${b.id}&priced=${priced}&blank=${items - priced}&ladder=${ladderPriced}`);
}

/** Prices typed in by hand (a bid phoned in or written on the printout). */
export async function saveBidPrices(fd: FormData) {
  await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const bid = await db.bid.findFirst({ where: { id: str(fd, "bidId"), projectId: project.id }, include: { lines: true } });
  if (!bid) throw new Error("Bid not found");
  let priced = 0;
  for (const l of bid.lines) {
    if (!fd.has(`price_${l.id}`)) continue;
    const price = parsePrice(str(fd, `price_${l.id}`));
    if (price != null) priced++;
    if (price !== l.unitPrice) await db.bidLine.update({ where: { id: l.id }, data: { unitPrice: price } });
  }
  await db.bid.update({
    where: { id: bid.id },
    data: priced > 0 ? { status: "RECEIVED", receivedAt: bid.receivedAt ?? new Date() } : { status: "SENT", receivedAt: null },
  });
  revalidateBids(project.id);
  redirect(`${bidsPath(project.id)}/${bid.id}?saved=1`);
}

/** Removes a bid (its files stay in the job's Files). Prices already taken from it stay. */
export async function deleteBid(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const bid = await db.bid.findFirst({ where: { id: str(fd, "bidId"), projectId: project.id }, select: { id: true, number: true, vendorName: true } });
  if (bid) {
    await db.bid.delete({ where: { id: bid.id } });
    await logActivity({ projectId: project.id, userId: user.id, type: "bid.deleted", description: `Bid #${bid.number} (${bid.vendorName}) deleted` });
  }
  revalidateBids(project.id);
  redirect(`${bidsPath(project.id)}#bids`);
}

/** The Item List entry for a lumber length ("2x6 × 18'"), added the way the takeoff adds lumber when it's new. */
async function lumberItemFor(name: string) {
  const nameKey = itemNameKey(name);
  const had = await db.materialItem.findUnique({ where: { nameKey }, select: { id: true } });
  if (had) return had.id;
  const [place, company] = await Promise.all([newItemPlacement("framing lumber"), db.company.findFirst({ select: { defaultMarkup: true } })]);
  const item = await db.materialItem.create({
    data: {
      name,
      nameKey,
      category: place.category,
      kind: place.kind,
      unit: "ea",
      unitCost: 0,
      markupPct: company?.defaultMarkup ?? 20,
      roundUp: true,
      costCodeId: place.costCodeId,
    },
  });
  return item.id;
}

/**
 * The bids you picked, one per cost code: their prices go on this job only (JOB), or into
 * the Item List for every job (COMPANY) — with the vendor's name on the items. A locked job
 * keeps its prices on COMPANY (Price review brings them in); JOB changes it, as asked.
 *
 * A line the vendor quoted a substitute for is never priced as the item you asked for: you
 * choose first (the page asks) — "use theirs" substitutes it on this job at their price
 * (substitutions.ts), "keep mine" leaves that line's price out.
 */
export async function takeBids(fd: FormData) {
  const user = await requireStaff();
  const project = await getProject(str(fd, "projectId"));
  const scope = str(fd, "scope") === "COMPANY" ? "COMPANY" : "JOB";
  const locked = await isJobLocked(project.id);
  const picks = Array.from(fd.entries())
    .filter(([k, v]) => k.startsWith("pick:") && typeof v === "string" && v)
    .map(([k, v]) => ({ codeKey: k.slice(5), bidId: String(v) }));
  const awards = await db.bidAward.findMany({ where: { projectId: project.id } });
  const changed = picks.filter((p) => awards.find((a) => a.codeKey === p.codeKey)?.bidId !== p.bidId || fd.has("reapply"));
  if (!changed.length) redirect(`${bidsPath(project.id)}?error=${encodeURIComponent("Pick a bid for a cost code first")}#compare`);

  // Substitutes on the picked bids: ask what to do with each before anything is priced.
  const subLines = await db.bidLine.findMany({
    where: { OR: changed.map((p) => ({ bidId: p.bidId, codeKey: p.codeKey })), unitPrice: { not: null }, substitute: { not: null } },
    select: { id: true },
  });
  if (subLines.some((l) => !["use", "keep"].includes(str(fd, `sub:${l.id}`)))) {
    const ask = { picks: changed, scope, reapply: fd.has("reapply") };
    redirect(`${bidsPath(project.id)}?confirm=${encodeURIComponent(JSON.stringify(ask))}#substitutes`);
  }

  let items = 0;
  let skipped = 0;
  let subbed = 0;
  let keptOut = 0;
  const done: string[] = [];
  for (const p of changed) {
    const bid = await db.bid.findFirst({ where: { id: p.bidId, projectId: project.id }, include: { lines: { where: { codeKey: p.codeKey } } } });
    if (!bid) continue;
    for (const l of bid.lines) {
      if (l.unitPrice == null) continue;
      if (l.substitute) {
        if (str(fd, `sub:${l.id}`) !== "use") {
          keptOut++;
          continue;
        }
        const fromItemId = l.materialItemId ?? (await lumberItemFor(l.name));
        const length = substituteLength(l.name, l.substitute);
        await addSubstitution(project.id, {
          fromItemId,
          with: length ? { kind: "length", length } : { kind: "new", name: l.substitute, unit: l.unit },
          unitCost: l.unitPrice,
          source: `Bid #${bid.number}, ${bid.vendorName}`,
          listPrice: scope === "COMPANY",
          vendor: bid.vendorName,
        });
        subbed++;
        continue;
      }
      let materialItemId = l.materialItemId;
      if (!materialItemId && isLadderLine(l)) {
        // A price list length the Item List doesn't have yet: added there on "every job";
        // on "this job only" Cheapest packing reads it from the bid you took.
        if (scope === "JOB") continue;
        materialItemId = await lumberItemFor(l.name);
      }
      if (!materialItemId) {
        skipped++;
        continue;
      }
      if (scope === "JOB") await setItemPrice({ projectId: project.id, materialItemId, unitCost: l.unitPrice, pin: true });
      else {
        await db.materialItem.update({ where: { id: materialItemId }, data: { unitCost: l.unitPrice, vendor: bid.vendorName } }).catch(() => null);
        if (!locked)
          await db.takeoffAssemblyItem.updateMany({
            where: { materialItemId, condition: { projectId: project.id } },
            data: { unitCost: l.unitPrice, pricePinned: false },
          });
      }
      items++;
    }
    await db.bidAward.upsert({
      where: { projectId_codeKey: { projectId: project.id, codeKey: p.codeKey } },
      create: { projectId: project.id, codeKey: p.codeKey, bidId: bid.id, scope },
      update: { bidId: bid.id, scope, awardedAt: new Date() },
    });
    done.push(`${bid.lines[0]?.codeLabel ?? p.codeKey} → #${bid.number} ${bid.vendorName}`);
  }
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "bid.taken",
    description: `Took ${done.join("; ")} — ${items} prices ${scope === "JOB" ? "on this job only" : locked ? "into the Item List (job prices locked)" : "into the Item List for every job"}${subbed ? `, ${subbed} substitute${subbed === 1 ? "" : "s"} used` : ""}${keptOut ? `, ${keptOut} substitute${keptOut === 1 ? "" : "s"} turned down` : ""}`,
  });
  if (scope === "COMPANY") revalidatePath("/settings/items");
  revalidateBids(project.id);
  redirect(`${bidsPath(project.id)}?taken=${done.length}&items=${items}&skipped=${skipped}&subbed=${subbed}&kept=${keptOut}&scope=${scope}#compare`);
}

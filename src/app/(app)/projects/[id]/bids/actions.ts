"use server";

import { PRICE_CHECKED } from "@/lib/price-recheck";
import { friendly } from "@/lib/friendly-action";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEdit } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { logActivity } from "@/lib/activity";
import { bidWorkbook, biddableLines, isLadderLine, ladderLines, parsePrice, priceLadders, readBidWorkbook, returnedPrice } from "@/lib/bids";
import { beamLength, toPerLf } from "@/lib/bid-beams";
import { isJobLocked, setItemPrice } from "@/lib/job-prices";
import { saveUpload } from "@/lib/uploads";
import { fmtDate, money, str } from "@/lib/utils";
import { itemNameKey, substituteLength } from "@/lib/takeoff";
import { addSubstitution } from "@/lib/substitutions";
import { newItemPlacement } from "@/lib/item-codes";
import { cleanVendorName, vendorCodes, vendorKey } from "@/lib/vendors";
import { findOrAddVendor } from "@/lib/vendor-list";
import { bidEmail, bidEmailText, bidFileName, emailedBids, standardFromBody, subBidEmailText } from "@/lib/bid-email";
import { companyLines } from "@/lib/company";
import { appUrl, sendMail } from "@/lib/mail";
import { bidPdf } from "@/lib/bid-pdf";
import { makeBidLink } from "@/lib/bid-link";
import { codeLabelOf } from "@/lib/takeoff-materials";
import { PLAN_FOLDERS, putSubBidOnEstimate, readPlanIds, subAwardKey } from "@/lib/sub-bids";

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
export const requestBids = friendly(async function requestBids(fd: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const project = await getProject(str(fd, "projectId"));
  const itemKeys = new Set(fd.getAll("item").map(String));
  const vendorIds = Array.from(new Set(fd.getAll("vendor").map(String)));
  const note = str(fd, "note").slice(0, 2000) || null;
  if (!itemKeys.size) redirect(`${bidsPath(project.id)}?error=${encodeURIComponent("Pick what to send")}`);
  if (!vendorIds.length) redirect(`${bidsPath(project.id)}?error=${encodeURIComponent("Pick at least one vendor")}`);
  const [vendors, lines] = await Promise.all([db.vendor.findMany({ where: { id: { in: vendorIds } } }), biddableLines(project.id)]);
  const picked = lines.filter((l) => itemKeys.has(l.key));
  if (!picked.length)
    redirect(`${bidsPath(project.id)}?error=${encodeURIComponent("Those items aren't on the Material list any more — reload and pick again")}`);
  const codeCount = new Set(picked.map((l) => l.codeKey)).size;
  const ladder = fd.get("ladder") === "1" ? await ladderLines(await priceLadders(project.id, lines), picked) : [];
  if (!vendors.length)
    redirect(`${bidsPath(project.id)}?error=${encodeURIComponent("That vendor isn't on your vendor list any more — reload the page and pick again")}`);
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
});

/**
 * A vendor added while sending (no trip to Settings): saved to the vendor list with the
 * cost codes being sent as what they bid. A name you already have is that vendor —
 * its blank details filled in, the cost codes added.
 */
export async function quickAddVendor(input: { name: string; contact: string; email: string; phone: string; codes: string[] }) {
  await requireEdit("estimates", { costs: true });
  const r = await findOrAddVendor(input);
  if (!r.ok) return r;
  const v = r.vendor;
  revalidatePath("/vendors");
  return { ok: true as const, vendor: { id: v.id, name: v.name, email: v.email, contact: v.contact, phone: v.phone, codes: vendorCodes(v) } };
}

/**
 * A vendor's returned Excel file: matched to its bid by the hidden id inside (or the row you
 * uploaded it on), each line's price filled in, and the file kept in the job's Files.
 */
export const importBid = friendly(async function importBid(fd: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const project = await getProject(str(fd, "projectId"));
  const back = (q: string) => redirect(`${bidsPath(project.id)}?${q}#bids`);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) back(`error=${encodeURIComponent("Choose the file the vendor sent back")}`);
  const upload = file as File;
  // Not their Excel file (a PDF they wrote prices on, a photo of it): kept on the bid to look at and type
  // the prices off — on its own row, since only the Excel file knows which bid it is.
  if (!/\.xlsx$/i.test(upload.name)) {
    const rowBid = str(fd, "bidId")
      ? await db.bid.findFirst({ where: { id: str(fd, "bidId"), projectId: project.id }, select: { id: true, number: true, vendorName: true } })
      : null;
    if (!rowBid) back(`error=${encodeURIComponent("Add a PDF or photo on its bid's row (Add what they sent…), so it goes on the right bid.")}`);
    const meta = await saveUpload(upload, project.id);
    const saved = await db.fileAsset.create({
      data: { ...meta, name: `Returned - ${meta.name}`.slice(0, 200), projectId: project.id, uploadedById: user.id, folder: "Bids", clientVisible: false },
    });
    await db.bid.update({ where: { id: rowBid!.id }, data: { returnFileId: saved.id } });
    await logActivity({
      projectId: project.id,
      userId: user.id,
      type: "bid.file",
      description: `Bid #${rowBid!.number} (${rowBid!.vendorName}) — what they sent added: ${meta.name}`,
    });
    revalidateBids(project.id);
    redirect(`${bidsPath(project.id)}/${rowBid!.id}?attached=1`);
  }
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
  if (!bid)
    back(
      `error=${encodeURIComponent(read.bidId ? "That file is a bid for a different job." : "Couldn't tell which bid that file is — upload it on its bid's row.")}`,
    );
  const b = bid!;
  const byId = new Map(b.lines.map((l) => [l.id, l]));
  let priced = 0;
  let ladderPriced = 0;
  for (const r of read.lines) {
    const line = byId.get(r.lineId);
    if (!line) continue;
    // (A beam's price in the file is per beam: kept per lf.)
    await db.bidLine.update({ where: { id: r.lineId }, data: { unitPrice: returnedPrice(r, line), substitute: r.substitute, note: r.note } });
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
    data: {
      status: priced + ladderPriced > 0 ? "RECEIVED" : b.status,
      receivedAt: priced + ladderPriced > 0 ? new Date() : b.receivedAt,
      returnFileId: saved.id,
    },
  });
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "bid.imported",
    description: `Bid #${b.number} (${b.vendorName}) back — ${priced} of ${items} items priced${ladderPriced ? `, ${ladderPriced} price list lengths` : ""}`,
  });
  revalidateBids(project.id);
  back(`imported=${b.id}&priced=${priced}&blank=${items - priced}&ladder=${ladderPriced}`);
});

/** Prices typed in by hand (a bid phoned in or written on the printout). */
export const saveBidPrices = friendly(async function saveBidPrices(fd: FormData) {
  await requireEdit("estimates", { costs: true });
  const project = await getProject(str(fd, "projectId"));
  const bid = await db.bid.findFirst({ where: { id: str(fd, "bidId"), projectId: project.id }, include: { lines: true } });
  if (!bid) throw new Error("Bid not found");
  let priced = 0;
  for (const l of bid.lines) {
    if (!fd.has(`price_${l.id}`)) continue;
    // A beam: typed per beam or per lf, kept per lf.
    const price = toPerLf(parsePrice(str(fd, `price_${l.id}`)), str(fd, `basis_${l.id}`), beamLength(l));
    if (price != null) priced++;
    // A sub's trade: what's in their price and what isn't, typed in here too.
    const note = fd.has(`note_${l.id}`) ? str(fd, `note_${l.id}`).slice(0, 2000) || null : l.note;
    // What they quoted instead, typed in here (their price is for that).
    const substitute = fd.has(`sub_${l.id}`) ? str(fd, `sub_${l.id}`).replace(/\s+/g, " ").slice(0, 300) || null : l.substitute;
    if (price !== l.unitPrice || note !== l.note || substitute !== l.substitute)
      await db.bidLine.update({ where: { id: l.id }, data: { unitPrice: price, note, substitute } });
  }
  await db.bid.update({
    where: { id: bid.id },
    data: priced > 0 ? { status: "RECEIVED", receivedAt: bid.receivedAt ?? new Date() } : { status: "SENT", receivedAt: null },
  });
  revalidateBids(project.id);
  redirect(`${bidsPath(project.id)}/${bid.id}?saved=1`);
});

/** Removes a bid (its files stay in the job's Files). Prices already taken from it stay. */
export const deleteBid = friendly(async function deleteBid(fd: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const project = await getProject(str(fd, "projectId"));
  const bid = await db.bid.findFirst({ where: { id: str(fd, "bidId"), projectId: project.id }, select: { id: true, number: true, vendorName: true } });
  if (bid) {
    await db.bid.delete({ where: { id: bid.id } });
    await logActivity({ projectId: project.id, userId: user.id, type: "bid.deleted", description: `Bid #${bid.number} (${bid.vendorName}) deleted` });
  }
  revalidateBids(project.id);
  redirect(`${bidsPath(project.id)}#bids`);
});

/** The Item List entry for a lumber length ("2x6 × 18'"), added the way the takeoff adds lumber when it's new. */
async function lumberItemFor(name: string) {
  const nameKey = itemNameKey(name);
  const had = await db.materialItem.findFirst({ where: { nameKey }, select: { id: true } });
  if (had) return had.id;
  const place = await newItemPlacement("framing lumber");
  const item = await db.materialItem.create({
    data: {
      name,
      nameKey,
      category: place.category,
      kind: place.kind,
      unit: "ea",
      unitCost: 0,
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
export const takeBids = friendly(async function takeBids(fd: FormData) {
  const user = await requireEdit("estimates", { costs: true });
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
    // Beams: every length of a size is one Item List item, priced per lf — it takes the average over
    // the feet bought (an 18' and a 24' quoted at different rates per foot).
    const beamFeet = new Map<string, { lf: number; cost: number }>();
    for (const l of bid.lines)
      if (l.unitPrice != null && !l.substitute && l.materialItemId && beamLength(l)) {
        const b = beamFeet.get(l.materialItemId) ?? { lf: 0, cost: 0 };
        b.lf += l.quantity;
        b.cost += l.quantity * l.unitPrice;
        beamFeet.set(l.materialItemId, b);
      }
    const beamPrice = new Map([...beamFeet].map(([id, b]) => [id, b.lf > 0 ? Math.round((b.cost / b.lf) * 10000) / 10000 : 0]));
    const beamDone = new Set<string>();
    for (const l of bid.lines) {
      if (l.unitPrice == null) continue;
      if (l.substitute) {
        if (str(fd, `sub:${l.id}`) !== "use") {
          keptOut++;
          continue;
        }
        const fromItemId = l.materialItemId ?? (await lumberItemFor(l.name));
        // (A beam is one Item List item for every length: its substitute is a product, not another length.)
        const length = beamLength(l) ? null : substituteLength(l.name, l.substitute);
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
      // A beam size: its average per lf, once.
      const unitCost = beamPrice.get(materialItemId) ?? l.unitPrice;
      if (beamPrice.has(materialItemId)) {
        if (beamDone.has(materialItemId)) {
          items++;
          continue;
        }
        beamDone.add(materialItemId);
      }
      if (scope === "JOB") await setItemPrice({ projectId: project.id, materialItemId, unitCost, pin: true });
      else {
        await db.materialItem.update({ where: { id: materialItemId }, data: { unitCost, vendor: bid.vendorName, ...PRICE_CHECKED() } }).catch(() => null);
        if (!locked)
          await db.takeoffAssemblyItem.updateMany({
            where: { materialItemId, condition: { projectId: project.id } },
            data: { unitCost, pricePinned: false },
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
  if (scope === "COMPANY") revalidatePath("/catalog/items");
  revalidateBids(project.id);
  redirect(`${bidsPath(project.id)}?taken=${done.length}&items=${items}&skipped=${skipped}&subbed=${subbed}&kept=${keptOut}&scope=${scope}#compare`);
});

// --- Send to subs -----------------------------------------------------------------------------

/**
 * Send to subs: a bid for each sub picked — the trades (cost codes) picked, one line each for their price,
 * with the job's plans picked (they open them from the bid's page) and when it's due. Each one's email window
 * opens next, to read over and send.
 */
export const requestSubBids = friendly(async function requestSubBids(fd: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const project = await getProject(str(fd, "projectId"));
  const back = (msg: string) => redirect(`${bidsPath(project.id)}?error=${encodeURIComponent(msg)}#subs`);
  const codeIds = Array.from(new Set(fd.getAll("code").map(String)));
  const vendorIds = Array.from(new Set(fd.getAll("vendor").map(String)));
  if (!codeIds.length) back("Pick the trade (cost code) to bid");
  if (!vendorIds.length) back("Pick at least one sub");
  const [codes, vendors, files] = await Promise.all([
    db.costCode.findMany({ where: { id: { in: codeIds } }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
    db.vendor.findMany({ where: { id: { in: vendorIds } } }),
    db.fileAsset.findMany({ where: { id: { in: fd.getAll("plan").map(String) }, projectId: project.id, folder: { in: PLAN_FOLDERS } }, select: { id: true } }),
  ]);
  if (!codes.length) back("That cost code isn't on your list any more — reload and pick again");
  if (!vendors.length) back("That sub isn't on your vendor list any more — reload and pick again");
  // (Midday: the same date in every US time zone.)
  const due = /^\d{4}-\d{2}-\d{2}$/.test(str(fd, "due")) ? new Date(`${str(fd, "due")}T12:00:00Z`) : null;
  const note = str(fd, "note").slice(0, 2000) || null;
  const afterLock = await isJobLocked(project.id);
  const made: string[] = [];
  const madeIds: string[] = [];
  for (const v of vendors) {
    const last = await db.bid.findFirst({ where: { projectId: project.id }, orderBy: { number: "desc" }, select: { number: true } });
    const bid = await db.bid.create({
      data: {
        projectId: project.id,
        vendorId: v.id,
        vendorName: v.name,
        number: (last?.number ?? 0) + 1,
        kind: "SUB",
        afterLock,
        dueAt: due,
        notes: note,
        planFileIds: files.length ? JSON.stringify(files.map((f) => f.id)) : null,
        lines: {
          create: codes.map((c, i) => ({
            key: `trade:${c.id}`,
            codeKey: c.id,
            codeLabel: codeLabelOf(c),
            name: codeLabelOf(c),
            unit: "ls",
            quantity: 1,
            sortOrder: i,
          })),
        },
      },
    });
    made.push(`#${bid.number} ${v.name}`);
    madeIds.push(bid.id);
  }
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "bid.requested",
    description: `Sub bid${made.length === 1 ? "" : "s"} ${made.join(", ")} — ${codes.map(codeLabelOf).join(", ")}${files.length ? `, ${files.length} plan file${files.length === 1 ? "" : "s"}` : ""}`,
  });
  revalidateBids(project.id);
  // Their email windows open on the page, one after another, to read over and send.
  redirect(`${bidsPath(project.id)}?made=${made.length}&subs=1&open=${madeIds.join(",")}#bids`);
});

/**
 * The subs' bids you picked, one per trade: marked as the one taken (closing that bid's page) — and, when
 * asked, its price put on the job's estimate as that cost code's line (sub-bids.ts).
 */
export const takeSubBids = friendly(async function takeSubBids(fd: FormData) {
  const user = await requireEdit("estimates", { costs: true });
  const project = await getProject(str(fd, "projectId"));
  const toBudget = fd.get("budget") === "1";
  const picks = Array.from(fd.entries())
    .filter(([k, v]) => k.startsWith("pick:") && typeof v === "string" && v)
    .map(([k, v]) => ({ codeKey: k.slice(5), bidId: String(v) }));
  const awards = await db.bidAward.findMany({ where: { projectId: project.id, codeKey: { in: picks.map((p) => subAwardKey(p.codeKey)) } } });
  const changed = picks.filter((p) => {
    const a = awards.find((x) => x.codeKey === subAwardKey(p.codeKey));
    return a?.bidId !== p.bidId || (toBudget && a.scope !== "BUDGET");
  });
  if (!changed.length) redirect(`${bidsPath(project.id)}?error=${encodeURIComponent("Pick a sub's bid for a trade first")}#subcompare`);
  const done: string[] = [];
  const notes: string[] = [];
  for (const p of changed) {
    const bid = await db.bid.findFirst({ where: { id: p.bidId, projectId: project.id, kind: "SUB" }, include: { lines: { where: { codeKey: p.codeKey } } } });
    const line = bid?.lines[0];
    if (!bid || !line || line.unitPrice == null) continue;
    const total = line.unitPrice * line.quantity;
    let scope = "AWARD";
    if (toBudget) {
      const r = await putSubBidOnEstimate(project.id, {
        codeKey: p.codeKey,
        codeLabel: line.codeLabel,
        total,
        vendorName: bid.vendorName,
        bidNumber: bid.number,
      });
      if (r.ok) {
        scope = "BUDGET";
        notes.push(`${line.codeLabel}: ${money(total)} on estimate v${r.version}${r.was != null ? ` (was ${money(r.was)})` : " (new line)"}`);
      } else notes.push(`${line.codeLabel}: not put in the budget — ${r.why}`);
    }
    await db.bidAward.upsert({
      where: { projectId_codeKey: { projectId: project.id, codeKey: subAwardKey(p.codeKey) } },
      create: { projectId: project.id, codeKey: subAwardKey(p.codeKey), bidId: bid.id, scope },
      update: { bidId: bid.id, scope, awardedAt: new Date() },
    });
    done.push(`${line.codeLabel} → #${bid.number} ${bid.vendorName} (${money(total)})`);
  }
  if (!done.length) redirect(`${bidsPath(project.id)}?error=${encodeURIComponent("That bid has no price for the trade yet")}#subcompare`);
  await logActivity({
    projectId: project.id,
    userId: user.id,
    type: "bid.taken",
    description: `Took ${done.join("; ")}${notes.length ? ` — ${notes.join("; ")}` : ""}`,
  });
  revalidateBids(project.id);
  revalidatePath(`/projects/${project.id}/budget`);
  const msg = `Took ${done.join("; ")}.${notes.length ? ` ${notes.join(". ")}.` : ""}`;
  redirect(`${bidsPath(project.id)}?subTaken=${encodeURIComponent(msg)}#subcompare`);
});

// --- Emailing bids from the program ---------------------------------------------------------

type Sent = { ok: true; to: string; at: string } | { error: string };
/** How a bid email goes: the Excel file and PDF attached (or only on the online page), and a copy to the sender. */
type SendHow = { attach: boolean; copyMe: boolean };
const readHow = (h: Partial<SendHow> | undefined): SendHow => ({ attach: h?.attach === true, copyMe: h?.copyMe !== false });
const looksLikeEmail = (s: string) => /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(s);

/** One bid to its vendor: the message given, the bid's Excel file (prices blank) attached; noted on the job. */
async function emailBid(
  user: { id: string; email: string },
  project: Awaited<ReturnType<typeof getProject>>,
  bidId: string,
  mail: { to: string; subject?: string; body?: string },
  how: SendHow = { attach: false, copyMe: true },
): Promise<Sent> {
  const to = mail.to.trim().toLowerCase();
  if (!looksLikeEmail(to)) return { error: "Put in the vendor's email" };
  const [bid, company] = await Promise.all([
    db.bid.findFirst({
      where: { id: bidId, projectId: project.id },
      include: { lines: { orderBy: { sortOrder: "asc" } }, vendor: { select: { contact: true } } },
    }),
    db.company.findFirst(),
  ]);
  if (!bid) return { error: "That bid isn't here any more" };
  // A sub's bid: the plans are on its page (named in the email), nothing attached.
  const plans =
    bid.kind === "SUB"
      ? await db.fileAsset
          .findMany({ where: { id: { in: readPlanIds(bid.planFileIds) }, projectId: project.id }, select: { name: true } })
          .then((f) => f.map((x) => x.name))
      : null;
  const text =
    mail.subject && mail.body
      ? { subject: mail.subject.slice(0, 300), body: mail.body.slice(0, 20_000) }
      : plans
        ? subBidEmailText({
            bid,
            project,
            address: [project.address, [project.city, project.state].filter(Boolean).join(", ")].filter(Boolean).join(", "),
            contact: bid.vendor?.contact ?? null,
            from: companyLines(company),
            plans: plans.length,
          })
        : bidEmailText({
            bid,
            project,
            address: [project.address, [project.city, project.state].filter(Boolean).join(", ")].filter(Boolean).join(", "),
            contact: bid.vendor?.contact ?? null,
            from: companyLines(company),
            standard: company?.bidMessage,
          });
  // The link to type prices online always; the Excel file (prices blank) and the PDF attached only when
  // asked — a new sender's email with files lands in fewer inboxes (they're on the online page anyway).
  const [excel, pdf] =
    how.attach && !plans
      ? await Promise.all([
          bidWorkbook({ ...bid, lines: bid.lines.map((l) => ({ ...l, unitPrice: null })) }, project, company),
          bidPdf({
            bid,
            project,
            address: [project.address, [project.city, project.state].filter(Boolean).join(", ")].filter(Boolean).join(", "),
            from: companyLines(company),
            date: fmtDate(new Date()),
            replyTo: user.email,
          }),
        ])
      : [null, null];
  try {
    await sendMail(
      bidEmail({
        to,
        ...text,
        companyName: company?.name ?? "Your builder",
        replyTo: user.email,
        lines: bid.lines,
        attachments:
          excel && pdf
            ? [
                { filename: bidFileName(bid, project), content: Buffer.from(excel) },
                { filename: bidFileName(bid, project, "pdf"), content: Buffer.from(pdf) },
              ]
            : [],
        onlineUrl: appUrl(`/prices/${await makeBidLink(bid.id, bid.companyId)}`),
        copyTo: how.copyMe ? user.email : null,
        plans,
      }),
    );
  } catch (e) {
    console.error("Bid email not sent:", e);
    return { error: "The email didn't go out — try again in a minute, or use “Open in my email”." };
  }
  await logActivity({ projectId: project.id, userId: user.id, type: "bid.emailed", description: `Emailed bid #${bid.number} (${bid.vendorName}) to ${to}` });
  return { ok: true, to, at: new Date().toISOString() };
}

/** "Send" in a bid's email window: sends it from the program, as you see it (files attached or not, a copy to you or not). */
export async function sendBidEmail(input: {
  projectId: string;
  bidId: string;
  to: string;
  subject: string;
  body: string;
  how?: Partial<SendHow>;
}): Promise<Sent> {
  const user = await requireEdit("estimates", { costs: true });
  const project = await getProject(String(input.projectId));
  if (!String(input.subject ?? "").trim() || !String(input.body ?? "").trim()) return { error: "Give the email a subject and a message" };
  const r = await emailBid(
    user,
    project,
    String(input.bidId),
    { to: String(input.to ?? ""), subject: String(input.subject), body: String(input.body) },
    readHow(input.how),
  );
  if ("ok" in r) revalidatePath(bidsPath(project.id));
  return r;
}

/**
 * "Email all": every bid on the job that hasn't been emailed yet and isn't back, to its vendor's email
 * on file, with the usual message. Vendors with no email are listed (open their bid's email to add one).
 */
export async function sendAllBidEmails(input: {
  projectId: string;
  how?: Partial<SendHow>;
}): Promise<{ sent: string[]; skipped: string[]; failed: string[] } | { error: string }> {
  const user = await requireEdit("estimates", { costs: true });
  const project = await getProject(String(input.projectId));
  const [bids, activity] = await Promise.all([
    db.bid.findMany({
      where: { projectId: project.id, status: { not: "RECEIVED" } },
      orderBy: { number: "asc" },
      select: { id: true, number: true, vendorName: true, vendor: { select: { email: true } } },
    }),
    db.activity.findMany({
      where: { projectId: project.id, type: "bid.emailed" },
      orderBy: { createdAt: "desc" },
      select: { description: true, createdAt: true },
    }),
  ]);
  const done = emailedBids(activity);
  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: string[] = [];
  for (const b of bids.filter((b) => !done.has(b.number))) {
    const to = b.vendor?.email?.trim() ?? "";
    if (!looksLikeEmail(to)) {
      skipped.push(b.vendorName);
      continue;
    }
    const r = await emailBid(user, project, b.id, { to }, readHow(input.how));
    ("ok" in r ? sent : failed).push(b.vendorName);
  }
  if (sent.length) revalidatePath(bidsPath(project.id));
  return { sent, skipped, failed };
}

/**
 * "Use as my standard message" in a bid's email window: your words from it (between the greeting and the
 * job) go in every bid email from now on — Directory → Subs & vendors shows them, to change or clear.
 */
export async function saveBidMessage(input: { projectId: string; bidId: string; body: string }): Promise<{ ok: true; message: string } | { error: string }> {
  await requireEdit("estimates", { costs: true });
  const project = await getProject(String(input.projectId));
  const bid = await db.bid.findFirst({ where: { id: String(input.bidId), projectId: project.id }, select: { notes: true } });
  const message = standardFromBody(String(input.body ?? "").slice(0, 20_000), bid?.notes ?? null);
  if (!message) return { error: "Write your message first — what goes between the greeting and the job." };
  const company = await db.company.findFirst({ select: { id: true } });
  if (!company) return { error: "Set up your company first (Settings)." };
  await db.company.update({ where: { id: company.id }, data: { bidMessage: message } });
  revalidatePath(bidsPath(project.id));
  revalidatePath("/vendors");
  return { ok: true, message };
}

/** A vendor's name, contact, email and phone, changed right on Send to vendors (Directory → Subs & vendors has the rest). */
export async function quickEditVendor(input: { id: string; name: string; contact: string; email: string; phone: string }) {
  await requireEdit("estimates", { costs: true });
  const name = cleanVendorName(input.name ?? "");
  if (!name) return { ok: false as const, error: "Type the vendor's name" };
  const email = (input.email ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false as const, error: "That email doesn't look right" };
  const all = await db.vendor.findMany();
  const me = all.find((v) => v.id === String(input.id));
  if (!me) return { ok: false as const, error: "That vendor isn't here any more" };
  if (all.some((v) => v.id !== me.id && vendorKey(v.name) === vendorKey(name))) return { ok: false as const, error: `There's already a vendor called ${name}` };
  const v = await db.vendor.update({
    where: { id: me.id },
    data: { name, email: email || null, phone: input.phone?.trim().slice(0, 60) || null, contact: input.contact?.trim().slice(0, 120) || null },
  });
  revalidatePath("/vendors");
  return { ok: true as const, vendor: { id: v.id, name: v.name, email: v.email, contact: v.contact, phone: v.phone, codes: vendorCodes(v) } };
}

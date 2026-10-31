import "server-only";
import { db } from "./db";
import { paperLines, paperworkWarning, problems, readNeeds, readWho, ymd, type PaperLine, type PaperType } from "./paperwork";
import { fmtDate } from "./utils";

/**
 * Loads vendor paperwork (paperwork.ts). The first time a company's is read, it's set up: W-9 and Insurance as
 * its kinds, every insurance certificate it had moved onto the Insurance line, and the vendors whose insurance
 * it was tracking needing both (the rest — suppliers — nothing). Once, even with two pages asking at once.
 */
export async function ensurePaperwork() {
  const company = await db.company.findFirst({ select: { id: true, paperworkReady: true } });
  if (!company || company.paperworkReady) return;
  await db.$transaction(async (tx) => {
    // Claims the set-up: a second request waits here, then finds it done.
    const claimed = await tx.company.updateMany({ where: { id: company.id, paperworkReady: false }, data: { paperworkReady: true } });
    if (!claimed.count) return;
    const w9 = await tx.paperworkType.create({ data: { name: "W-9", kind: "W9", expires: false, usual: true, sortOrder: 0 } });
    const ins = await tx.paperworkType.create({ data: { name: "Insurance", kind: "INSURANCE", expires: true, usual: true, sortOrder: 1 } });
    const vendors = await tx.vendor.findMany({
      select: { id: true, insuranceRequired: true, insurance: true, purchaseOrders: { where: { bidId: null, status: { not: "VOID" } }, select: { id: true }, take: 1 } },
    });
    const today = ymd(new Date());
    for (const v of vendors) {
      // Whose insurance it was asking for (what "Need their insurance?" said, or worked out).
      const tracked = v.insuranceRequired ?? (v.purchaseOrders.length > 0 || v.insurance.length > 0);
      await tx.vendor.update({ where: { id: v.id }, data: { paperwork: JSON.stringify(tracked ? { [w9.id]: today, [ins.id]: today } : {}) } });
      if (v.insurance.length)
        await tx.vendorDoc.createMany({
          data: v.insurance.map((c) => ({
            vendorId: v.id,
            typeId: ins.id,
            expiresAt: c.expiresAt,
            confirmed: c.confirmed,
            fileName: c.fileName,
            storagePath: c.storagePath,
            mimeType: c.mimeType,
            createdAt: c.createdAt,
          })),
        });
    }
  });
}

/** The company's paperwork kinds, in order. */
export async function paperTypes(): Promise<PaperType[]> {
  await ensurePaperwork();
  return db.paperworkType.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, kind: true, expires: true, usual: true, sortOrder: true } });
}

export type VendorPaperwork = { vendor: { id: string; name: string }; lines: PaperLine[]; problems: PaperLine[]; toConfirm: number };

/** Where every vendor's paperwork stands (or just `vendorIds`'). */
export async function vendorsPaperwork(vendorIds?: string[], today = new Date()): Promise<VendorPaperwork[]> {
  const types = await paperTypes();
  const vendors = await db.vendor.findMany({
    where: vendorIds ? { id: { in: vendorIds } } : undefined,
    orderBy: { name: "asc" },
    select: { id: true, name: true, paperwork: true, createdAt: true, docs: true },
  });
  return vendors.map((v) => {
    const lines = paperLines(types, readNeeds(v.paperwork, types, v.createdAt), v.docs, today);
    return { vendor: { id: v.id, name: v.name }, lines, problems: problems(lines), toConfirm: lines.reduce((n, l) => n + l.toConfirm, 0) };
  });
}

/** One vendor's (null: no vendor). */
export async function vendorPaperwork(vendorId: string | null | undefined, today = new Date()) {
  if (!vendorId) return null;
  return (await vendorsPaperwork([vendorId], today))[0] ?? null;
}

/** Who handles subs' paperwork, in words ("Sarah, Office manager"); "" when nobody's been picked. */
export async function paperworkOwnerText() {
  const company = await db.company.findFirst({ select: { paperworkOwner: true } });
  const who = readWho(company?.paperworkOwner);
  if (!who.length) return "";
  const ids = (kind: string) => who.filter((w) => w.startsWith(`${kind}:`)).map((w) => w.slice(kind.length + 1));
  const [people, positions] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids("user") }, active: true }, select: { id: true, name: true } }),
    db.position.findMany({ where: { id: { in: ids("pos") } }, select: { id: true, name: true } }),
  ]);
  return [...people.map((p) => p.name.split(" ")[0]), ...positions.map((p) => p.name)].join(", ");
}

/** Every vendor for a pick list, with the paperwork they owe as its note (VendorPick shows it under the list once picked). */
export async function vendorChoices(today = new Date()) {
  return (await vendorsPaperwork(undefined, today)).map((v) => ({ id: v.vendor.id, label: v.vendor.name, warn: paperworkWarning(v.lines, (d) => fmtDate(d, "MMM d")) }));
}

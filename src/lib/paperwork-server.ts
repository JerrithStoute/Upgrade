import "server-only";
import { db } from "./db";
import { STARTER_COVERAGES, paperLines, paperworkWarning, problems, readNeeds, readWho, ymd, type PaperLine, type PaperType } from "./paperwork";
import { fmtDate } from "./utils";

/**
 * Loads vendor paperwork (paperwork.ts). The first time a company's is read, it's set up (once, even with two
 * pages asking at once): the W-9, and insurance as one line per coverage (General liability, Workers' comp, Auto,
 * Umbrella). Every insurance certificate it had goes on its coverage's line with its carrier and policy #; the
 * vendors whose insurance it tracked need the W-9, General liability and Workers' comp; suppliers need nothing.
 * A company already set up with one "Insurance" line has that line split into coverages the same way.
 */
export async function ensurePaperwork() {
  const company = await db.company.findFirst({ select: { id: true, paperworkVersion: true } });
  if (!company || company.paperworkVersion >= 2) return;
  await db.$transaction(
    async (tx) => {
      // Claims the set-up: a second request waits here, then finds it done.
      const claimed = await tx.company.updateMany({ where: { id: company.id, paperworkVersion: { lt: 2 } }, data: { paperworkReady: true, paperworkVersion: 2 } });
      if (!claimed.count) return;
      const today = ymd(new Date());
      const certs = await tx.vendorInsurance.findMany();
      const oneLine = await tx.paperworkType.findFirst({ where: { kind: "INSURANCE", name: "Insurance" } });
      const w9 = (await tx.paperworkType.findFirst({ where: { kind: "W9" } })) ?? (await tx.paperworkType.create({ data: { name: "W-9", kind: "W9", expires: false, usual: true, sortOrder: 0 } }));
      // The builder's own kinds go after the coverages.
      await tx.paperworkType.updateMany({ where: { kind: null }, data: { sortOrder: { increment: 10 } } });
      const coverage = new Map<string, string>();
      for (const [i, c] of STARTER_COVERAGES.entries()) {
        const t = await tx.paperworkType.create({ data: { name: c.name, kind: "INSURANCE", expires: true, usual: oneLine ? oneLine.usual && c.usual : c.usual, sortOrder: 1 + i } });
        coverage.set(c.code, t.id);
      }
      if (certs.some((c) => !coverage.has(c.type))) {
        const t = await tx.paperworkType.create({ data: { name: "Other insurance", kind: "INSURANCE", expires: true, usual: false, sortOrder: 9 } });
        for (const c of certs) if (!coverage.has(c.type)) coverage.set(c.type, t.id);
      }
      const gl = coverage.get("GL")!;
      const wc = coverage.get("WC")!;
      const vendors = await tx.vendor.findMany({
        select: { id: true, paperwork: true, insuranceRequired: true, insurance: { select: { id: true } }, purchaseOrders: { where: { bidId: null, status: { not: "VOID" } }, select: { id: true }, take: 1 } },
      });
      for (const v of vendors) {
        let needs: Record<string, string> | null = null;
        if (oneLine) {
          // Needing "Insurance" becomes needing General liability and Workers' comp, from the same day.
          if (v.paperwork != null) {
            const had = JSON.parse(v.paperwork) as Record<string, string>;
            const since = had[oneLine.id];
            delete had[oneLine.id];
            needs = since ? { ...had, [gl]: since, [wc]: since } : had;
          }
        } else {
          // Whose insurance it was asking for (what "Need their insurance?" said, or worked out).
          const tracked = v.insuranceRequired ?? (v.purchaseOrders.length > 0 || v.insurance.length > 0);
          needs = tracked ? { [w9.id]: today, [gl]: today, [wc]: today } : {};
        }
        if (needs) await tx.vendor.update({ where: { id: v.id }, data: { paperwork: JSON.stringify(needs) } });
      }
      // Each certificate on its coverage's line, with its carrier and policy #.
      const docs = oneLine ? await tx.vendorDoc.findMany({ where: { typeId: oneLine.id } }) : [];
      const used = new Set<string>();
      for (const d of docs) {
        const cert = certs.find((c) => !used.has(c.id) && c.vendorId === d.vendorId && (d.storagePath ? c.storagePath === d.storagePath : c.createdAt.getTime() === d.createdAt.getTime()));
        if (cert) used.add(cert.id);
        await tx.vendorDoc.update({
          where: { id: d.id },
          data: { typeId: coverage.get(cert?.type ?? "GL") ?? gl, carrier: cert?.carrier ?? null, number: cert?.policyNumber ?? null },
        });
      }
      if (!oneLine && certs.length)
        await tx.vendorDoc.createMany({
          data: certs.map((c) => ({
            vendorId: c.vendorId,
            typeId: coverage.get(c.type) ?? gl,
            expiresAt: c.expiresAt,
            carrier: c.carrier,
            number: c.policyNumber,
            confirmed: c.confirmed,
            fileName: c.fileName,
            storagePath: c.storagePath,
            mimeType: c.mimeType,
            createdAt: c.createdAt,
          })),
        });
      if (oneLine) await tx.paperworkType.delete({ where: { id: oneLine.id } });
    },
    { timeout: 30_000 },
  );
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

import "server-only";
import { db } from "./db";
import { STARTER_POSITIONS, positionAccess } from "./access";

/**
 * The company's positions, in order. The first time anyone looks, the starting ones are made
 * (Staff, Project manager, Office / Bookkeeper, Estimator) and everyone on the team without a
 * position is put in Staff — exactly what they could do before positions existed.
 */
export async function companyPositions() {
  let rows = await db.position.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { users: true } } } });
  if (rows.length === 0) {
    await db.position.createMany({
      data: STARTER_POSITIONS.map((p, i) => ({ name: p.name, key: p.key, access: JSON.stringify(p.access), sortOrder: i })),
    });
    rows = await db.position.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { _count: { select: { users: true } } } });
  }
  const staff = rows.find((r) => r.key === "STAFF");
  if (staff) {
    const { count } = await db.user.updateMany({ where: { role: "STAFF", positionId: null }, data: { positionId: staff.id } });
    if (count) rows = rows.map((r) => (r.id === staff.id ? { ...r, _count: { users: r._count.users + count } } : r));
  }
  return rows.map((r) => ({ ...r, accessOf: positionAccess(r.access) }));
}

export type CompanyPosition = Awaited<ReturnType<typeof companyPositions>>[number];

/** Where someone new goes when nobody picked a position: Staff (or the first one). */
export async function defaultPositionId() {
  const rows = await companyPositions();
  return (rows.find((r) => r.key === "STAFF") ?? rows[0])?.id ?? null;
}

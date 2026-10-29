import "server-only";
import { systemDb } from "@/lib/db";
import { readStatus, type BuilderStatus } from "@/lib/builder-status";
import { usageByBuilder } from "@/lib/usage";

/** Station-wide figures about each builder company (the system login: counts and account facts only). */
export type BuilderRow = {
  id: string;
  name: string;
  where: string;
  signedUp: Date;
  status: BuilderStatus;
  trialEndsAt: Date | null;
  owner: { name: string; email: string } | null;
  team: number;
  jobs: number;
  storage: number;
  lastSignIn: Date | null;
  /** Anyone's last use of the program (usage.ts), and the team's days using it in the last 30. */
  lastActive: Date | null;
  activeDays: number;
};

const sumBy = <T extends { companyId: string }>(rows: T[], f: (r: T) => number) => new Map(rows.map((r) => [r.companyId, f(r)]));

export async function builderRows(onlyId?: string): Promise<BuilderRow[]> {
  const where = onlyId ? { companyId: onlyId } : {};
  const [companies, team, lastIn, jobs, files, owners, usage] = await Promise.all([
    systemDb.company.findMany({
      where: onlyId ? { id: onlyId } : {},
      select: { id: true, name: true, city: true, state: true, createdAt: true, station: { select: { status: true, trialEndsAt: true } } },
      orderBy: { createdAt: "desc" },
    }),
    systemDb.user.groupBy({ by: ["companyId"], where: { ...where, active: true, role: { in: ["ADMIN", "STAFF"] } }, _count: { _all: true } }),
    systemDb.user.groupBy({ by: ["companyId"], where, _max: { lastSignInAt: true } }),
    systemDb.project.groupBy({ by: ["companyId"], where, _count: { _all: true } }),
    systemDb.fileAsset.groupBy({ by: ["companyId"], where, _sum: { size: true } }),
    // The company's owner: its first admin.
    systemDb.user.findMany({ where: { ...where, role: "ADMIN" }, orderBy: { createdAt: "asc" }, distinct: ["companyId"], select: { companyId: true, name: true, email: true } }),
    usageByBuilder(),
  ]);
  const teamOf = sumBy(team, (r) => r._count._all);
  const jobsOf = sumBy(jobs, (r) => r._count._all);
  const filesOf = sumBy(files, (r) => r._sum.size ?? 0);
  const lastOf = new Map(lastIn.map((r) => [r.companyId, r._max.lastSignInAt]));
  const ownerOf = new Map(owners.map((o) => [o.companyId, { name: o.name, email: o.email }]));
  return companies.map((c) => ({
    id: c.id,
    name: c.name,
    where: [c.city, c.state].filter(Boolean).join(", "),
    signedUp: c.createdAt,
    status: readStatus(c.station?.status),
    trialEndsAt: c.station?.trialEndsAt ?? null,
    owner: ownerOf.get(c.id) ?? null,
    team: teamOf.get(c.id) ?? 0,
    jobs: jobsOf.get(c.id) ?? 0,
    storage: filesOf.get(c.id) ?? 0,
    lastSignIn: lastOf.get(c.id) ?? null,
    lastActive: usage.lastActive.get(c.id) ?? null,
    activeDays: usage.activeDays.get(c.id) ?? 0,
  }));
}

export function fmtSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export const STATUS_TONE: Record<BuilderStatus, string> = {
  TRIAL: "bg-amber-50 text-amber-800 ring-amber-200",
  ACTIVE: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  FREE: "bg-sky-50 text-sky-800 ring-sky-200",
  PAUSED: "bg-rose-50 text-rose-800 ring-rose-200",
};

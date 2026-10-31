import { readdirSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";
import { systemDb } from "../../src/lib/db";

/**
 * The workflow tests' own company — found by its name and its email, and removed with everything in it
 * (and what the Station kept about it: its log, usage counts, reports). Before a run (a stopped run's
 * leftovers) and after.
 */
export const FLOW_COMPANY = "Flow Test Builders";
export const FLOW_EMAIL = "flows@example.test";

export async function removeFlowCompany() {
  const users = await systemDb.user.findMany({ where: { email: { endsWith: "@example.test" }, OR: [{ email: FLOW_EMAIL }, { email: { startsWith: "flows-" } }] }, select: { companyId: true } });
  const companies = await systemDb.company.findMany({ where: { OR: [{ name: FLOW_COMPANY }, { id: { in: users.map((u) => u.companyId) } }] }, select: { id: true } });
  for (const { id } of companies) {
    // Its files (on this PC, in the uploads folder: each company's are under its id).
    rmSync(path.join(path.resolve(process.env.UPLOAD_DIR || "./uploads"), id), { recursive: true, force: true });
    await systemDb.stationLog.deleteMany({ where: { builderId: id } });
    await systemDb.stationUsage.deleteMany({ where: { builderId: id } });
    await systemDb.stationProblem.deleteMany({ where: { builderId: id } });
    await systemDb.company.delete({ where: { id } });
  }
  // Its sign-up and email limits, so the next run isn't turned away.
  await systemDb.rateLimit.deleteMany({ where: { OR: [{ key: { startsWith: "signup:" } }, { key: { contains: FLOW_EMAIL } }, { key: { startsWith: "problems." } }] } });
  // Its emails in the test inbox (.outbox).
  const outbox = path.join(process.cwd(), ".outbox");
  try {
    for (const f of readdirSync(outbox).filter((n) => n.endsWith(".json"))) {
      const file = path.join(outbox, f);
      if (readFileSync(file, "utf8").includes(FLOW_EMAIL)) unlinkSync(file);
    }
  } catch {
    /* no test inbox yet */
  }
  return companies.length;
}

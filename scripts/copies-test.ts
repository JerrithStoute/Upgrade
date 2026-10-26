/**
 * `npm run test:copies` — proves the app is safe to run as several copies at once (Render → Scaling):
 * two separate processes, sharing only the database, race for the same work.
 *
 *   1. Claims (job-lock.ts): both grab the same claim at the same moment, many times — exactly one wins
 *      each time; a claim that ran out is picked up; a held one isn't.
 *   2. Sign-in limits (rate-limit.ts): both count wrong tries for the same key — none are lost.
 *   3. A job's lines (walls.ts): both rework the same job's lines at once — no line is added twice.
 *      Only with TEST_JOB_ID set to a test job (its automatic lines are reworked, as a page load would).
 *
 * Leaves nothing behind (its claims and counts are cleared). Exits non-zero on any failure.
 */
import { spawn } from "child_process";
import path from "path";

const STUBS = path.join(__dirname, "stubs", "node_modules");
const failures: string[] = [];
const check = (ok: boolean, msg: string) => (ok ? console.log(`  ✓ ${msg}`) : (failures.push(msg), console.log(`  ✗ ${msg}`)));

/** Runs this script as a separate process ("a copy of the app") doing `task`; its last line is its answer. */
function copy(task: string, arg: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, __filename, "--copy", task, arg], {
      env: { ...process.env, NODE_PATH: STUBS },
      stdio: ["ignore", "pipe", "inherit"],
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("exit", (code) => (code === 0 ? resolve(out.trim().split("\n").pop() ?? "") : reject(new Error(`copy ${task} exited ${code}`))));
  });
}

// --- What each copy does ---------------------------------------------------------------------------

async function asCopy(task: string, arg: string) {
  const { claim } = await import("../src/lib/job-lock");
  const { recordFailure, failures: count } = await import("../src/lib/rate-limit");
  const { systemDb } = await import("../src/lib/db");
  if (task === "claims") {
    // Many rounds, each a fresh claim name; both copies start each round at the same wall-clock tick.
    const wins: number[] = [];
    for (let round = 0; round < 25; round++) {
      const at = Number(arg) + round * 120;
      await new Promise((r) => setTimeout(r, Math.max(0, at - Date.now())));
      const h = await claim(`copies-test:${round}`, 60_000);
      if (h) wins.push(round);
    }
    console.log(JSON.stringify(wins));
  } else if (task === "claim-one") {
    console.log((await claim(arg, 60_000)) ? "yes" : "no");
  } else if (task === "limits") {
    await Promise.all(Array.from({ length: 20 }, () => recordFailure(arg, 60_000)));
    console.log(String(await count(arg)));
  } else if (task === "lines") {
    const { syncAutoItems } = await import("../src/lib/walls");
    const { runAsCompany } = await import("../src/lib/tenant");
    const p = await systemDb.project.findUniqueOrThrow({ where: { id: arg }, select: { companyId: true } });
    await runAsCompany(p.companyId, () => syncAutoItems(arg));
    console.log("done");
  }
  await systemDb.$disconnect();
}

// --- The test --------------------------------------------------------------------------------------

async function main() {
  const { systemDb } = await import("../src/lib/db");
  try {
    console.log("1. Claims — two copies grab the same claim at the same moment, 25 times");
    const start = Date.now() + 4000;
    const [a, b] = await Promise.all([copy("claims", String(start)), copy("claims", String(start))]);
    const wa: number[] = JSON.parse(a);
    const wb: number[] = JSON.parse(b);
    const both = wa.filter((r) => wb.includes(r));
    const neither = Array.from({ length: 25 }, (_, r) => r).filter((r) => !wa.includes(r) && !wb.includes(r));
    check(both.length === 0, `never both (copy A won ${wa.length}, copy B ${wb.length})`);
    check(neither.length === 0, "always one");

    // A claim whose copy stopped (it ran out) is picked up; one still held isn't.
    await systemDb.jobLock.create({ data: { name: "copies-test:stale", holder: "a copy that stopped", until: new Date(Date.now() - 1000) } });
    await systemDb.jobLock.create({ data: { name: "copies-test:held", holder: "a copy still on it", until: new Date(Date.now() + 60_000) } });
    check((await copy("claim-one", "copies-test:stale")) === "yes", "a claim that ran out is picked up");
    check((await copy("claim-one", "copies-test:held")) === "no", "a claim still held isn't taken");

    console.log("2. Sign-in limits — two copies count 20 wrong tries each for the same key");
    const key = `copies-test:${Date.now()}`;
    const [ca, cb] = await Promise.all([copy("limits", key), copy("limits", key)]);
    const total = (await systemDb.rateLimit.findUnique({ where: { key } }))?.count ?? 0;
    check(total === 40, `all 40 counted (${total}; the copies saw ${ca} and ${cb})`);

    console.log("3. A job's lines — two copies rework the same job at once");
    const job = process.env.TEST_JOB_ID;
    if (!job) console.log("  (skipped — set TEST_JOB_ID to a test job's id)");
    else {
      const lines = () =>
        systemDb.takeoffAssemblyItem
          .findMany({ where: { condition: { projectId: job } }, select: { conditionId: true, metric: true } })
          .then((r) => r.filter((x) => x.metric.includes(":")));
      await Promise.all([copy("lines", job), copy("lines", job)]);
      const after = await lines();
      const keys = after.map((x) => `${x.conditionId}|${x.metric}`);
      const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
      check(dupes.length === 0, `no line added twice (${after.length} lines${dupes.length ? `; twice: ${dupes.slice(0, 3).join(", ")}` : ""})`);
    }
  } finally {
    await systemDb.jobLock.deleteMany({ where: { name: { startsWith: "copies-test:" } } });
    await systemDb.rateLimit.deleteMany({ where: { key: { startsWith: "copies-test:" } } });
    await systemDb.$disconnect();
  }
  console.log(failures.length ? `\n${failures.length} failed.` : "\nSafe to run as several copies.");
  process.exit(failures.length ? 1 : 0);
}

const at = process.argv.indexOf("--copy");
if (at >= 0) {
  const task = process.argv[at + 1];
  const arg = process.argv[at + 2];
  asCopy(task, arg).then(
    () => process.exit(0),
    (e) => {
      console.error(e);
      process.exit(1);
    },
  );
} else {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

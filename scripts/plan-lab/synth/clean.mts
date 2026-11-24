/**
 * Removes made-up training plans: all of them, or one batch.
 *   npm run synth:clean               everything in test-plans/_lab/synthetic
 *   npm run synth:clean -- batch-002  just that batch
 * Nothing is lost for good: every plan comes from its seed number and can be made again (npm run synth -- --start=…).
 */
import { existsSync, readdirSync, rmSync } from "fs";
import path from "path";

const ROOT = "test-plans/_lab/synthetic";
const which = process.argv[2];
if (!existsSync(ROOT)) {
  console.log("No made-up plans to remove.");
} else if (which) {
  if (!/^batch-\d+$/.test(which) || !existsSync(path.join(ROOT, which))) {
    console.log(`No batch called ${which}. There are: ${readdirSync(ROOT).join(", ") || "none"}`);
    process.exit(1);
  }
  rmSync(path.join(ROOT, which), { recursive: true, force: true });
  console.log(`Removed ${which}.`);
} else {
  const n = readdirSync(ROOT).length;
  rmSync(ROOT, { recursive: true, force: true });
  console.log(`Removed all made-up plans (${n} batch${n === 1 ? "" : "es"}).`);
}

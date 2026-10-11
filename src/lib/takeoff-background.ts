import "server-only";
import { after } from "next/server";
import { currentCompanyId, runAsCompany } from "./tenant";
import { resizeSheet } from "./span-sizing";
import { syncAutoItems } from "./walls";

/**
 * The slow follow-up after a takeoff change — joists sized again on sheets whose walls/beams
 * changed, and the job's lumber and material lines worked out again — done in the background,
 * after the save has been answered, so drawing doesn't wait for it. Changes made close together
 * share one pass. The plan's "Saving…" waits on settled() and then refreshes.
 */

type Queue = { sheets: Set<string>; waiting: boolean; running: Promise<void> | null };
const queues = new Map<string, Queue>();

async function work(projectId: string, companyId: string, q: Queue) {
  while (q.waiting) {
    q.waiting = false;
    const sheets = [...q.sheets];
    q.sheets.clear();
    try {
      await runAsCompany(companyId, async () => {
        for (const sheetId of sheets) await resizeSheet(projectId, sheetId, { sync: false });
        await syncAutoItems(projectId);
      });
    } catch (err) {
      console.error(`[takeoff] background update for job ${projectId} failed:`, err);
    }
  }
}

/** Queue the follow-up for this job (and joists sized again on these sheets). */
export async function refreshLater(projectId: string, resizeSheets: string[] = []) {
  const companyId = await currentCompanyId();
  const q = queues.get(projectId) ?? { sheets: new Set<string>(), waiting: false, running: null };
  queues.set(projectId, q);
  for (const s of resizeSheets) q.sheets.add(s);
  q.waiting = true;
  if (!q.running) {
    const run = work(projectId, companyId, q).finally(() => {
      q.running = null;
      if (!q.waiting && queues.get(projectId) === q) queues.delete(projectId);
    });
    q.running = run;
    // Keeps the server from treating the request as finished before this is done.
    after(() => run);
  }
}

/** Resolves once this job's background follow-up is done (at once when there's none). */
export async function settled(projectId: string) {
  for (let q = queues.get(projectId); q?.running; q = queues.get(projectId)) await q.running;
}

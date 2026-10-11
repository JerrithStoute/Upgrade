import { AsyncLocalStorage } from "async_hooks";

/**
 * Whether a job's lumber & material lines (walls.ts syncAutoItems) need working out again.
 *
 * Working them out is the slowest part of opening an estimate or material list, and most of the
 * time nothing has changed. So each job keeps two dates (Project.lumberChangedAt / lumberSyncedAt):
 * - any write to something the lines are worked out from (the models below) marks the company's
 *   jobs changed — db.ts does it for every write, so new features can't forget;
 * - a full working-out records when it started;
 * - opening a page redoes them only when the job changed after that (or it isn't known).
 * When unsure it redoes them: a mistake costs time, never a wrong number.
 */

/** What the lines are worked out from. A write to any of these marks the jobs changed. */
export const LUMBER_INPUTS = new Set([
  "TakeoffPlan",
  "TakeoffSheet",
  "TakeoffCondition",
  "TakeoffMeasurement",
  "TakeoffAssemblyItem",
  "MaterialItem",
  "ItemCodeRule",
  "SpanTable",
  "MemberSize",
  "JobSubstitution",
  "CostCode",
  "Project",
  "Company",
]);

const WRITES = /^(create|update|upsert|delete)/;

/** Does this database operation change what a job's lumber lines are worked out from? */
export const changesLumber = (model: string | undefined, operation: string) => !!model && LUMBER_INPUTS.has(model) && WRITES.test(operation);

/** Up to date: worked out since the last change. Unknown (never worked out) counts as not. */
export function lumberUpToDate(changedAt: Date | null, syncedAt: Date | null) {
  return !!syncedAt && (!changedAt || syncedAt.getTime() >= changedAt.getTime());
}

// The working-out's own writes aren't changes (or it would set itself off forever).
const g = globalThis as unknown as { __lumberQuiet?: AsyncLocalStorage<true> };
const quiet = (g.__lumberQuiet ??= new AsyncLocalStorage<true>());
export const whileWorkingOut = <T>(fn: () => Promise<T>) => quiet.run(true, fn);
export const workingOut = () => quiet.getStore() === true;

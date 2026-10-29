import { removeFlowCompany } from "./cleanup";

/** Before the run: the program must be running, and a stopped run's company is cleared away. */
export default async function globalSetup() {
  const url = process.env.FLOWS_URL || "http://localhost:3000";
  const up = await fetch(`${url}/api/health`).then((r) => r.ok).catch(() => false);
  if (!up) throw new Error(`The program isn't running at ${url} — start it (npm run dev), then run the workflow tests again.`);
  await removeFlowCompany();
}

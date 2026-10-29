import { systemDb } from "../../src/lib/db";
import { removeFlowCompany } from "./cleanup";

/** After the run: the test company and everything in it, gone. */
export default async function globalTeardown() {
  await removeFlowCompany();
  await systemDb.$disconnect();
}

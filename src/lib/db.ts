import { AsyncLocalStorage } from "async_hooks";
import { Prisma, PrismaClient } from "@prisma/client";
import { currentCompanyId } from "./tenant";
import { countQuery } from "./request-stats";

/**
 * The database, one company at a time.
 *
 * `db` is what the program uses everywhere. In front of it sits a gatekeeper: every
 * read, count, update and delete is limited to the current company (see tenant.ts),
 * and everything created — including rows created together, like an estimate with its
 * lines — is tagged with it. Another company's rows are simply "not found".
 *
 * The database checks it too: `db` signs in as the app's own login (DATABASE_URL),
 * which only ever sees the rows of the company named for each query (app.company_id —
 * see tenant-rules.ts). So even a mistake in the program can't reach another company.
 *
 * `systemDb` skips both (SYSTEM_DATABASE_URL, the tables' owner). Only for the few things that come before a company
 * is known: signing in, the session lookup, whether an email is taken anywhere, and
 * background jobs that go through each company in turn (with runAsCompany). Never for
 * reading or changing a company's data.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; appPrisma?: PrismaClient };
const log: Prisma.LogLevel[] = process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

// Only named when it's set: while the program is being built online there's no database
// address yet, and Prisma refuses an empty one outright (it's only needed once it runs).
const at = (url: string | undefined): Prisma.PrismaClientOptions => ({ log, ...(url ? { datasources: { db: { url } } } : {}) });

export const systemDb = globalForPrisma.prisma ?? new PrismaClient(at(process.env.SYSTEM_DATABASE_URL ?? process.env.DATABASE_URL));

/** The app's own database login — the database limits it to one company per query. */
const appDb = globalForPrisma.appPrisma ?? new PrismaClient(at(process.env.DATABASE_URL));

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = systemDb;
  globalForPrisma.appPrisma = appDb;
}

/** Tells the database which company this transaction is for. */
const forCompany = (client: { $executeRaw: PrismaClient["$executeRaw"] }, companyId: string) => client.$executeRaw`SELECT set_config('app.company_id', ${companyId}, true)`;

// Inside db.$transaction the company is set once, at the start; queries just run.
const inTransaction = new AsyncLocalStorage<boolean>();

type Data = Record<string, unknown>;
const isObj = (v: unknown): v is Data => !!v && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date) && !(v instanceof Uint8Array) && !Prisma.Decimal.isDecimal(v);
const each = <T>(v: T | T[], fn: (x: T) => T) => (Array.isArray(v) ? v.map(fn) : fn(v));

/** Tags rows created inside `data` (nested create / createMany / connectOrCreate / upsert) with the company. */
function tagNested(data: unknown, companyId: string): unknown {
  if (!isObj(data)) return data;
  const out: Data = { ...data };
  for (const [key, value] of Object.entries(out)) {
    if (!isObj(value)) continue;
    const rel: Data = { ...value };
    let touched = false;
    if ("create" in rel) {
      rel.create = each(rel.create as Data | Data[], (d) => tagRow(d, companyId));
      touched = true;
    }
    if (isObj(rel.createMany) && "data" in rel.createMany) {
      rel.createMany = { ...rel.createMany, data: each(rel.createMany.data as Data | Data[], (d) => tagRow(d, companyId)) };
      touched = true;
    }
    if ("connectOrCreate" in rel) {
      rel.connectOrCreate = each(rel.connectOrCreate as Data | Data[], (c) => ({ ...c, where: { ...(c.where as Data), companyId }, create: tagRow(c.create as Data, companyId) }));
      touched = true;
    }
    if ("upsert" in rel) {
      rel.upsert = each(rel.upsert as Data | Data[], (u) => ({
        ...u,
        ...(u.where ? { where: { ...(u.where as Data), companyId } } : {}),
        create: tagRow(u.create as Data, companyId),
        update: tagNested(u.update, companyId),
      }));
      touched = true;
    }
    if ("update" in rel) {
      rel.update = each(rel.update as Data | Data[], (u) => (isObj(u.data) ? { ...u, ...(u.where ? { where: { ...(u.where as Data), companyId } } : {}), data: tagNested(u.data, companyId) } : (tagNested(u, companyId) as Data)));
      touched = true;
    }
    if (touched) out[key] = rel;
  }
  return out;
}

function tagRow(row: Data, companyId: string): Data {
  return { ...(tagNested(row, companyId) as Data), companyId };
}

const WHERE_OPS = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
  "upsert",
]);

const scoped = appDb.$extends({
  name: "company-gatekeeper",
  query: {
    $allModels: {
      async $allOperations(params) {
        // Counted for the speed alarm (request-stats.ts).
        const t = performance.now();
        try {
          return await gatekeep(params);
        } finally {
          countQuery(performance.now() - t);
        }
      },
    },
  },
});

/** Every company query: scoped to the current company, and tagged with it when written. */
async function gatekeep({ model, operation, args, query }: { model: string; operation: string; args: unknown; query: (args: unknown) => Prisma.PrismaPromise<unknown> }) {
        const companyId = await currentCompanyId();
        const a = { ...(args as Data) };
        if (model === "Company") {
          // The company is one row: yours.
          if (operation === "create" || operation === "createMany" || operation === "createManyAndReturn" || operation.startsWith("delete") || operation === "upsert")
            throw new Error("Companies are created and removed outside a company");
          a.where = { ...(a.where as Data), id: companyId };
          if ("data" in a) a.data = tagNested(a.data, companyId);
          return run(companyId, query(a));
        }
        if (WHERE_OPS.has(operation)) a.where = { ...(a.where as Data), companyId };
        if (operation === "create") a.data = tagRow(a.data as Data, companyId);
        else if (operation === "createMany" || operation === "createManyAndReturn") a.data = each(a.data as Data | Data[], (d) => tagRow(d, companyId));
        else if (operation === "upsert") {
          a.create = tagRow(a.create as Data, companyId);
          a.update = tagNested(a.update, companyId);
        } else if (operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn") {
          const data = tagNested(a.data, companyId) as Data;
          delete data.companyId; // a row never moves to another company
          a.data = data;
        }
        return run(companyId, query(a));
}

/** Runs a query as `companyId` — in its own little transaction that names the company, unless already in one. */
async function run<T>(companyId: string, q: Prisma.PrismaPromise<T>): Promise<T> {
  if (inTransaction.getStore()) return q;
  const [, result] = await appDb.$transaction([forCompany(appDb, companyId), q]);
  return result;
}

export const db = scoped.$extends({
  client: {
    /** A transaction for the current company: the database is told the company once, at the start. */
    async $transaction(arg: unknown, options?: unknown) {
      const companyId = await currentCompanyId();
      if (Array.isArray(arg)) {
        const results = await inTransaction.run(true, () =>
          scoped.$transaction([forCompany(appDb, companyId), ...(arg as Prisma.PrismaPromise<unknown>[])], options as { isolationLevel?: Prisma.TransactionIsolationLevel }),
        );
        return results.slice(1);
      }
      const fn = arg as (tx: unknown) => Promise<unknown>;
      return scoped.$transaction(
        async (tx) => {
          await forCompany(tx, companyId);
          return inTransaction.run(true, () => fn(tx));
        },
        options as { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
      );
    },
  },
}) as unknown as typeof scoped;

export type Db = typeof db;
/** The database inside db.$transaction(async (tx) => …) — the gatekeeper applies there too. */
export type Tx = Omit<Db, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;

import { AsyncLocalStorage } from "async_hooks";
import type { IncomingMessage, ServerResponse } from "http";

/**
 * The speed alarm: every request is timed, with how many database questions it asked and how
 * long they took. One slower than SLOW_REQUEST_MS (default 500 ms) is written to the server's
 * log — online that's Render → builderstation → Logs, search "[slow]" — so a slow page shows
 * up there by itself. Started from instrumentation.ts; db.ts counts the questions.
 */

type Stats = { queries: number; dbMs: number };
// One shared store: the server's startup code and the page code are bundled separately.
const g = globalThis as unknown as { __requestStats?: AsyncLocalStorage<Stats> };
const store = (g.__requestStats ??= new AsyncLocalStorage<Stats>());

/** db.ts: one database question of `ms` was asked for the current request. */
export function countQuery(ms: number) {
  const s = store.getStore();
  if (s) {
    s.queries++;
    s.dbMs += ms;
  }
}

/** Builds the log line (exported for its test). */
export function slowLine(method: string, url: string, ms: number, s: Stats) {
  const path = url.split("?")[0];
  const kind = url.includes("_rsc=") || url.includes("__nextDataReq") ? " (page change)" : "";
  // Database time is added up across questions asked at the same time — it can be more than the page's own time.
  return `[slow] ${method} ${path}${kind} ${Math.round(ms)} ms · ${s.queries} database question${s.queries === 1 ? "" : "s"}, ${Math.round(s.dbMs)} ms of database work added up`;
}

const skip = (url: string) => url.startsWith("/_next/static") || url.startsWith("/_next/image") || url.startsWith("/api/health") || url === "/favicon.ico";

/** Times every request the server handles from here on. */
export async function startSpeedAlarm() {
  const once = globalThis as unknown as { __speedAlarm?: boolean };
  if (once.__speedAlarm) return;
  once.__speedAlarm = true;
  const limit = Number(process.env.SLOW_REQUEST_MS) || 500;
  const http = await import("http");
  const emit = http.Server.prototype.emit as (this: unknown, ...a: unknown[]) => boolean;
  http.Server.prototype.emit = function (this: unknown, event: string | symbol, ...args: unknown[]) {
    if (event !== "request") return emit.call(this, event, ...args);
    const [req, res] = args as [IncomingMessage, ServerResponse];
    const url = req.url ?? "";
    if (skip(url)) return emit.call(this, event, ...args);
    const stats: Stats = { queries: 0, dbMs: 0 };
    const start = performance.now();
    res.once("finish", () => {
      const ms = performance.now() - start;
      if (ms >= limit) console.warn(slowLine(req.method ?? "GET", url, ms, stats));
    });
    return store.run(stats, () => emit.call(this, event, ...args));
  } as typeof http.Server.prototype.emit;
}

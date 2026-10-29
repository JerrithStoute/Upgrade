import "server-only";
import { cookies, headers } from "next/headers";
import { SESSION_COOKIE } from "./auth";
import { unstable_rethrow } from "next/navigation";

/**
 * Form actions that say what's wrong instead of crashing. When an action's check fails
 * ("That email doesn't look right"), the message is handed to the page in a short-lived
 * cookie; <ActionErrorToast> (in the root layout) shows it and keeps what was typed in the
 * form. Redirects and other Next.js signals pass through untouched.
 */

export const FLASH_COOKIE = "upgrade_flash";

/** Errors from the database or the program itself — not something the person typed. */
function isSystemError(e: unknown) {
  const name = e instanceof Error ? e.constructor.name : "";
  return name.startsWith("PrismaClient") || e instanceof TypeError || e instanceof ReferenceError || e instanceof RangeError;
}

export function friendly<A extends unknown[]>(fn: (...args: A) => Promise<unknown>) {
  return async (...args: A): Promise<void> => {
    try {
      await fn(...args);
    } catch (e) {
      unstable_rethrow(e);
      let message: string;
      if (isSystemError(e)) {
        console.error(e);
        // Kept for the Station's Problems tab (the form caught it, so the server's own catch never sees it).
        const { recordServerError } = await import("./problems");
        const store = await cookies();
        await recordServerError(e, (await headers()).get("referer")?.replace(/^https?:\/\/[^/]+/, "") ?? "(a form)", store.get(SESSION_COOKIE)?.value ?? null);
        message = "Something went wrong saving that — nothing was changed. Try again. We were told about it automatically.";
      } else message = e instanceof Error && e.message ? e.message : "Something went wrong — nothing was changed.";
      (await cookies()).set(FLASH_COOKIE, encodeURIComponent(message.slice(0, 600)), { path: "/", maxAge: 60, sameSite: "lax", httpOnly: false });
    }
  };
}

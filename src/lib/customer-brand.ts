import "server-only";
import { cookies } from "next/headers";
import { systemDb } from "./db";
import { firstFree, slugFromName, validSlug } from "./sign-in-slug";

/**
 * Clients and subs see their builder, never The Builder Station: their own sign-in page
 * (/login/<slug>), its name and logo on every sign-in-type page, emails from the builder by name, the
 * builder's name in the browser tab and in their authenticator app.
 *
 * A browser that a client or sub signed in on remembers their builder (HOME_COOKIE), so signing out —
 * or a sign-in that's run out — goes back to the builder's page, not the general one. Links in their
 * emails carry it too (?b=<slug>), for a phone that's never signed in.
 */

export const HOME_COOKIE = "bs_home";
const YEAR = 365 * 24 * 3600;

export type CustomerBrand = { companyId: string; name: string; slug: string; color: string | null; logoUrl: string | null };

const SELECT = { id: true, name: true, brandColor: true, logoPath: true, updatedAt: true, signInSlug: true } as const;
type Row = { id: string; name: string; brandColor: string | null; logoPath: string | null; updatedAt: Date; signInSlug: string | null };

function brandOf(c: Row, slug: string): CustomerBrand {
  return {
    companyId: c.id,
    name: c.name || "Your builder",
    slug,
    color: c.brandColor,
    // Public, like the browser tab's icon (/api/company/logo reads ?c= without a sign-in).
    logoUrl: c.logoPath ? `/api/company/logo?c=${c.id}&v=${c.updatedAt.getTime()}` : null,
  };
}

/** The company's sign-in address — made from its name the first time it's needed. */
export async function ensureSignInSlug(companyId: string): Promise<string> {
  const c = await systemDb.company.findUnique({ where: { id: companyId }, select: { name: true, signInSlug: true } });
  if (!c) throw new Error("No such company");
  if (c.signInSlug) return c.signInSlug;
  const base = slugFromName(c.name);
  const taken = new Set((await systemDb.company.findMany({ where: { signInSlug: { startsWith: base } }, select: { signInSlug: true } })).map((r) => r.signInSlug));
  const slug = firstFree(base, (s) => taken.has(s));
  try {
    await systemDb.company.update({ where: { id: companyId }, data: { signInSlug: slug } });
    return slug;
  } catch {
    // (Two at once took the same one: whichever won is kept.)
    return (await systemDb.company.findUnique({ where: { id: companyId }, select: { signInSlug: true } }))?.signInSlug ?? slug;
  }
}

export async function brandBySlug(slug: string | null | undefined): Promise<CustomerBrand | null> {
  if (!validSlug(slug)) return null;
  const c = await systemDb.company.findUnique({ where: { signInSlug: slug }, select: SELECT });
  return c ? brandOf(c, slug) : null;
}

export async function brandForCompany(companyId: string): Promise<CustomerBrand | null> {
  const c = await systemDb.company.findUnique({ where: { id: companyId }, select: SELECT });
  return c ? brandOf(c, c.signInSlug ?? (await ensureSignInSlug(c.id))) : null;
}

/** A client's or sub's builder; null for a builder's own team (they see The Builder Station). */
export async function brandForPerson(p: { companyId: string; role: string } | null | undefined) {
  return p && (p.role === "CLIENT" || p.role === "VENDOR") ? brandForCompany(p.companyId) : null;
}

/** On sign-in: a client or sub's browser remembers their builder; anyone else's forgets it. */
export async function rememberHome(p: { companyId: string; role: string }) {
  const store = await cookies();
  if (p.role === "CLIENT" || p.role === "VENDOR") {
    store.set(HOME_COOKIE, await ensureSignInSlug(p.companyId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: YEAR });
  } else if (store.get(HOME_COOKIE)) {
    store.set(HOME_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 0 });
  }
}

/** A link for a client or sub: it carries their builder, so signing in on a new phone shows the builder's page. */
export function withBuilder(url: string, slug: string) {
  try {
    const u = new URL(url);
    u.searchParams.set("b", slug);
    return u.toString();
  } catch {
    return url;
  }
}

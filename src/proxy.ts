import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getSessionKey } from "@/lib/session-secret";
import { getStationKey, STATION_COOKIE } from "@/lib/station-key";

const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-bs_session" : "upgrade_session";
// Pages for people not signed in: sign in (and its second step), sign up, forgot / reset
// password, confirm email, accept an invitation, Terms and Privacy, the home-screen app's description, icon, offline page and
// notification worker, a vendor typing prices from their bid's link (the link
// is the key: src/lib/bid-link.ts) — and, on this PC only, the test inbox.
const PUBLIC_PATHS = ["/terms", "/privacy", "/sw.js", "/offline.html", "/api/app-manifest", "/api/app-icon", "/login", "/logout", "/signup", "/forgot", "/reset", "/verify", "/invite", "/prices", "/api/health", "/api/qbwc", "/api/company/logo", ...(process.env.NODE_ENV === "production" ? [] : ["/dev/outbox"])];
// The website (/site). Until it's turned on, its pages show only to someone signed in to the Station
// (src/app/site/layout.tsx) — who may have no builder sign-in at all.
const SITE_PATHS = ["/site"];

// The Builder Station's own pages (its owner and employees — not builders): their own sign-in, apart
// from a builder's (src/lib/station-auth.ts). These are open without one.
const STATION_PUBLIC = ["/station/login", "/station/two-step", "/station/setup"];

async function hasStationSession(req: NextRequest) {
  const token = req.cookies.get(STATION_COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getStationKey());
    return payload.kind === "station";
  } catch {
    return false;
  }
}

async function hasValidSession(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  const key = getSessionKey(); // throws in production if SESSION_SECRET is missing
  try {
    await jwtVerify(token, key);
    return true;
  } catch {
    return false;
  }
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // The owner's pages moved to the Station (its own sign-in).
  if (pathname === "/builders" || pathname.startsWith("/builders/")) {
    const url = req.nextUrl.clone();
    url.pathname = pathname === "/builders/find-area" ? "/station/find-area" : "/station/invites";
    return NextResponse.redirect(url);
  }
  if (pathname === "/station" || pathname.startsWith("/station/")) {
    const open = STATION_PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"));
    if (!open && !(await hasStationSession(req))) {
      const url = req.nextUrl.clone();
      url.pathname = "/station/login";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }
  const isPublic = [...PUBLIC_PATHS, ...SITE_PATHS].some((p) => pathname === p || pathname.startsWith(p + "/"));
  const authed = await hasValidSession(req);

  if (!authed && !isPublic) {
    const url = req.nextUrl.clone();
    // A client's or sub's own builder's sign-in page: named in the link (?b=, from their emails), or
    // remembered by this browser (customer-brand.ts). (The proxy can't use the database: just the shape.)
    const home = [req.nextUrl.searchParams.get("b"), req.cookies.get("bs_home")?.value].find((s) => !!s && /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(s));
    url.searchParams.delete("b");
    url.pathname = home ? `/login/${home}` : "/login";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  // Signed in already: no sign-in page (the general one, or a builder's own).
  if (authed && (pathname === "/login" || /^\/login\/(?!two-step)[a-z0-9-]+$/.test(pathname))) {
    const url = req.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/files|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};

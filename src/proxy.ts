import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { getSessionKey } from "@/lib/session-secret";
import { getStationKey, STATION_COOKIE } from "@/lib/station-key";

const SESSION_COOKIE = process.env.NODE_ENV === "production" ? "__Host-bs_session" : "upgrade_session";
// Pages for people not signed in: sign in (and its second step), sign up, forgot / reset
// password, confirm email, accept an invitation — and, on this PC only, the test inbox.
const PUBLIC_PATHS = ["/login", "/logout", "/signup", "/forgot", "/reset", "/verify", "/invite", "/api/health", "/api/qbwc", "/api/company/logo", ...(process.env.NODE_ENV === "production" ? [] : ["/dev/outbox"])];
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
    url.pathname = "/login";
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  if (authed && pathname === "/login") {
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

import { notFound } from "next/navigation";
import { HardHat } from "lucide-react";
import Link from "@/components/link";
import { getCurrentUser } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/builder-invites";
import { siteIsLive } from "@/lib/site";

export const metadata = {
  title: { default: "The Builder Station — takeoffs, estimates and schedules for home builders", template: "%s · The Builder Station" },
  description: "One program from plans to closeout: takeoffs, estimates, schedules, budgets, purchasing and a client portal. Unlimited users, no contract.",
};

// The website is always The Builder Station's own blue — a signed-in company's color
// (src/lib/brand.ts) would otherwise repaint it.
const OWN_BLUE: React.CSSProperties = Object.fromEntries(
  Object.entries({
    50: "97% 0.014 254.604",
    100: "93.2% 0.032 255.585",
    200: "88.2% 0.059 254.128",
    300: "80.9% 0.105 251.813",
    400: "70.7% 0.165 254.624",
    500: "62.3% 0.214 259.815",
    600: "54.6% 0.245 262.881",
    700: "48.8% 0.243 264.376",
    800: "42.4% 0.199 265.638",
    900: "37.9% 0.146 265.522",
    950: "28.2% 0.091 267.935",
  }).map(([k, v]) => [`--color-blue-${k}`, `oklch(${v})`]),
);

/** The public website. Until SITE_LIVE=1 only the platform owner sees it (src/lib/site.ts). */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const live = siteIsLive();
  if (!live) {
    const me = await getCurrentUser();
    if (!isPlatformAdmin(me?.email)) notFound();
  }
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900" style={OWN_BLUE}>
      {live ? null : (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          <b>Preview</b> — only you can see this. It goes public when the website is turned on.{" "}
          <Link href="/builders" className="underline">
            Back to the program
          </Link>
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/site" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-blue-700 text-white">
              <HardHat className="h-5 w-5" />
            </span>
            <span className="hidden sm:inline">The Builder Station</span>
          </Link>
          <div className="ml-auto flex items-center gap-1 whitespace-nowrap text-sm sm:gap-2">
            <Link href="/site/features" className="hidden rounded-md px-3 py-2 text-slate-700 hover:text-slate-950 sm:inline-block">
              Features
            </Link>
            <Link href="/site/pricing" className="hidden rounded-md px-3 py-2 text-slate-700 hover:text-slate-950 sm:inline-block">
              Pricing
            </Link>
            <Link href="/login" className="rounded-md px-2 py-2 text-slate-700 hover:text-slate-950 sm:px-3">
              Sign in
            </Link>
            <Link href="/site/request-invite" className="rounded-md bg-blue-700 px-3 py-2 font-medium text-white hover:bg-blue-800">
              Request an invite
            </Link>
          </div>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-slate-600 sm:flex-row sm:items-center sm:px-6">
          <div className="flex items-center gap-2 font-medium text-slate-800">
            <span className="grid h-6 w-6 place-items-center rounded bg-blue-700 text-white">
              <HardHat className="h-4 w-4" />
            </span>
            The Builder Station
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2 sm:ml-auto">
            <Link href="/site/features" className="hover:text-slate-900">
              Features
            </Link>
            <Link href="/site/pricing" className="hover:text-slate-900">
              Pricing
            </Link>
            <Link href="/site/request-invite" className="hover:text-slate-900">
              Request an invite
            </Link>
            <Link href="/site/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <Link href="/site/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
            <span>© {new Date().getFullYear()} The Builder Station</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

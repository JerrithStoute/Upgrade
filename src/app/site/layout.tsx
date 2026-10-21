import { notFound } from "next/navigation";
import { StationLine } from "@/components/station-logo";
import { STATION_SHADES } from "@/lib/brand";
import Link from "@/components/link";
import { getStationUser } from "@/lib/station-auth";
import { siteIsLive } from "@/lib/site";

export const metadata = {
  title: { default: "The Builder Station — takeoffs, estimates and schedules for home builders", template: "%s · The Builder Station" },
  description: "One program from plans to closeout: takeoffs, estimates, schedules, budgets, purchasing and a client portal. Unlimited users, no contract.",
};

// The website is always in The Builder Station's own colors — a signed-in company's color
// (src/lib/brand.ts) would otherwise repaint it.
const OWN_BLUE: React.CSSProperties = Object.fromEntries(Object.entries(STATION_SHADES).map(([k, v]) => [`--color-blue-${k}`, v]));

/** The public website. Until SITE_LIVE=1 only the Station's people see it (src/lib/site.ts). */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const live = siteIsLive();
  if (!live) {
    // Until it's turned on, only the people who run the Station see it.
    if (!(await getStationUser())) notFound();
  }
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900" style={OWN_BLUE}>
      {live ? null : (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm text-amber-900">
          <b>Preview</b> — only you can see this. It goes public when the website is turned on.{" "}
          <Link href="/station/invites" className="underline">
            Back to the program
          </Link>
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Link href="/site" className="flex items-center" aria-label="The Builder Station — home">
            <StationLine size={34} hideNameOnPhones />
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
          <StationLine size={26} />
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

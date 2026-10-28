import { StationLine } from "@/components/station-logo";
import { STATION_SHADES } from "@/lib/brand";
import Link from "@/components/link";

// The Builder Station's own colors, like the website (a signed-in company's color would repaint it).
const OWN_BLUE: React.CSSProperties = Object.fromEntries(Object.entries(STATION_SHADES).map(([k, v]) => [`--color-blue-${k}`, v]));

/**
 * Terms and Privacy at their own addresses (/terms, /privacy), open to everyone — Intuit, Stripe and
 * anyone signing up need to read them, before the rest of the website (/site) is turned on.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-slate-900" style={OWN_BLUE}>
      <header className="border-b border-slate-200">
        <nav className="mx-auto flex h-16 max-w-3xl items-center gap-4 px-4 sm:px-6">
          <StationLine size={30} hideNameOnPhones />
          <div className="ml-auto flex items-center gap-4 text-sm text-slate-600">
            <Link href="/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
          </div>
        </nav>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}

import { LogOut } from "lucide-react";
import { requireStation } from "@/lib/station-auth";
import { StationLine } from "@/components/station-logo";
import { stationSignOut } from "../(auth)/actions";
import { StationTabs } from "./tabs";

/**
 * The Builder Station's own pages — for the people who run it (owner and staff), signed in at
 * /station/login. Nothing here is any builder's: the builder side (and JT&I) never sees it.
 */
export default async function StationLayout({ children }: { children: React.ReactNode }) {
  const me = await requireStation();
  return (
    <div className="flex min-h-screen flex-1 flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <StationLine size={28} hideNameOnPhones />
          <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Station</span>
          <span className="ml-auto text-sm text-slate-600">
            {me.name} · {me.role === "OWNER" ? "Owner" : "Staff"}
          </span>
          <form action={stationSignOut}>
            <button type="submit" className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 hover:text-slate-900">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </form>
        </div>
        <div className="mx-auto max-w-6xl px-4">
          <StationTabs owner={me.role === "OWNER"} />
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

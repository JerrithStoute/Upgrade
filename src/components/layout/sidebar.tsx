"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { LayoutDashboard, FolderKanban, Users, CalendarDays, CheckSquare, Receipt, Settings, ChevronLeft, ChevronRight, Pin, PinOff, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";

const NAV: { href: string; label: string; icon: LucideIcon; adminOnly?: boolean }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/todos", label: "To-Dos", icon: CheckSquare },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
];

/** The takeoff drawing screen (/projects/<id>/takeoff/<planId>), where the menu tucks away to give the plan room. */
export function isPlanViewer(pathname: string) {
  const m = pathname.match(/^\/projects\/[^/]+\/takeoff\/([^/]+)$/);
  return !!m && m[1] !== "materials" && m[1] !== "rebid";
}

// "Keep the menu open on the drawing screen", remembered per browser.
const PIN_KEY = "takeoff.menuPinned";
const PIN_EVENT = "takeoff-menu-pin";
function readPinned() {
  try {
    return localStorage.getItem(PIN_KEY) === "1";
  } catch {
    return false;
  }
}
function writePinned(on: boolean) {
  try {
    localStorage.setItem(PIN_KEY, on ? "1" : "0");
  } catch {
    /* storage blocked: just this page */
  }
  window.dispatchEvent(new Event(PIN_EVENT));
}
function subscribePinned(cb: () => void) {
  window.addEventListener(PIN_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PIN_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function SidebarContent({ role, companyName, logoUrl, pathname, extra }: { role: string; companyName: string; logoUrl: string | null; pathname: string; extra?: React.ReactNode }) {
  return (
    <>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-4">
        <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-2" title={companyName}>
          <BrandMark logoUrl={logoUrl} />
          {logoUrl ? null : (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">Upgrade</span>
              <span className="block truncate text-xs text-slate-500">{companyName}</span>
            </span>
          )}
        </Link>
        {extra}
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.filter((n) => !n.adminOnly || role === "ADMIN").map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              <item.icon className={cn("h-4 w-4", active ? "text-blue-700" : "text-slate-400")} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function Sidebar({ role, companyName, logoUrl }: { role: string; companyName: string; logoUrl: string | null }) {
  const pathname = usePathname();
  const pinned = useSyncExternalStore(subscribePinned, readPinned, () => false);
  // Open over the plan for this page only; going anywhere else closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const tucked = isPlanViewer(pathname) && !pinned;
  const open = tucked && openOn === pathname;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenOn(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (tucked)
    return (
      <>
        {/* The hook: a tab on the left edge that pulls the menu out over the plan. */}
        <button
          type="button"
          onClick={() => setOpenOn(pathname)}
          className="no-print fixed left-0 top-1/2 z-40 hidden h-20 w-4 -translate-y-1/2 items-center justify-center rounded-r-lg border border-l-0 border-slate-300 bg-white text-slate-500 shadow-md transition-all hover:w-6 hover:bg-blue-50 hover:text-blue-700 md:flex"
          title="Show the menu (Dashboard, Projects, Clients…)"
          aria-label="Show the menu"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {open ? (
          <>
            <div className="no-print fixed inset-0 z-40 hidden bg-slate-900/10 md:block" onClick={() => setOpenOn(null)} aria-hidden />
            <aside className="no-print fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r border-slate-200 bg-white shadow-2xl md:flex">
              <SidebarContent
                role={role}
                companyName={companyName}
                logoUrl={logoUrl}
                pathname={pathname}
                extra={
                  <span className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => writePinned(true)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Keep the menu open on the drawing screen"
                      aria-label="Keep the menu open"
                    >
                      <Pin className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setOpenOn(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Hide the menu">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  </span>
                }
              />
            </aside>
          </>
        ) : null}
      </>
    );

  return (
    <aside className="no-print sticky top-0 z-20 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white md:flex">
      <SidebarContent
        role={role}
        companyName={companyName}
        logoUrl={logoUrl}
        pathname={pathname}
        extra={
          isPlanViewer(pathname) ? (
            <button
              type="button"
              onClick={() => writePinned(false)}
              className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              title="Tuck the menu away on the drawing screen"
              aria-label="Tuck the menu away"
            >
              <PinOff className="h-4 w-4" />
            </button>
          ) : null
        }
      />
    </aside>
  );
}

/** The page body: full width on the drawing screen, a comfortable reading width everywhere else. */
export function AppMain({ children }: { children: React.ReactNode }) {
  const wide = isPlanViewer(usePathname());
  return (
    <main className={cn("flex-1 px-4", wide ? "pb-20 pt-4 md:px-5 md:pb-3" : "pb-20 pt-6 md:px-8 md:pb-8")}>
      <div className={cn("mx-auto w-full", !wide && "max-w-7xl")}>{children}</div>
    </main>
  );
}

export function MobileNav({ role }: { role: string }) {
  const pathname = usePathname();
  return (
    <nav className="no-print fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white md:hidden">
      {NAV.filter((n) => !n.adminOnly || role === "ADMIN")
        .slice(0, 5)
        .map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-blue-800" : "text-slate-500")}>
              <item.icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
    </nav>
  );
}

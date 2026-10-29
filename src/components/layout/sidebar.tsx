"use client";

import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  LayoutDashboard,
  FolderKanban,
  Users,
  CalendarDays,
  CheckSquare,
  Clock,
  Receipt,
  BarChart3,
  Boxes,
  Target,
  House,
  FileInput,
  Settings,
  ChevronLeft,
  ChevronRight,
  Pin,
  PinOff,
  Menu,
  X,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/brand-mark";

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Target },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/spec", label: "Spec homes", icon: House },
  { href: "/clients", label: "Clients", icon: Users },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/todos", label: "To-Dos", icon: CheckSquare },
  { href: "/warranty", label: "Warranty", icon: ShieldCheck },
  { href: "/time", label: "Time clock", icon: Clock },
  { href: "/invoices", label: "Invoices", icon: Receipt },
  { href: "/bills", label: "Bills", icon: FileInput },
  { href: "/inventory", label: "Inventory", icon: Boxes },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/settings", label: "Settings", icon: Settings },
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

function SidebarContent({
  allowed,
  companyName,
  logoUrl,
  pathname,
  extra,
}: {
  /** The pages this person's position shows (src/lib/access.ts navPages). */
  allowed: string[];
  companyName: string;
  logoUrl: string | null;
  pathname: string;
  extra?: React.ReactNode;
}) {
  return (
    <>
      {/* A logo of any shape sits centered in the corner, up to 64px tall — easy to see, not overpowering. */}
      <div className={cn("flex shrink-0 items-center gap-2 border-b border-slate-200 px-4", logoUrl ? "h-[5.5rem]" : "h-14")}>
        <Link href="/dashboard" className={cn("flex h-full min-w-0 flex-1 items-center gap-2", logoUrl && "justify-center py-3")} title={companyName}>
          <BrandMark logoUrl={logoUrl} className={logoUrl ? "max-h-full max-w-full" : undefined} />
          {logoUrl ? null : (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">The Builder Station</span>
              <span className="block truncate text-xs text-slate-500">{companyName}</span>
            </span>
          )}
        </Link>
        {extra}
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.filter((n) => allowed.includes(n.href)).map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-blue-50 text-blue-800 shadow-[inset_3px_0_0_var(--color-blue-400)]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
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

export function Sidebar({
  allowed,
  companyName,
  logoUrl,
  menu = "light",
}: {
  allowed: string[];
  companyName: string;
  logoUrl: string | null;
  /** The company's menu look (brand-style.ts): light, or in its main color. */
  menu?: "light" | "brand";
}) {
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
            <aside data-menu={menu} className="no-print fixed inset-y-0 left-0 z-50 hidden w-60 flex-col border-r border-slate-200 bg-white shadow-2xl md:flex">
              <SidebarContent
                allowed={allowed}
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
    <aside data-menu={menu} className="no-print sticky top-0 z-20 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white md:flex">
      <SidebarContent
        allowed={allowed}
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
      {/* No width cap on paper: a full-size (36") plan sheet uses the whole page. */}
      <div className={cn("mx-auto w-full print:max-w-none", !wide && "max-w-7xl")}>{children}</div>
    </main>
  );
}

/** The phone menu bar: the field's everyday pages, and More for everything else. */
const PHONE_BAR = ["/time", "/projects", "/schedule", "/todos"];

export function MobileNav({ allowed }: { allowed: string[] }) {
  const pathname = usePathname();
  const [moreOn, setMoreOn] = useState<string | null>(null); // open on this page only
  const more = moreOn === pathname;
  const items = NAV.filter((n) => allowed.includes(n.href));
  const isOn = (href: string) => pathname === href || pathname.startsWith(href + "/");
  const bar = PHONE_BAR.map((h) => items.find((n) => n.href === h)).filter((n): n is (typeof NAV)[number] => !!n);
  const rest = items.filter((n) => !PHONE_BAR.includes(n.href));
  const moreActive = rest.some((n) => isOn(n.href));
  const tab = (active: boolean) =>
    cn("flex flex-1 flex-col items-center gap-0.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-[11px]", active ? "text-blue-800" : "text-slate-500");

  return (
    <>
      {more ? (
        <>
          <div className="no-print fixed inset-0 z-30 bg-slate-900/30 md:hidden" onClick={() => setMoreOn(null)} aria-hidden />
          <nav className="no-print fixed inset-x-0 bottom-0 z-40 rounded-t-2xl bg-white pb-[calc(4.5rem+env(safe-area-inset-bottom))] shadow-2xl md:hidden" aria-label="More pages">
            <span className="mx-auto mt-2 block h-1 w-10 rounded-full bg-slate-300" aria-hidden />
            <ul className="grid grid-cols-3 gap-1 p-3">
              {rest.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setMoreOn(null)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl px-2 py-3 text-xs font-medium",
                      isOn(item.href) ? "bg-blue-50 text-blue-800" : "text-slate-700 active:bg-slate-100",
                    )}
                  >
                    <item.icon className={cn("h-6 w-6", isOn(item.href) ? "text-blue-700" : "text-slate-500")} />
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </>
      ) : null}
      <nav className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white md:hidden">
        {bar.map((item) => (
          <Link key={item.href} href={item.href} className={tab(!more && isOn(item.href))}>
            <item.icon className="h-5 w-5" />
            {item.href === "/time" ? "Clock" : item.label}
          </Link>
        ))}
        <button type="button" onClick={() => setMoreOn(more ? null : pathname)} className={tab(more || moreActive)} aria-expanded={more}>
          {more ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          More
        </button>
      </nav>
    </>
  );
}

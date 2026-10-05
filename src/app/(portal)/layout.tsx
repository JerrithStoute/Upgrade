import { Suspense } from "react";
import Link from "next/link";
import { Eye, LogOut } from "lucide-react";
import { closeClientView } from "@/app/(app)/projects/[id]/client-view-actions";
import { BrandMark } from "@/components/brand-mark";
import { getBrand } from "@/lib/company-brand";
import { requireClient } from "@/lib/auth";
import { db } from "@/lib/db";
import { Avatar } from "@/components/ui/avatar";
import { PortalNav } from "@/components/portal/nav";

export const metadata = { title: "Client Portal" };

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();
  const company = await db.company.findFirst();
  const brand = await getBrand();
  const companyName = company?.name ?? "Your Builder";

  return (
    <div className="flex min-h-screen flex-col">
      {user.preview ? (
        // Client view: always on screen, always a way back.
        <div className="no-print sticky top-0 z-20 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 bg-indigo-700 px-4 py-2 text-sm text-white shadow">
          <span className="flex items-center gap-1.5">
            <Eye className="h-4 w-4" />
            <span>
              <b>Client view</b> — you&apos;re seeing {user.name}&apos;s portal exactly as they do. Nothing you do here is saved.
            </span>
          </span>
          <form action={closeClientView}>
            <button type="submit" className="rounded-md bg-white px-3 py-1 text-xs font-semibold text-indigo-800 hover:bg-indigo-50">
              ← Back to my view
            </button>
          </form>
        </div>
      ) : null}
      <header className={`no-print sticky ${user.preview ? "top-10" : "top-0"} z-10 border-b border-slate-200 bg-white/95 backdrop-blur`}>
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 md:px-6">
          <Link href="/portal" className="flex min-w-0 items-center gap-2">
            <BrandMark logoUrl={brand.logoUrl} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-slate-900">{companyName}</span>
              <span className="block text-xs text-slate-500">Client Portal</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-2">
              <Avatar name={user.name} />
              <p className="hidden max-w-[200px] truncate text-sm font-medium text-slate-900 sm:block">{user.name}</p>
            </div>
            {user.preview ? null : (
              <form action="/logout" method="post">
                <button type="submit" className="flex items-center gap-1.5 rounded-md px-2 py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800" title="Sign out">
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </form>
            )}
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 md:px-6">
          <Suspense fallback={<div className="h-10" />}>
            <PortalNav />
          </Suspense>
        </div>
      </header>
      <main className="flex-1 px-4 py-6 md:px-6 md:py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
      <footer className="no-print border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">
        {companyName}
        {company?.phone ? ` · ${company.phone}` : ""}
        {company?.email ? ` · ${company.email}` : ""}
        {company?.licenseNumber ? ` · License ${company.licenseNumber}` : ""}
      </footer>
    </div>
  );
}

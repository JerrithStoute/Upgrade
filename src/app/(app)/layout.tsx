import { requireStaff } from "@/lib/auth";
import { db, systemDb } from "@/lib/db";
import { readStatus, trialNote } from "@/lib/builder-status";
import { AppMain, Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getBrand } from "@/lib/company-brand";
import { navPages } from "@/lib/access";
import { ViewOnly } from "@/components/layout/view-only";
import { workScreenCss } from "@/lib/brand-style";
import { providerOf } from "@/lib/mailbox";

/** Today (a function, so the layout itself stays free of the clock). */
const nowDate = () => new Date();

const MENU = ["/dashboard", "/leads", "/projects", "/spec", "/directory", "/schedule", "/todos", "/warranty", "/time", "/invoices", "/bills", "/inventory", "/reports", "/catalog", "/settings"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const [company, brand, standing, mailbox] = await Promise.all([
    db.company.findFirst(),
    getBrand(),
    // Where the company stands with The Builder Station — only its status and trial date, never the Station's notes.
    user.role === "ADMIN" ? systemDb.stationBuilder.findUnique({ where: { companyId: user.companyId }, select: { status: true, trialEndsAt: true } }) : null,
    // Their own Gmail / Outlook stopped working (mailbox.ts): said on every page until they reconnect, so nothing goes unnoticed.
    db.mailbox.findUnique({ where: { userId: user.id }, select: { brokenAt: true, provider: true } }).catch(() => null),
  ]);
  const trial = standing ? trialNote(readStatus(standing.status), standing.trialEndsAt, nowDate()) : null;
  const allowed = navPages(user.role, user.access, MENU);
  // The company's look for the work screens (highlight color, Soft, dimmed plans) — the same for everyone on the team.
  const screenCss = workScreenCss(brand.style);
  return (
    <div className="flex min-h-screen shrink-0">
      {screenCss ? <style dangerouslySetInnerHTML={{ __html: screenCss }} /> : null}
      <Sidebar allowed={allowed} companyName={company?.name ?? "Your Company"} logoUrl={brand.logoUrl} menu={brand.style.menu} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} title={company?.name} />
        <AppMain>
          {trial ? <div className="no-print mb-4 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">{trial}</div> : null}
          {mailbox?.brokenAt ? (
            <div className="no-print mb-4 flex flex-wrap items-center gap-2 rounded-md bg-amber-50 px-4 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
              <span className="flex-1">Your {providerOf(mailbox.provider).label} needs reconnecting. Emails you send go from The Builder Station until then.</span>
              <a href={`/api/mailbox/${providerOf(mailbox.provider).route}/connect`} className="rounded-md bg-blue-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-800">
                Reconnect
              </a>
            </div>
          ) : null}
          <ViewOnly access={user.access} />
          {children}
        </AppMain>
      </div>
      <MobileNav allowed={allowed} />
    </div>
  );
}

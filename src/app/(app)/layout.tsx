import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppMain, Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getBrand } from "@/lib/company-brand";
import { navPages } from "@/lib/access";
import { ViewOnly } from "@/components/layout/view-only";

const MENU = ["/dashboard", "/leads", "/projects", "/spec", "/clients", "/schedule", "/todos", "/time", "/invoices", "/bills", "/inventory", "/reports", "/settings"];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const [company, brand] = await Promise.all([db.company.findFirst(), getBrand()]);
  const allowed = navPages(user.role, user.access, MENU);
  return (
    <div className="flex min-h-screen shrink-0">
      <Sidebar allowed={allowed} companyName={company?.name ?? "Your Company"} logoUrl={brand.logoUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} title={company?.name} />
        <AppMain>
          <ViewOnly access={user.access} />
          {children}
        </AppMain>
      </div>
      <MobileNav allowed={allowed} />
    </div>
  );
}

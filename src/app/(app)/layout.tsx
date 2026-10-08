import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppMain, Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { getBrand } from "@/lib/company-brand";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const [company, brand] = await Promise.all([db.company.findFirst(), getBrand()]);
  return (
    <div className="flex min-h-screen shrink-0">
      <Sidebar role={user.role} reports={user.canSeeReports} companyName={company?.name ?? "Your Company"} logoUrl={brand.logoUrl} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} title={company?.name} />
        <AppMain>{children}</AppMain>
      </div>
      <MobileNav role={user.role} reports={user.canSeeReports} />
    </div>
  );
}

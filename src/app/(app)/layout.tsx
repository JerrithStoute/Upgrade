import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppMain, Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const company = await db.company.findFirst();
  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} companyName={company?.name ?? "Your Company"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} title={company?.name} />
        <AppMain>{children}</AppMain>
      </div>
      <MobileNav role={user.role} />
    </div>
  );
}

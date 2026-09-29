import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar, MobileNav } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  const company = await db.company.findFirst();
  return (
    <div className="flex min-h-screen">
      <Sidebar role={user.role} companyName={company?.name ?? "Your Company"} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar user={user} title={company?.name} />
        <main className="flex-1 px-4 py-6 pb-20 md:px-8 md:pb-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
      <MobileNav role={user.role} />
    </div>
  );
}

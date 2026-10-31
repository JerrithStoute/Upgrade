import { requireStaff } from "@/lib/auth";
import { directoryTabs } from "@/lib/directory";
import { DirectoryTabs } from "@/components/directory-tabs";

/** The Directory: Clients · Subs & vendors · Team, one tab bar over each. Each page checks who may open it. */
export default async function DirectoryLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return (
    <div>
      <DirectoryTabs tabs={directoryTabs(user.role, user.access)} />
      {children}
    </div>
  );
}

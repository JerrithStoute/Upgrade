import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { seesSettings } from "@/lib/access";
import { SettingsHeading } from "@/components/settings/settings-heading";

/** Settings: a home page of every setting (grouped), and each page with the way back. Each page checks who may open it. */
export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  if (!seesSettings(user.role, user.access)) redirect("/dashboard");
  return (
    <div>
      <SettingsHeading />
      {children}
    </div>
  );
}

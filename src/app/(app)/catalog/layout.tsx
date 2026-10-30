import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { allows } from "@/lib/access";
import { CatalogHeading } from "@/components/settings/settings-heading";

/** The Catalog: a home page of its lists and templates, and each page with the way back. Each page checks who may open it. */
export default async function CatalogLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  if (user.role !== "ADMIN" && !allows(user.access, "lists", 1)) redirect("/dashboard");
  return (
    <div>
      <CatalogHeading />
      {children}
    </div>
  );
}

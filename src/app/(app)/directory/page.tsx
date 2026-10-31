import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth";
import { directoryTabs } from "@/lib/directory";

/** The menu's Directory: its first tab this person may open. */
export default async function DirectoryPage() {
  const user = await requireStaff();
  redirect(directoryTabs(user.role, user.access)[0]);
}

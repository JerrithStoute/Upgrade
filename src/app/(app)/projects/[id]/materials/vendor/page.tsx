import { redirect } from "next/navigation";
import { requireView } from "@/lib/auth";

/** "For a vendor" became Send to vendors (the job's bids page). */
export default async function VendorMaterialListPage({ params }: { params: Promise<{ id: string }> }) {
  await requireView("takeoffs");
  const { id } = await params;
  redirect(`/projects/${id}/bids`);
}

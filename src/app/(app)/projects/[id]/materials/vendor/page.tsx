import { redirect } from "next/navigation";

/** "For a vendor" became Send to vendors (the job's bids page). */
export default async function VendorMaterialListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}/bids`);
}

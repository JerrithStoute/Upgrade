import { redirect } from "next/navigation";

/** Old link: a client is edited right on their page now. */
export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/clients/${id}?edit=1`);
}

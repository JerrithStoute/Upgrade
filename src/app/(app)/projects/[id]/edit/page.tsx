import { redirect } from "next/navigation";

/** Old link: a job's details are edited right on its Overview now. */
export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}?edit=1`);
}

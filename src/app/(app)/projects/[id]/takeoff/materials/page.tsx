import { redirect } from "next/navigation";

/** The material list moved to its own project tab; old links land there. */
export default async function OldMaterialListPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const q = new URLSearchParams(await searchParams).toString();
  redirect(`/projects/${id}/materials${q ? `?${q}` : ""}`);
}

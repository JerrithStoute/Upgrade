import { MapPin } from "lucide-react";
import { requireVendor } from "@/lib/auth";
import { db } from "@/lib/db";
import { siteAddressOf } from "@/lib/job-site";
import { EmptyState } from "@/components/ui";
import { JobsMap } from "@/components/maps/jobs-map";
import { Directions } from "@/components/maps/directions";

export const metadata = { title: "Jobs" };

/** The jobs the builder picked this sub / vendor to see: where each one is, and directions from where they are. */
export default async function VendorJobsPage() {
  const user = await requireVendor();
  const rows = await db.projectVendor.findMany({
    where: { vendorId: user.vendorId, project: { status: { notIn: ["COMPLETED", "CANCELLED"] } } },
    include: { project: { select: { id: true, name: true, address: true, city: true, state: true, zip: true, siteLat: true, siteLng: true } } },
    orderBy: { project: { name: "asc" } },
  });
  const jobs = rows.map((r) => r.project);
  const pinned = jobs.filter((j) => j.siteLat != null && j.siteLng != null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Jobs</h1>
        <p className="text-sm text-slate-500">Where each job is. Directions start from where you are, in your phone&apos;s maps app.</p>
      </div>
      {jobs.length === 0 ? (
        <EmptyState icon={MapPin} title="No jobs shared with you yet" description="Your builder picks which jobs you see here." />
      ) : (
        <>
          {pinned.length ? <JobsMap className="h-80" pins={pinned.map((j) => ({ id: j.id, name: j.name, address: siteAddressOf(j), lat: j.siteLat!, lng: j.siteLng! }))} /> : null}
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm">
            {jobs.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block font-medium text-slate-900">{j.name}</span>
                  <span className="block text-sm text-slate-500">{siteAddressOf(j) || "Address not set yet — ask the builder"}</span>
                </span>
                <Directions to={{ lat: j.siteLat, lng: j.siteLng, address: siteAddressOf(j) }} />
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

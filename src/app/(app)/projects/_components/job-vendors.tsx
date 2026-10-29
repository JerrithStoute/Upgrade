import { Card, CardBody, CardHeader, SubmitButton } from "@/components/ui";

/**
 * Which subs and vendors see this job in their portal (its address on a map, and directions to
 * it). Picked by hand; the ones with a portal login are marked — the rest see it once they have one.
 */
export function JobVendors({
  action,
  vendors,
  picked,
}: {
  action: (fd: FormData) => Promise<void>;
  vendors: { id: string; name: string; hasLogin: boolean }[];
  picked: string[];
}) {
  return (
    <Card>
      <CardHeader title="Subs & vendors who see where this job is" description="In their portal, under Jobs: the address, a map, and directions from where they are." />
      <CardBody>
        {vendors.length ? (
          <form action={action} className="space-y-3">
            <div className="grid grid-cols-1 gap-x-5 gap-y-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
              {vendors.map((v) => (
                <label key={v.id} className="flex items-center gap-1.5">
                  <input type="checkbox" name="vendorIds" value={v.id} defaultChecked={picked.includes(v.id)} className="h-4 w-4 rounded border-slate-300" />
                  <span className="min-w-0 truncate">{v.name}</span>
                  {v.hasLogin ? null : <span className="shrink-0 text-xs text-slate-400">(no portal login yet)</span>}
                </label>
              ))}
            </div>
            <SubmitButton size="sm">Save</SubmitButton>
          </form>
        ) : (
          <p className="text-sm text-slate-500">No subs or vendors yet — add them in Settings → Vendors.</p>
        )}
      </CardBody>
    </Card>
  );
}

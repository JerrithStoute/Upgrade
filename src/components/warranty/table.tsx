import Link from "@/components/link";
import { cn, fmtDate } from "@/lib/utils";
import { isOpen, warrantyNo } from "@/lib/warranty";
import { WarrantyStatus } from "@/components/warranty/parts";

type Row = {
  id: string;
  number: number;
  title: string;
  location: string | null;
  status: string;
  urgent: boolean;
  scheduledFor: Date | null;
  createdAt: Date;
  fromClient: boolean;
  vendor: { name: string } | null;
  assignee: { name: string } | null;
  project: { id: string; number: number; name: string };
  _count?: { files: number };
};

/** Warranty requests as a compact list — on a job's Warranty tab, and every job's in the menu (`showJob`). Rows narrow with ListFind. */
export function WarrantyTable({ rows, showJob, empty }: { rows: Row[]; showJob?: boolean; empty: string }) {
  if (!rows.length) return <p className="px-4 py-6 text-center text-sm text-slate-500">{empty}</p>;
  return (
    <div className="overflow-x-auto" data-find-group>
      <table className={cn("w-full text-sm", showJob ? "min-w-[44rem]" : "min-w-[36rem]")}>
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
            <th className="px-4 py-2 font-normal">#</th>
            {showJob ? <th className="px-3 py-2 font-normal">Job</th> : null}
            <th className="px-3 py-2 font-normal">What</th>
            <th className="px-3 py-2 font-normal">Status</th>
            <th className="px-3 py-2 font-normal">Who&apos;s fixing it</th>
            <th className="px-4 py-2 font-normal">Reported</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const who = [r.vendor?.name, r.assignee?.name].filter(Boolean).join(" · ");
            const photos = r._count?.files ? `${r._count.files} photo${r._count.files === 1 ? "" : "s"}` : null;
            return (
              <tr
                key={r.id}
                data-find={[warrantyNo(r.number), r.title, r.location, who, showJob ? `#${r.project.number} ${r.project.name}` : null].filter(Boolean).join(" ").toLowerCase()}
                className={cn("border-b border-slate-100 align-top last:border-b-0", !isOpen(r.status) && "text-slate-500")}
              >
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-400">{warrantyNo(r.number)}</td>
                {showJob ? (
                  <td className="px-3 py-2">
                    <Link href={`/projects/${r.project.id}/warranty`} className="hover:underline">
                      #{r.project.number} {r.project.name}
                    </Link>
                  </td>
                ) : null}
                <td className="px-3 py-2">
                  <Link href={`/projects/${r.project.id}/warranty/${r.id}`} className="font-medium text-blue-700 hover:underline">
                    {r.title}
                  </Link>
                  {r.location || photos ? <span className="block text-xs text-slate-500">{[r.location, photos].filter(Boolean).join(" · ")}</span> : null}
                </td>
                <td className="px-3 py-2">
                  <WarrantyStatus status={r.status} urgent={r.urgent} />
                  {r.status === "SCHEDULED" && r.scheduledFor ? <span className="block text-xs text-slate-500">{fmtDate(r.scheduledFor, "EEE, MMM d")}</span> : null}
                </td>
                <td className="px-3 py-2">{who || <span className="text-slate-400">Nobody yet</span>}</td>
                <td className="whitespace-nowrap px-4 py-2 text-xs">
                  {fmtDate(r.createdAt)}
                  <span className="block text-slate-400">{r.fromClient ? "by the client" : "by the team"}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p data-find-none hidden className="px-4 py-3 text-sm text-slate-500">
        None match.
      </p>
    </div>
  );
}

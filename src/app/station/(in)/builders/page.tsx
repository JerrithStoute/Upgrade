import Link from "@/components/link";
import { requireStation } from "@/lib/station-auth";
import { healthFlags, STATUS_LABEL, type BuilderStatus } from "@/lib/builder-status";
import { PageHeader, Stat, Table, TBody, Td, Th, THead, Tr } from "@/components/ui";
import { cn, fmtDate, timeAgo } from "@/lib/utils";
import { builderRows, fmtSize, STATUS_TONE } from "./data";

export const metadata = { title: "Builders" };

const FLAG_TONE = { bad: "text-rose-700", warn: "text-amber-700", info: "text-slate-500" };

const today = () => new Date();

/** Every builder company on The Builder Station: who, where they stand, how much they use it. */
export default async function BuildersPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireStation();
  const { status } = await searchParams;
  const all = await builderRows();
  const now = today();
  const shown = status && status in STATUS_LABEL ? all.filter((b) => b.status === status) : all;
  const count = (s: BuilderStatus) => all.filter((b) => b.status === s).length;
  const needLook = all.filter((b) => healthFlags(b, now).some((f) => f.tone !== "info")).length;
  return (
    <div className="space-y-6">
      <PageHeader title="Builders" description="Every builder company on The Builder Station. Click one for its people, how it uses the program, its status and your notes." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Builders" value={all.length} />
        <Stat label="Active" value={count("ACTIVE")} />
        <Stat label="Trial" value={count("TRIAL")} />
        <Stat label="Free" value={count("FREE")} />
        <Stat label="Worth a look" value={needLook} tone={needLook ? "warn" : "default"} hint="Paused, trial ending, no jobs, no activity in a week" />
      </div>
      <div className="flex flex-wrap gap-2 text-sm">
        {[["", "All"], ...Object.entries(STATUS_LABEL)].map(([k, label]) => (
          <Link
            key={k}
            href={k ? `/station/builders?status=${k}` : "/station/builders"}
            className={cn("rounded-full px-3 py-1 ring-1 ring-inset", (status ?? "") === k ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50")}
          >
            {label}
          </Link>
        ))}
      </div>
      {shown.length ? (
        <Table>
          <THead>
            <tr>
              <Th>Builder</Th>
              <Th>Status</Th>
              <Th>Signed up</Th>
              <Th right>Team</Th>
              <Th right>Jobs</Th>
              <Th right>Files</Th>
              <Th>Last active</Th>
              <Th right>Days active (30)</Th>
              <Th>Worth a look</Th>
            </tr>
          </THead>
          <TBody>
            {shown.map((b) => (
              <Tr key={b.id}>
                <Td>
                  <Link href={`/station/builders/${b.id}`} className="font-medium text-blue-700 hover:underline">
                    {b.name}
                  </Link>
                  <p className="text-xs text-slate-500">{[b.owner?.name, b.where].filter(Boolean).join(" · ")}</p>
                </Td>
                <Td>
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", STATUS_TONE[b.status])}>{STATUS_LABEL[b.status]}</span>
                </Td>
                <Td className="whitespace-nowrap">{fmtDate(b.signedUp)}</Td>
                <Td right>{b.team}</Td>
                <Td right>{b.jobs}</Td>
                <Td right>{fmtSize(b.storage)}</Td>
                <Td className="whitespace-nowrap">
                  <span title={b.lastSignIn ? `Last signed in ${fmtDate(b.lastSignIn)}` : "Never signed in"}>{b.lastActive ? timeAgo(b.lastActive) : "—"}</span>
                </Td>
                <Td right>{b.activeDays} of 30</Td>
                <Td>
                  {healthFlags(b, now).map((f) => (
                    <p key={f.text} className={cn("text-xs", FLAG_TONE[f.tone])}>
                      {f.text}
                    </p>
                  ))}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      ) : (
        <p className="text-sm text-slate-500">None.</p>
      )}
    </div>
  );
}

import Link from "next/link";
import { Plus, Palette } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { getProject } from "@/lib/projects";
import { money, fmtDate, cn } from "@/lib/utils";
import { SELECTION_STATUSES } from "@/lib/constants";
import { Stat, Badge, ButtonLink, Table, THead, TBody, Tr, Th, Td, EmptyState } from "@/components/ui";
import { chosenOption, variance, isSelectionOverdue, PRICED_STATUSES } from "./_helpers";

export default async function SelectionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  await requireStaff();
  const { id } = await params;
  const { status } = await searchParams;
  const project = await getProject(id);
  const all = await db.selection.findMany({
    where: { projectId: project.id },
    include: { options: true },
    orderBy: [{ category: "asc" }, { dueDate: "asc" }, { title: "asc" }],
  });
  const today = new Date();
  const base = `/projects/${project.id}/selections`;

  const totalAllowance = all.reduce((s, x) => s + x.allowance, 0);
  const priced = all.filter((x) => PRICED_STATUSES.includes(x.status));
  const totalSelected = priced.reduce((s, x) => s + (chosenOption(x)?.price ?? 0), 0);
  const netVariance = priced.reduce((s, x) => s + (variance(x) ?? 0), 0);
  const overdue = all.filter((x) => isSelectionOverdue(x, today));

  const filter = status && (SELECTION_STATUSES as readonly string[]).includes(status) ? status : null;
  const list = filter ? all.filter((x) => x.status === filter) : all;
  const groups = new Map<string, typeof list>();
  for (const s of list) groups.set(s.category, [...(groups.get(s.category) ?? []), s]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Total allowances" value={money(totalAllowance, true)} hint={`${all.length} selection${all.length === 1 ? "" : "s"}`} />
        <Stat label="Selected price" value={money(totalSelected, true)} hint={`${priced.length} chosen or later`} />
        <Stat
          label="Net variance"
          value={`${netVariance > 0 ? "+" : ""}${money(netVariance, true)}`}
          tone={netVariance > 0 ? "bad" : netVariance < 0 ? "good" : "default"}
          hint={netVariance > 0 ? "Over allowance" : netVariance < 0 ? "Under allowance" : "On allowance"}
        />
        <Stat label="Overdue" value={overdue.length} tone={overdue.length ? "bad" : "good"} hint="Pending past due date" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={base}
            className={cn("rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset", !filter ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}
          >
            All · {all.length}
          </Link>
          {SELECTION_STATUSES.map((s) => {
            const n = all.filter((x) => x.status === s).length;
            return (
              <Link
                key={s}
                href={`${base}?status=${s}`}
                className={cn("rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset", filter === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}
              >
                {s.charAt(0) + s.slice(1).toLowerCase()} · {n}
              </Link>
            );
          })}
        </div>
        <ButtonLink href={`${base}/new`} size="sm">
          <Plus className="h-3.5 w-3.5" /> New selection
        </ButtonLink>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={Palette}
          title={filter ? `No ${filter.toLowerCase()} selections` : "No selections yet"}
          description="Selections track client choices against allowances — fixtures, finishes, appliances."
          action={
            <ButtonLink href={`${base}/new`} size="sm">
              <Plus className="h-3.5 w-3.5" /> New selection
            </ButtonLink>
          }
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Selection</Th>
              <Th>Location</Th>
              <Th right>Allowance</Th>
              <Th>Chosen option</Th>
              <Th right>Variance</Th>
              <Th>Due</Th>
              <Th>Status</Th>
            </tr>
          </THead>
          <TBody>
            {[...groups.entries()].flatMap(([category, items]) => [
              <tr key={`cat-${category}`} className="bg-slate-50">
                <td colSpan={7} className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  {category} <span className="font-normal text-slate-400">· {items.length}</span>
                </td>
              </tr>,
              ...items.map((s) => {
                const opt = chosenOption(s);
                const v = variance(s);
                const od = isSelectionOverdue(s, today);
                return (
                  <Tr key={s.id}>
                    <Td>
                      <Link href={`${base}/${s.id}`} className="font-medium text-slate-900 hover:underline">
                        {s.title}
                      </Link>
                      {s.options.length ? <span className="ml-2 whitespace-nowrap text-xs text-slate-400">{s.options.length} option{s.options.length === 1 ? "" : "s"}</span> : null}
                    </Td>
                    <Td className="text-slate-500">{s.location ?? "—"}</Td>
                    <Td right>{money(s.allowance)}</Td>
                    <Td>
                      {opt ? (
                        <span>
                          {opt.name} <span className="text-slate-500 tabular-nums">· {money(opt.price)}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Td>
                    <Td right className={cn(v === null ? "text-slate-400" : v > 0 ? "font-medium text-rose-600" : v < 0 ? "font-medium text-emerald-700" : "")}>
                      {v === null ? "—" : `${v > 0 ? "+" : ""}${money(v)}`}
                    </Td>
                    <Td className={cn("whitespace-nowrap", od && "font-medium text-rose-600")}>{fmtDate(s.dueDate)}</Td>
                    <Td>
                      <Badge status={s.status} />
                    </Td>
                  </Tr>
                );
              }),
            ])}
          </TBody>
        </Table>
      )}
    </div>
  );
}

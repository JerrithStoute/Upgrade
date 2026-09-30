import Link from "next/link";
import { Plus, Search, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate } from "@/lib/utils";
import { Badge, Button, ButtonLink, EmptyState, PageHeader, TBody, THead, Table, Td, Th, Tr } from "@/components/ui";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireStaff();
  const { q: rawQ } = await searchParams;
  const q = (rawQ ?? "").trim();

  const clients = await db.client.findMany({
    where: q
      ? {
          OR: [
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { company: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
            { city: { contains: q } },
          ],
        }
      : undefined,
    include: { _count: { select: { projects: true } } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description={`${clients.length} ${q ? "matching" : "total"}`}
        actions={
          <ButtonLink href="/clients/new">
            <Plus className="h-4 w-4" /> New client
          </ButtonLink>
        }
      />

      <form method="get" className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="q" defaultValue={q} placeholder="Search name, company, email, phone or city" className="input pl-9" />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
        {q ? (
          <ButtonLink href="/clients" variant="ghost">
            Clear
          </ButtonLink>
        ) : null}
      </form>

      {clients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? "No clients match" : "No clients yet"}
          description={q ? "Try a different search." : "Add your first client to start a project."}
          action={
            <ButtonLink href="/clients/new">
              <Plus className="h-4 w-4" /> New client
            </ButtonLink>
          }
        />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Name</Th>
              <Th>Company</Th>
              <Th>Email</Th>
              <Th>Phone</Th>
              <Th>City</Th>
              <Th right>Projects</Th>
              <Th>Portal</Th>
              <Th>Created</Th>
            </tr>
          </THead>
          <TBody>
            {clients.map((c) => (
              <Tr key={c.id}>
                <Td>
                  <Link href={`/clients/${c.id}`} className="font-medium text-slate-900 hover:text-blue-700">
                    {c.firstName} {c.lastName}
                  </Link>
                </Td>
                <Td>{c.company ?? <span className="text-slate-400">—</span>}</Td>
                <Td>{c.email ?? <span className="text-slate-400">—</span>}</Td>
                <Td className="whitespace-nowrap">{c.phone ?? <span className="text-slate-400">—</span>}</Td>
                <Td>{[c.city, c.state].filter(Boolean).join(", ") || <span className="text-slate-400">—</span>}</Td>
                <Td right>{c._count.projects}</Td>
                <Td>{c.userId ? <Badge status="CLIENT">Portal</Badge> : <span className="text-slate-400">—</span>}</Td>
                <Td className="whitespace-nowrap">{fmtDate(c.createdAt)}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

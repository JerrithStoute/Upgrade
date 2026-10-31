import { Mail, Phone, Users } from "lucide-react";
import { requireStaff } from "@/lib/auth";
import { db } from "@/lib/db";
import { companyPositions } from "@/lib/positions";
import { ButtonLink, EmptyState, PageHeader, Table, TBody, THead, Td, Th, Tr } from "@/components/ui";

export const metadata = { title: "Team" };

/**
 * Directory → Team: your people and how to reach them. Inviting, positions and what each sees stay in
 * Settings → Team & positions (set once, by an admin) — the link is here for admins.
 */
export default async function TeamDirectoryPage() {
  const user = await requireStaff();
  const positions = await companyPositions();
  const team = await db.user.findMany({
    where: { role: { in: ["ADMIN", "STAFF"] }, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, phone: true, title: true, role: true, positionId: true },
  });
  const positionName = (id: string | null) => positions.find((p) => p.id === id)?.name;
  // People added without a sign-in have a placeholder address.
  const realEmail = (e: string) => (e.endsWith(".invalid") ? null : e);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Team"
        description={`${team.length} ${team.length === 1 ? "person" : "people"} on your team.`}
        actions={
          user.role === "ADMIN" ? (
            <ButtonLink href="/settings/team" variant="secondary">
              Invite, positions & sign-ins
            </ButtonLink>
          ) : null
        }
      />
      {team.length === 0 ? (
        <EmptyState icon={Users} title="No one yet" description="Invite your team in Settings → Team & positions." />
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Name</Th>
              <Th>Position</Th>
              <Th>Phone</Th>
              <Th>Email</Th>
            </tr>
          </THead>
          <TBody>
            {team.map((u) => (
              <Tr key={u.id}>
                <Td className="font-medium text-slate-900">
                  {u.name}
                  {u.title ? <span className="block text-xs font-normal text-slate-500">{u.title}</span> : null}
                </Td>
                <Td className="text-sm text-slate-600">{u.role === "ADMIN" ? "Admin" : (positionName(u.positionId) ?? "Staff")}</Td>
                <Td className="text-sm">
                  {u.phone ? (
                    <a href={`tel:${u.phone}`} className="inline-flex items-center gap-1.5 text-slate-700 hover:text-blue-700">
                      <Phone className="h-3.5 w-3.5 text-slate-400" /> {u.phone}
                    </a>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </Td>
                <Td className="text-sm">
                  {realEmail(u.email) ? (
                    <a href={`mailto:${u.email}`} className="inline-flex items-center gap-1.5 text-slate-700 hover:text-blue-700">
                      <Mail className="h-3.5 w-3.5 text-slate-400" /> {u.email}
                    </a>
                  ) : (
                    <span className="text-slate-400">No sign-in</span>
                  )}
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
